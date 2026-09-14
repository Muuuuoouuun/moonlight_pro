import assert from 'node:assert/strict';
import {test} from 'node:test';
let create;
try{({createAgentHttpHandler:create}=await import('./http.js'));}catch{}
const context={workspaceId:'server-workspace',actorId:'codex',scopes:['read','tasks:write','jobs:read','jobs:write']};
const authorized=()=>({ok:true,context});
const req=(body,method='POST')=>new Request('http://localhost:3000/api/agent/v1/query',{method,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
test('Agent routes authenticate before body parsing or service invocation',async()=>{
 assert.equal(typeof create,'function');let called=false;
 const handler=create('query',{authorize:()=>({ok:false,httpStatus:401,data:{status:'error',error:'unauthorized'}}),query:()=>{called=true;}});
 const r=await handler(req('{bad'));assert.equal(r.status,401);assert.equal(called,false);
});
test('Agent routes reject malformed, array and oversized UTF8 JSON',async()=>{
 assert.equal(typeof create,'function');
 const handler=create('query',{authorize:authorized,query:()=>{throw Error('not called');}});
 for(const [body,status] of [['{bad',400],['[]',400],[JSON.stringify({text:'한'.repeat(24000)}),413]])assert.equal((await handler(req(body))).status,status);
});
test('commands use authenticated identity and invalidate cached reads only after persisted receipt',async()=>{
 assert.equal(typeof create,'function');let identity,invalidated=0;
 const handler=create('command',{authorize:authorized,command:async(input,ctx)=>{identity=ctx;assert.equal(input.workspaceId,'foreign');return {httpStatus:200,data:{status:'saved',persisted:true}};},invalidate:()=>invalidated++});
 const r=await handler(req({workspaceId:'foreign',action:'create_task'}));
 assert.equal(r.status,200);assert.equal(identity.workspaceId,'server-workspace');assert.equal(invalidated,1);
});
test('commands allow a canonical Korean checklist above the smaller query body limit',async()=>{
 let called=false;const handler=create('command',{authorize:authorized,command:async()=>{called=true;return {httpStatus:200,data:{status:'preview',persisted:false}};}});
 const body={input:{checklist:Array.from({length:50},()=>({title:'한'.repeat(200),note:'글'.repeat(500),done:false}))}};
 assert.equal((await handler(req(body))).status,200);assert.equal(called,true);
});
test('detail path and query reach service while status and no-store are preserved',async()=>{
 assert.equal(typeof create,'function');let args;
 const handler=create('entity',{authorize:authorized,entity:async(...x)=>{args=x;return {httpStatus:200,data:{status:'preview',data:null}};}});
 const r=await handler(new Request('http://localhost:3000/api/agent/v1/entities/tasks/id?detail=full&fresh=true'),{params:Promise.resolve({type:'tasks',id:'id'})});
 assert.deepEqual(args.slice(0,3),['tasks','id',{detail:'full',fresh:'true'}]);
 assert.equal((await r.json()).status,'preview');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('recovering a persisted command receipt invalidates stale cached reads',async()=>{
 let invalidated=0;
 for(const persisted of [null,false,true]){
  const handler=create('receipt',{authorize:authorized,receipt:async()=>({httpStatus:200,data:{status:'live',persisted}}),invalidate:({workspaceId})=>{assert.equal(workspaceId,context.workspaceId);invalidated++;}});
  await handler(req(null,'GET'),{params:{id:'receipt-id'}});
 }
 assert.equal(invalidated,1);
});
test('job event SSE honors Last-Event-ID and emits bounded events until terminal state',async()=>{
 assert.equal(typeof create,'function');let after;
 const handler=create('events',{authorize:authorized,job:async(action,input)=>{after=input.after;return {httpStatus:200,data:{status:'live',events:[{seq:8,type:'completed',payload:{text:'완료'}}],nextAfter:8,hasMore:false,jobState:'succeeded'}};}});
 const r=await handler(new Request('http://localhost:3000/api/agent/v1/jobs/j/events',{headers:{accept:'text/event-stream','last-event-id':'7'}}),{params:{id:'j'}});
 const body=await r.text();assert.equal(after,7);assert.match(body,/id: 8/);assert.match(body,/완료/);assert.match(r.headers.get('content-type'),/text\/event-stream/);
});
test('SSE drains terminal event backlog before announcing terminal state to the UI',async()=>{
 const handler=create('events',{authorize:authorized,job:async(_action,input)=>({httpStatus:200,data:{status:'live',events:[{seq:input.after+1,type:'completed',payload:{}}],hasMore:input.after===0,jobState:'succeeded'}})});
 const r=await handler(new Request('http://localhost:3000/api/agent/v1/jobs/j/events',{headers:{accept:'text/event-stream'}}),{params:{id:'j'}});
 const body=await r.text();assert.ok(body.indexOf('id: 2')<body.indexOf('event: state'));
});
