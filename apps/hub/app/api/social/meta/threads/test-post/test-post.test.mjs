import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { POST, GET } from './route.js';
import { createOperatorSessionToken, OPERATOR_SESSION_COOKIE } from '@/lib/operator-session';
import { resolveRouteAccess } from '@/lib/route-access';
import { GORE_THREADS_TEST } from '@/lib/gore-threads-test-contract';

const originalEnv={...process.env},originalFetch=globalThis.fetch;
const url='https://hub.example.com/api/social/meta/threads/test-post';
beforeEach(()=>{
 process.env={NODE_ENV:'production',COM_MOON_HUB_WRITE_SECRET:'synthetic-write-secret',COM_MOON_OPERATOR_SESSION_SECRET:'synthetic-session-secret',
  COM_MOON_OPERATOR_USERNAME:'operator',COM_MOON_OPERATOR_PASSWORD_HASH:`scrypt$131072$8$1$${'a'.repeat(32)}$${'b'.repeat(128)}`,
  COM_MOON_DEFAULT_WORKSPACE_ID:'11111111-1111-1111-1111-111111111111'};
 globalThis.fetch=async()=>assert.fail('no provider/storage network in route guard tests');
});
afterEach(()=>{process.env={...originalEnv};globalThis.fetch=originalFetch;});
const input={action:'execute',jobId:'22222222-2222-2222-2222-222222222222',accountId:'333333333',appId:'444444444',
 bodyHash:GORE_THREADS_TEST.bodyHash,visibility:'public',confirmPublish:true};
const request=(body,headers={})=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
const session=()=>({origin:'https://hub.example.com',cookie:`${OPERATOR_SESSION_COOKIE}=${createOperatorSessionToken()}`});

test('new route is protected by middleware and rejects anonymous/general server writers',async()=>{
 assert.equal(resolveRouteAccess({pathname:new URL(url).pathname,host:'hub.example.com',secretConfigured:true,hasSession:false,allowLoopback:false}).action,'unauthorized');
 assert.ok([401,403].includes((await POST(request(input,{origin:'https://hub.example.com'}))).status));
 const response=await POST(request(input,{'x-com-moon-hub-write-secret':'synthetic-write-secret'}));
 assert.equal(response.status,401);assert.equal((await response.json()).reason,'operator-session-required');
 const cross={...session(),origin:'https://attacker.example','x-com-moon-hub-write-secret':'synthetic-write-secret'};
 assert.equal((await POST(request(input,cross))).status,403);
});
test('even an operator needs exact confirmation, pinned body/account and default-disabled gate',async()=>{
 assert.equal((await POST(request({...input,confirmPublish:false},session()))).status,400);
 assert.equal((await POST(request({...input,workspaceId:'foreign'},session()))).status,400);
 const response=await POST(request(input,session()));assert.equal(response.status,503);
 assert.equal((await response.json()).status,'disabled');assert.match(response.headers.get('cache-control'),/no-store/);
});
test('read-only GET rejects invalid IDs without touching credentials/provider',async()=>{
 assert.equal((await GET(new Request(url+'?jobId=wrong'))).status,400);
});
