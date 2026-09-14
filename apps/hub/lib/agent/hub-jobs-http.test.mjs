import assert from 'node:assert/strict';
import {test} from 'node:test';
let create;try{({createHubJobHandler:create}=await import('./hub-jobs-http.js'));}catch{}
test('Hub job controls enforce the Hub guard before using server-only credentials',async()=>{
 assert.equal(typeof create,'function');let called=false;
 const handler=create({guard:()=>Response.json({status:'forbidden'},{status:401}),authorize:()=>{called=true;}});
 const r=await handler(new Request('http://localhost:3000/api/hub/codex/jobs',{method:'POST',body:'{}'}));
 assert.equal(r.status,401);assert.equal(called,false);
});
test('Hub BFF derives identity server-side and denies arbitrary job actions',async()=>{
 assert.equal(typeof create,'function');let called=0;
 const handler=create({guard:()=>null,env:{COM_MOON_AGENT_API_TOKEN:'private-token'},authorize:r=>{assert.equal(r.headers.get('authorization'),'Bearer private-token');return {ok:true,context:{workspaceId:'server',actorId:'codex',scopes:['jobs:write']}};},job:async(action,input,context)=>{called++;assert.equal(context.workspaceId,'server');return {httpStatus:202,data:{status:'accepted',job:{id:'j'}}};}});
 const r=await handler(new Request('http://localhost:3000/api/hub/codex/jobs',{method:'POST',body:JSON.stringify({action:'submit',prompt:'검토'})}));
 assert.equal(r.status,202);assert.doesNotMatch(await r.text(),/private-token/);
 const denied=await handler(new Request('http://localhost:3000/api/hub/codex/jobs',{method:'POST',body:JSON.stringify({action:'claim'})}));
 assert.equal(denied.status,400);assert.equal(called,1);
});
