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
  let writes=0;
  const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:(request,context)=>callOfficeEngine(request,context,{engineUrl:'http://engine.test',secret:'test',fetcher:async()=>Response.json({...generated,version})}),recordRun:async()=>{writes++;return {persisted:true};}});
  const response=await handler(req(input));
  assert.equal(response.status,502);assert.equal((await response.json()).status,'error');assert.equal(writes,0);
 }
});
test('generated answer survives failed run logging; no business writes and no legacy agent key',async()=>{
 let seen;const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:async()=>generated,recordRun:async value=>{seen=value;throw new Error('db failed');}});
 const response=await handler(req(input));const data=await response.json();assert.equal(response.status,200);assert.equal(data.status,'generated');assert.equal(data.log.persisted,false);assert.equal(data.businessWrites,false);assert.equal(seen.agent,'office.flareon');
});
test('preview or error generation is never logged as successful',async()=>{
 for(const status of ['preview','error']) {const handler=createOfficeHubHandler({readContext:async()=>context,callEngine:async()=>({status}),recordRun:async()=>assert.fail('must not log success')});assert.equal((await handler(req(input))).status,status==='preview'?202:502);}
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
