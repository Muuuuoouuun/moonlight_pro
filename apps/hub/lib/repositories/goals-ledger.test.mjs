import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getGoalsLedger,executeGoalCommand,getGoalCommandReceipt} from './goals-ledger.js';
const workspace='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const objective={id,workspace_id:workspace,title:'결과',description:'',scope:'personal',period_start:'2026-09-01',period_end:'2026-09-30',timezone:'Asia/Seoul',status:'active',revision:1};
const metric={...objective,objective_id:id,name:'누락',unit:'건',role:'guardrail',direction:'decrease',baseline:4,target:0,target_min:null,target_max:null,source_key:'manual'};
const observation={id,workspace_id:workspace,metric_id:id,value:0,observed_at:'2026-09-21T00:00:00Z',period_start:'2026-09-01',period_end:'2026-09-30',coverage:'complete',evidence:[],note:'',source_key:'manual',created_at:'2026-09-21T00:00:00Z'};
const context={workspaceId:workspace,actorId:'operator'};
function dependencies(extra={}) {
  return {configured:true,now:'2026-09-21T02:00:00Z',fetchRows:async table=>{const rows=table==='operating_objectives'?[objective]:table==='operating_metrics'?[metric]:table==='operating_observations'?[observation]:[];return {rows,count:rows.length};},...extra};
}
test('legacy canonical workspace IDs reach goal reads and entity scope resolution',async()=>{
  const legacyWorkspace='11111111-1111-1111-1111-111111111111';
  const seen=[];
  const reads=dependencies({fetchRows:async(table,options)=>{
    seen.push({table,options});return {rows:[],count:0};
  },metricReader:{get:async(table,entityId)=>({id:entityId,workspace_id:legacyWorkspace}),resolveEntityScope:async()=> 'company'}});
  const trusted={workspaceId:legacyWorkspace,actorId:'operator'};
  const all=await getGoalsLedger({},trusted,reads);
  assert.equal(all.status,'live');assert.deepEqual(all.objectives,[]);
  const linked=await getGoalsLedger({entityType:'tasks',entityId:id},trusted,reads);
  assert.equal(linked.status,'live');assert.equal(linked.entityScope,'company');
  assert.deepEqual(seen.map(entry=>entry.table),['operating_objectives','operating_goal_links']);
  assert.ok(seen.every(entry=>entry.options.filters.some(([key,value])=>key==='workspace_id'&&value===`eq.${legacyWorkspace}`)));
  assert.equal((await getGoalsLedger({entityType:'tasks',entityId:'not-a-uuid'},trusted,reads)).error,'invalid-goal-filter','entity IDs still require canonical database UUID syntax');
  assert.equal((await getGoalsLedger({}, {workspaceId:'not-a-uuid',actorId:'operator'},reads)).error,'invalid-workspace');
  assert.equal(seen.length,2,'invalid workspace and entity filters never reach storage');
});
test('legacy task links hydrate through trusted workspace and scope filters',async()=>{
  const legacyTask='44444444-4444-4444-4444-444444444441';
  const link={workspace_id:workspace,objective_id:id,entity_type:'tasks',entity_id:legacyTask};
  const seen=[];
  const linkedDependencies=dependencies({fetchRows:async(table,options)=>{
    seen.push({table,options});
    const rows=table==='operating_goal_links'?[link]:table==='operating_objectives'?[objective]:[];
    return {rows,count:rows.length};
  },metricReader:{get:async(table,entityId)=>{assert.equal(table,'tasks');assert.equal(entityId,legacyTask);return {id:entityId,workspace_id:workspace};},resolveEntityScope:async()=> 'personal'}});
  const result=await getGoalsLedger({entityType:'tasks',entityId:legacyTask},context,linkedDependencies);
  assert.equal(result.status,'live');
  assert.equal(result.links[0].entityId,legacyTask);assert.equal(result.links[0].linkStatus,'current');
  assert.ok(seen.every(entry=>entry.options.filters.some(([key,value])=>key==='workspace_id'&&value===`eq.${workspace}`)));
  assert.ok(seen.find(entry=>entry.table==='operating_objectives').options.filters.some(([key,value])=>key==='scope'&&value==='eq.personal'));
  const wrongWorkspace=await getGoalsLedger({entityType:'tasks',entityId:legacyTask},context,{...linkedDependencies,fetchRows:async()=>({rows:[{...link,workspace_id:other}],count:1})});
  assert.equal(wrongWorkspace.error,'goal-links-read-failed');
  const unavailableScope=await getGoalsLedger({entityType:'tasks',entityId:legacyTask},context,{...linkedDependencies,metricReader:{get:async()=>null,resolveEntityScope:async()=>null}});
  assert.equal(unavailableScope.error,'entity-scope-unavailable');
  assert.equal((await getGoalsLedger({objectiveId:legacyTask},context,linkedDependencies)).error,'invalid-goal-filter');
});
test('legacy workspace context reaches command and receipt RPCs without relaxing command IDs',async()=>{
  const legacyWorkspace='11111111-1111-1111-1111-111111111111';
  const trusted={workspaceId:legacyWorkspace,actorId:'operator'};
  const calls=[];
  const storage=dependencies({rpc:async(name,params)=>{
    calls.push({name,params});return {ok:true,data:{status:'saved',persisted:true,commandId:id,entity:{id},replayed:name==='operating_goal_receipt_v1'}};
  }});
  const payload={commandId:id,action:'create_objective',input:{title:'목표',scope:'personal',periodStart:'2026-09-01',periodEnd:'2026-09-30',timezone:'Asia/Seoul'}};
  assert.equal((await executeGoalCommand(payload,trusted,storage)).status,'saved');
  assert.equal((await getGoalCommandReceipt(id,trusted,storage)).status,'saved');
  assert.deepEqual(calls.map(call=>call.name),['operating_goal_command_v1','operating_goal_receipt_v1']);
  assert.ok(calls.every(call=>call.params.p_workspace_id===legacyWorkspace));
  assert.equal((await executeGoalCommand({...payload,commandId:legacyWorkspace},trusted,storage)).status,'invalid-input');
  assert.equal((await getGoalCommandReceipt(legacyWorkspace,trusted,storage)).error,'invalid-command-id');
  assert.equal(calls.length,2);
});
test('projection uses exact-period latest snapshots and never adds them',async()=>{
  const result=await getGoalsLedger({},context,dependencies({fetchRows:async table=>{
    const rows=table==='operating_objectives'?[objective]:table==='operating_metrics'?[metric]:table==='operating_observations'?[{...observation,value:5,created_at:'2026-09-20T00:00:00Z'},observation]:[];
    return {rows,count:rows.length};
  }}));
  assert.equal(result.status,'live');assert.equal(result.metrics[0].measurement.value,0);assert.equal(result.metrics[0].progress.achieved,true);
});
test('read errors and truncation cannot become zero or achieved',async()=>{
  for(const response of [{rows:null,error:{reason:'failed'}},{rows:[observation],count:2000}]) {
    const base=dependencies();const result=await getGoalsLedger({},context,dependencies({fetchRows:table=>table==='operating_observations'?response:base.fetchRows(table)}));
    assert.equal(result.status,'partial');assert.equal(result.metrics[0].progress.achieved,null);
  }
});
test('backdated append cannot replace fresher measurement and closed periods need final observation',async()=>{
  const base=dependencies();
  const result=await getGoalsLedger({},context,dependencies({fetchRows:table=>table==='operating_observations'?{rows:[observation,{...observation,value:5,observed_at:'2026-09-20T00:00:00Z',created_at:'2026-09-22T00:00:00Z'}],count:2}:base.fetchRows(table)}));
  assert.equal(result.metrics[0].measurement.value,0);
  const stale=await getGoalsLedger({},context,dependencies({now:'2026-10-01T01:00:00Z'}));
  assert.equal(stale.metrics[0].measurement.coverage,'partial');assert.equal(stale.metrics[0].measurement.reason,'period-not-fully-observed');assert.equal(stale.metrics[0].progress.achieved,null);
});
test('legacy future and pre-period observations never count as achieved',async()=>{
  const base=dependencies();
  for(const observed_at of ['2026-09-22T00:00:00Z','2026-08-31T14:59:59Z']){
    const result=await getGoalsLedger({},context,dependencies({fetchRows:table=>table==='operating_observations'?{rows:[{...observation,observed_at}],count:1}:base.fetchRows(table)}));
    assert.equal(result.metrics[0].measurement.value,null);assert.equal(result.metrics[0].progress.achieved,null);
    assert.equal(result.metrics[0].measurement.reason,'invalid-observation-time');
  }
});
test('links expose changed scope and unavailable sources while keeping current links usable',async()=>{
  const base=dependencies();
  const rows=[{workspace_id:workspace,objective_id:id,entity_type:'projects',entity_id:id},{workspace_id:workspace,objective_id:id,entity_type:'tasks',entity_id:other},{workspace_id:workspace,objective_id:id,entity_type:'journal_entries',entity_id:workspace}];
  const primed=new Set();
  const metricReader={getMany:async(table,ids)=>{for(const entityId of ids)primed.add(`${table}:${entityId}`);},get:async(table,entityId)=>{assert.ok(primed.has(`${table}:${entityId}`));return table==='tasks'?null:{id:entityId,entry_kind:'daily_review',review_date:'2026-09-21'};},resolveEntityScope:async(table,row)=>row?table==='projects'?'company':'personal':null};
  const result=await getGoalsLedger({},context,dependencies({metricReader,fetchRows:table=>table==='operating_goal_links'?{rows,count:rows.length}:base.fetchRows(table)}));
  assert.equal(result.status,'partial');
  assert.deepEqual(result.links.map(link=>link.linkStatus),['scope-mismatch','unavailable','current']);
  assert.deepEqual(result.links.map(link=>link.stale),[true,true,false]);
  assert.equal(result.links[0].entityScope,'company');assert.equal(result.links[0].entityHref,null);
  assert.equal(result.links[1].staleReason,'entity-source-unavailable');
  assert.equal(result.links[2].entityHref,'/dashboard/work/daily-review?date=2026-09-21');
});
test('cross-workspace rows are rejected and options cannot override trusted workspace',async()=>{
  const seen=[];const base=dependencies();
  const result=await getGoalsLedger({workspaceId:other},context,dependencies({fetchRows:async(table,options)=>{seen.push(options);return table==='operating_objectives'?{rows:[{...objective,workspace_id:other}],count:1}:base.fetchRows(table);}}));
  assert.equal(result.status,'error');assert.ok(seen.every(options=>options.filters.some(([k,v])=>k==='workspace_id'&&v===`eq.${workspace}`)));
});
test('server automatic measurements are projected and command clients cannot assert them',async()=>{
  const base=dependencies();let measured=0;
  const result=await getGoalsLedger({},context,dependencies({fetchRows:table=>table==='operating_metrics'?{rows:[{...metric,source_key:'tasks_completed'}],count:1}:base.fetchRows(table),measure:async()=>{measured++;return {...observation,value:3,coverage:'complete',sourceKey:'tasks_completed'};}}));
  assert.equal(measured,1);assert.equal(result.metrics[0].measurement.value,3);
  assert.equal((await executeGoalCommand({commandId:id,action:'record_observation',input:{metricId:id,sourceKey:'tasks_completed'}},context,dependencies())).httpStatus,400);
});
test('unavailable persistence never reports preview success; unknown writes direct receipt recovery',async()=>{
  const payload={commandId:id,action:'create_objective',input:{title:'목표',scope:'personal',periodStart:'2026-09-01',periodEnd:'2026-09-30',timezone:'Asia/Seoul'}};
  assert.equal((await executeGoalCommand(payload,context,{configured:false})).httpStatus,503);
  const result=await executeGoalCommand(payload,context,dependencies({rpc:async()=>{throw new Error('transport lost');}}));
  assert.equal(result.persisted,null);assert.equal(result.nextAction,'get_goal_command_receipt');
  const missing=await getGoalCommandReceipt(id,context,dependencies({rpc:async()=>({ok:true,data:{status:'error',error:'receipt-not-found',persisted:null,commandId:id}})}));
  assert.equal(missing.httpStatus,404);assert.equal(missing.persisted,null);
});
test('every receipt availability failure retains unknown persistence and retry identity',async()=>{
  for(const result of [{ok:false,error:'missing-config'},{ok:false,status:401},{ok:false,status:403},{ok:false,status:404},{ok:false,status:500}]){
    const receipt=await getGoalCommandReceipt(id,context,dependencies({rpc:async()=>result}));
    assert.equal(receipt.persisted,null);assert.equal(receipt.commandId,id);assert.equal(receipt.nextAction,'get_goal_command_receipt');assert.equal(receipt.retryable,true);
  }
  const receipt=await getGoalCommandReceipt(id,context,{configured:false});
  assert.equal(receipt.persisted,null);assert.equal(receipt.nextAction,'get_goal_command_receipt');
});
