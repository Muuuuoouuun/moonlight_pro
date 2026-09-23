import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficeRequest,OFFICE_VERSION} from '@com-moon/agent-contracts/office';
import {readOfficeContext} from '../repositories/office-context.js';
import {callOfficeEngine} from './engine-client.js';
import {createOfficeHubHandler} from './http.js';
const input={ownerId:'flareon',message:'제안서',scope:'personal'};
const request=parseOfficeRequest(input);
const context={source:'provided',scope:'personal',projects:[],note:'입력만 참고'};
const generated={status:'generated',version:OFFICE_VERSION,ownerId:'flareon',mode:'chat',scope:'personal',participants:[],lens:null,simulation:false,answer:'초안',nextAction:'검토',context,model:'test'};
const req=body=>new Request('http://localhost:3100/api/hub/office/chat',{method:'POST',headers:{origin:'http://localhost:3100'},body:JSON.stringify(body)});
test('project reads use server workspace and scope filters; reject mixed returned records',async()=>{
 const result=await readOfficeContext({...request,includeProjects:true},{workspaceId:'server-workspace',read:async(table,opts)=>{
  assert.equal(table,'projects');assert.deepEqual(opts.filters,[['workspace_id','eq.server-workspace'],['meta->>org_scope','eq.personal']]);
  return {configured:true,rows:[{id:'11111111-1111-4111-8111-111111111111',name:'Allowed',status:'active',meta:{org_scope:'personal'}},{id:'22222222-2222-4222-8222-222222222222',name:'Company',status:'active',meta:{org_scope:'classin'}}]};
 }});
 assert.equal(result.source,'partial');assert.deepEqual(result.projects.map(p=>p.name),['Allowed']);
});
test('provided, empty-live, preview and failure remain distinct without broad fallback',async()=>{
 const none=await readOfficeContext(request,{workspaceId:'test',read:async()=>assert.fail('must not query')});assert.equal(none.source,'provided');
 for(const [value,source] of [[{configured:false},'preview'],[{configured:true,rows:[]},'live'],[{configured:true,rows:null,error:{}},'error']]) {
  const result=await readOfficeContext({...request,includeProjects:true},{workspaceId:'test',read:async()=>value});assert.equal(result.source,source);assert.deepEqual(result.projects,[]);
 }
});
test('engine client uses dedicated path and secret; rejects owner/context drift and HTTP errors',async()=>{
 let calls=0;const opts={engineUrl:'http://engine.test',secret:'test-secret',fetcher:async(url,init)=>{calls++;assert.equal(url,'http://engine.test/api/ai/office-chat');assert.equal(init.headers['x-com-moon-shared-secret'],'test-secret');return Response.json(generated);}};
 assert.equal((await callOfficeEngine(request,context,opts)).status,'generated');assert.equal(calls,1);
 for(const data of [{...generated,ownerId:'guru'},{...generated,context:{...context,note:'changed'}},{status:'error'}])assert.equal((await callOfficeEngine(request,context,{...opts,fetcher:async()=>Response.json(data)})).status,'error');
 assert.equal((await callOfficeEngine(request,context,{...opts,fetcher:async()=>Response.json(generated,{status:502})})).status,'error');
 assert.equal((await callOfficeEngine(request,context,{...opts,secret:''})).status,'preview');
});
test('Hub guard runs before generation; browser cannot inject workspace/context/lens/legacy ID',async()=>{
 let calls=0;const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:async()=>{calls++;return generated;},recordRun:async()=>({persisted:true,id:'run'})});
 const denied=await handler(new Request('http://localhost:3100/api/hub/office/chat',{method:'POST',body:JSON.stringify(input)}));assert.ok([401,403].includes(denied.status));
 for(const change of [{workspaceId:'other'},{context:{projects:[]}},{ownerId:'council'},{lens:'jobs'}])assert.equal((await handler(req({...input,...change}))).status,400);
 assert.equal(calls,0);
});
test('Hub rejects missing or stale Engine policy versions instead of relabeling them',async()=>{
 for(const version of [undefined,'2026-09-15.v1']) {
  const writes=[];
  const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:(request,context)=>callOfficeEngine(request,context,{engineUrl:'http://engine.test',secret:'test',fetcher:async()=>Response.json({...generated,version})}),recordRun:async value=>{writes.push(value.result);return {persisted:true};}});
  const response=await handler(req(input));
  // A stale answer is never relabeled or logged as a success; it may be logged only as an error.
  assert.equal(response.status,502);assert.equal((await response.json()).status,'error');assert.deepEqual(writes,['error']);
 }
});
test('generated answer survives failed run logging; no business writes and no legacy agent key',async()=>{
 let seen;const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:async()=>generated,recordRun:async value=>{seen=value;throw new Error('db failed');}});
 const response=await handler(req(input));const data=await response.json();assert.equal(response.status,200);assert.equal(data.status,'generated');assert.equal(data.log.persisted,false);assert.equal(data.businessWrites,false);assert.equal(seen.agent,'office.flareon');
});
test('preview is never logged and an error is logged only as an error with its classification',async()=>{
 const preview=createOfficeHubHandler({readContext:async()=>context,callEngine:async()=>({status:'preview'}),recordRun:async()=>assert.fail('must not log preview')});
 assert.equal((await preview(req(input))).status,202);
 const runs=[];const failure={phase:'review',category:'deadline'};
 const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:async()=>({status:'error',error:'응답이 제한 시간을 넘었습니다.',failure}),recordRun:async value=>{runs.push(value);return {persisted:true,id:'run'};}});
 const response=await handler(req(input));const data=await response.json();
 assert.equal(response.status,502);assert.deepEqual(data.failure,failure);
 assert.equal(runs.length,1);assert.equal(runs[0].result,'error');assert.equal(runs[0].agent,'office.flareon');
 assert.deepEqual(runs[0].recommendation.failure,failure);assert.ok(Number.isInteger(runs[0].recommendation.elapsedMs));
 assert.doesNotMatch(JSON.stringify(runs[0]),/제안서/);
});
test('a generated answer logs latency, model calls and usage but never the request text',async()=>{
 const runs=[];const generation={elapsedMs:18000,modelCalls:2,usage:{promptTokens:100,outputTokens:20,totalTokens:130}};
 const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:async()=>({...generated,generation}),recordRun:async value=>{runs.push(value);return {persisted:true,id:'run'};}});
 assert.equal((await handler(req(input))).status,200);
 assert.equal(runs[0].result,'ok');
 assert.deepEqual({elapsedMs:runs[0].recommendation.elapsedMs,modelCalls:runs[0].recommendation.modelCalls,usage:runs[0].recommendation.usage},generation);
 assert.doesNotMatch(JSON.stringify(runs[0]),/제안서/);
});
test('engine client passes a classified failure and a well-formed generation record',async()=>{
 const opts=(body,status=200)=>({engineUrl:'http://engine.test',secret:'test-secret',fetcher:async()=>Response.json(body,{status})});
 const failed=await callOfficeEngine(request,context,opts({status:'error',error:'raw',failure:{phase:'synthesis',category:'deadline'}},502));
 assert.equal(failed.status,'error');assert.deepEqual(failed.failure,{phase:'synthesis',category:'deadline'});assert.match(failed.error,/제한 시간/);
 const unclassified=await callOfficeEngine(request,context,opts({status:'error',error:'raw',failure:{phase:'x',category:'y'}},502));
 assert.equal(unclassified.status,'error');assert.equal(unclassified.failure,undefined);
 const generation={elapsedMs:10,modelCalls:2,usage:null};
 assert.deepEqual((await callOfficeEngine(request,context,opts({...generated,generation}))).generation,generation);
 assert.equal((await callOfficeEngine(request,context,opts({...generated,generation:{elapsedMs:-1,modelCalls:2,usage:null}}))).generation,undefined);
});

test('project context is capped, strictly UUID validated, and never includes arbitrary metadata',async()=>{
 const rows=Array.from({length:9},(_,i)=>({id:`11111111-1111-4111-8111-11111111111${i}`,name:'Project',status:'active',meta:{org_scope:'personal',secret:'not for model'}}));
 const result=await readOfficeContext({...request,includeProjects:true},{workspaceId:'test',read:async()=>({configured:true,rows})});
 assert.equal(result.projects.length,8);assert.equal(result.source,'partial');assert.ok(!JSON.stringify(result).includes('secret'));
});
test('engine client carries an allow-listed source check to the browser',async()=>{
 const opts=value=>({engineUrl:'http://engine.test',secret:'test-secret',fetcher:async()=>Response.json({...generated,...value})});
 assert.equal((await callOfficeEngine(request,context,opts({sourceCheck:'untraced'}))).sourceCheck,'untraced');
 assert.equal((await callOfficeEngine(request,context,opts({sourceCheck:'forged'}))).sourceCheck,undefined);
 assert.equal((await callOfficeEngine(request,context,opts({}))).sourceCheck,undefined);
});
