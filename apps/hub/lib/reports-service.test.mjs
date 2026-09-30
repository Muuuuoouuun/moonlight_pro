import assert from 'node:assert/strict';
import test from 'node:test';
let runReportCommand;
try { ({runReportCommand} = await import('./reports-service.js')); } catch {}
const W='11111111-1111-4111-8111-111111111111';
const input={requestId:W,action:'capture-weekly',scope:'company',periodStart:'2026-09-24',periodEnd:'2026-09-30'};
const now=new Date('2026-10-01T01:00:00Z');
test('weekly capture persists server facts with null and partial intact; retry hash excludes mutable facts',async()=>{
  assert.equal(typeof runReportCommand,'function');
  const sent=[];
  const deps={workspaceId:W,now,getWeekly:async()=>({source:'supabase',partial:true,stats:{contacts:null,deals:0},failedSources:['contacts_recorded']}),invokeRpc:async(name,params)=>{if(name==='report_receipt_v1')return{ok:true,data:{status:'not-found'}};sent.push({name,params});return{ok:true,data:{status:'saved',reportId:W,revision:1}};}};
  const result=await runReportCommand({...input,facts:{contacts:99}},deps);
  assert.equal(result.status,'saved');assert.equal(result.httpStatus,200);
  assert.equal(sent[0].params.p_command.payload.facts.stats.contacts,null);
  assert.equal(sent[0].params.p_command.payload.status,'partial');
  await runReportCommand(input,{...deps,getWeekly:async()=>({source:'supabase',stats:{contacts:7},partial:false})});
  assert.equal(sent[0].params.p_request_hash,sent[1].params.p_request_hash);
});
test('unavailable facts never save a fabricated empty weekly snapshot',async()=>{
  assert.equal(typeof runReportCommand,'function');let writes=0;
  const deps={workspaceId:W,now,invokeRpc:async(name)=>{if(name==='report_receipt_v1')return{ok:true,data:{status:'not-found'}};writes++;},getWeekly:async()=>({source:'error'})};
  assert.equal((await runReportCommand(input,deps)).status,'error');assert.equal(writes,0);
  assert.equal((await runReportCommand({...input,scope:'invalid'},deps)).httpStatus,400);assert.equal(writes,0);
});
test('a saved receipt survives response loss even when weekly source is now unavailable',async()=>{
  let reads=0,writes=0;
  const answer=await runReportCommand(input,{workspaceId:W,now,getWeekly:async()=>{reads++;return{source:'error'};},invokeRpc:async(name)=>{assert.equal(name,'report_receipt_v1');writes++;return{ok:true,data:{status:'duplicate',reportId:W,revision:1}};}});
  assert.equal(answer.status,'duplicate');assert.equal(reads,0);assert.equal(writes,1);
});
test('storage conflict and response loss remain distinguishable and do not expose RPC details',async()=>{
  assert.equal(typeof runReportCommand,'function');
  const document={requestId:W,action:'save-document',kind:'evaluation',scope:'content',title:'평가',body:'실제 평가'};
  assert.equal((await runReportCommand(document,{workspaceId:W,invokeRpc:async()=>({ok:true,data:{status:'conflict',error:'request-id-reuse'}})})).httpStatus,409);
  const lost=await runReportCommand(document,{workspaceId:W,invokeRpc:async()=>({ok:false,detail:'private-key'})});
  assert.equal(lost.error,'save-unconfirmed');assert.equal(JSON.stringify(lost).includes('private-key'),false);
});
