import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { createOperatorSessionToken, operatorRecoveryContext, OPERATOR_SESSION_COOKIE, verifyOperatorSessionToken } from './operator-session.js';
import { GET as sessionGET } from '../app/api/operator/session/route.js';
import { POST as taskPOST } from '../app/api/hub/tasks/route.js';
const WORK='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ID='11111111-1111-4111-8111-111111111111';
const originalEnv={...process.env},originalFetch=globalThis.fetch;
beforeEach(()=>{process.env={...originalEnv,NODE_ENV:'production',COM_MOON_OPERATOR_USERNAME:'synthetic-operator',COM_MOON_OPERATOR_PASSWORD_HASH:`scrypt$131072$8$1$${'1'.repeat(32)}$${'2'.repeat(128)}`,COM_MOON_OPERATOR_SESSION_SECRET:'synthetic-test-signing-secret',COM_MOON_DEFAULT_WORKSPACE_ID:WORK,COM_MOON_ENGINE_URL:'https://engine.invalid',COM_MOON_SHARED_WEBHOOK_SECRET:'synthetic-shared-secret'};});
afterEach(()=>{process.env={...originalEnv};globalThis.fetch=originalFetch;});
const request=(path,token,body)=>new Request(`https://hub.invalid${path}`,{method:body?'POST':'GET',headers:{cookie:`${OPERATOR_SESSION_COOKIE}=${token||''}`,origin:'https://hub.invalid','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('logins in the same millisecond have distinct recovery owners and compatible verified sessions',()=>{
  const now=Date.now(),a=createOperatorSessionToken({now}),b=createOperatorSessionToken({now});assert.notEqual(a,b);
  const ca=operatorRecoveryContext(request('/api/operator/session',a),WORK),cb=operatorRecoveryContext(request('/api/operator/session',b),WORK);
  assert.notEqual(ca.ownerKey,cb.ownerKey);assert.match(ca.ownerKey,/^[a-f0-9]{64}$/);assert.equal(verifyOperatorSessionToken(a).ok,true);
});

test('old signed sessions without jti remain supported; credentials or workspace changes change owner',()=>{
  const now=Date.now(),payload=Buffer.from(JSON.stringify({sub:'operator',iat:now,exp:now+60000})).toString('base64url');
  const old=`${payload}.${createHmac('sha256',process.env.COM_MOON_OPERATOR_SESSION_SECRET).update(payload).digest('base64url')}`;
  assert.equal(verifyOperatorSessionToken(old).ok,true);const req=request('/api/operator/session',old),a=operatorRecoveryContext(req,WORK);
  assert.notEqual(operatorRecoveryContext(req,OTHER).ownerKey,a.ownerKey);process.env.COM_MOON_OPERATOR_USERNAME='different-synthetic';assert.notEqual(operatorRecoveryContext(req,WORK).ownerKey,a.ownerKey);
  process.env.COM_MOON_OPERATOR_PASSWORD_HASH=`scrypt$131072$8$1$${'3'.repeat(32)}$${'4'.repeat(128)}`;assert.notEqual(operatorRecoveryContext(req,WORK).ownerKey,a.ownerKey);
});

test('GET exposes only opaque owner, workspace, expiry for an authenticated session and is never cached',async()=>{
  const token=createOperatorSessionToken(),response=await sessionGET(request('/api/operator/session',token)),body=await response.json();
  assert.equal(body.status,'authenticated');assert.deepEqual(Object.keys(body.recovery).sort(),['expiresAt','ownerKey','workspaceId']);assert.equal(body.recovery.workspaceId,WORK);
  assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(JSON.stringify(body),/synthetic-operator|synthetic-test-signing-secret|password|cookie|jti/);
  const anonymous=await(await sessionGET(request('/api/operator/session',''))).json();assert.equal(anonymous.recovery,null);
});

test('matching task assertions pass to Engine without recovery metadata; old authenticated callers still work',async()=>{
  const token=createOperatorSessionToken(),context=operatorRecoveryContext(request('/api/operator/session',token),WORK);let calls=0;
  globalThis.fetch=async(url,{body})=>{assert.equal(url,'https://engine.invalid/api/pms/command');const command=JSON.parse(body);calls++;
    assert.equal(command.action,'create_task');assert.equal(command.workspaceId,WORK);assert.equal(command.recoveryOwner,undefined);assert.equal(command.expectedWorkspaceId,undefined);
    return Response.json({status:'saved',entity:{id:command.id,workspace_id:WORK,title:command.title}},{status:201});};
  for(const extra of [{recoveryOwner:context.ownerKey,expectedWorkspaceId:WORK},{}]){
    const response=await taskPOST(request('/api/hub/tasks',token,{id:ID,title:'합성 서버 검증',...extra}));assert.equal(response.status,201);assert.equal((await response.json()).status,'saved');
  }
  assert.equal(calls,2);
});

for(const type of ['owner','workspace','partial','session']) test(`${type} mismatch fences task write before Engine, even with same-origin`,async()=>{
  const token=createOperatorSessionToken(),context=operatorRecoveryContext(request('/api/operator/session',token),WORK);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected external request');};
  let extra={recoveryOwner:context.ownerKey,expectedWorkspaceId:WORK},currentToken=token;
  if(type==='owner')extra.recoveryOwner='b'.repeat(64);if(type==='workspace')extra.expectedWorkspaceId=OTHER;if(type==='partial')delete extra.expectedWorkspaceId;if(type==='session')currentToken=createOperatorSessionToken();
  const response=await taskPOST(request('/api/hub/tasks',currentToken,{id:ID,title:'합성 서버 검증',...extra}));assert.equal(response.status,409);assert.equal(calls,0);
});

test('non-object commands fail safely before assertion processing or Engine calls',async()=>{
  const token=createOperatorSessionToken();let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
  for(const body of [null,[],true,'invalid']) {
    const req=new Request('https://hub.invalid/api/hub/tasks',{method:'POST',headers:{cookie:`${OPERATOR_SESSION_COOKIE}=${token}`,origin:'https://hub.invalid','content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await taskPOST(req)).status,400);
  }
  assert.equal(calls,0);
});
