import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getOfficeWorkflowContext,normalizeOfficeOrigin} from './office-workflow-context.js';
const workspaceId='11111111-1111-4111-8111-111111111111';
const entityId='22222222-2222-4222-8222-222222222222';
const activityId='33333333-3333-4333-8333-333333333333';
const now=new Date('2026-09-21T00:00:00Z');
const weekly={intent:'weekly_report',scope:'personal',originRef:{periodStart:'2026-09-14',periodEnd:'2026-09-20',timezone:'Asia/Seoul'}};
const customer={intent:'customer_reply',scope:'classin',originRef:{entityType:'lead',entityId}};
const base={workspaceId,actorId:'operator',configured:true,now};

test('Office origin rejects all scope, invalid dates, arbitrary IDs and unbounded periods',()=>{
  assert.equal(normalizeOfficeOrigin({...weekly,scope:'all'}),null);
  assert.equal(normalizeOfficeOrigin({...weekly,originRef:{...weekly.originRef,periodStart:'2026-02-31'}}),null);
  assert.equal(normalizeOfficeOrigin({...weekly,originRef:{...weekly.originRef,periodStart:'2026-09-01'}}),null);
  assert.equal(normalizeOfficeOrigin({...customer,originRef:{entityType:'lead',entityId:'id,or(scope.eq.personal)'}}),null);
  assert.equal(normalizeOfficeOrigin({...customer,originRef:{...customer.originRef,body:'browser facts'}}),null);
});
test('weekly context hash ignores read times, retains metric definition and changed business facts',async()=>{
  const makeReport=asOf=>async options=>{
    assert.equal(options.scope,'personal');assert.equal(options.periodStart,'2026-09-14');assert.equal(options.workspaceId,workspaceId);
    return {source:'supabase',stats:{contacts:null,doneTasks:2},definitions:{contacts:'actual activities'},failedSources:['contacts_recorded'],
      goals:{objectives:[]},measurements:[{sourceKey:'tasks_completed',value:2,coverage:'complete',observedAt:asOf,evidence:[{type:'query',count:2,asOf}]}]};
  };
  const a=await getOfficeWorkflowContext(weekly,{...base,weeklyReport:makeReport(now.toISOString())});
  const b=await getOfficeWorkflowContext(weekly,{...base,now:new Date('2026-09-22T00:00:00Z'),weeklyReport:makeReport('2026-09-22T00:00:00Z')});
  assert.equal(a.status,'ready');assert.equal(a.contextHash,b.contextHash);assert.equal(a.facts.stats.contacts,null);
  assert.deepEqual(a.missing,['contacts_recorded']);assert.notEqual(a.asOf,b.asOf);
  const c=await getOfficeWorkflowContext(weekly,{...base,weeklyReport:async options=>({...await makeReport(now.toISOString())(options),stats:{contacts:1,doneTasks:2}})});
  assert.equal(c.status,'ready');assert.notEqual(a.contextHash,c.contextHash);
});
test('weekly missing connection and failed reads do not become an empty successful report',async()=>{
  assert.equal((await getOfficeWorkflowContext(weekly,{...base,configured:false})).status,'preview');
  assert.equal((await getOfficeWorkflowContext(weekly,{...base,weeklyReport:async()=>({source:'error',stats:null})})).status,'error');
});
test('context exceeding the generation contract is unavailable before offering a model request',async()=>{
  const report={source:'supabase',stats:{doneTasks:2},goals:{objectives:Array.from({length:80},(_,index)=>({id:`${String(index).padStart(8,'0')}-1111-4111-8111-111111111111`,title:'목표'}))}};
  const context=await getOfficeWorkflowContext(weekly,{...base,weeklyReport:async()=>report});
  assert.equal(context.status,'error');assert.equal(context.error,'context-too-large');assert.equal(context.capabilities.generate,false);
});
function customerReader({scope='company',activities=[],wrongEntity=false,missingScope=false}={}) {
  return {...base,reader:{resolveEntityScope:async()=>scope},readRows:async(table,options)=>{
    assert.ok(options.filters.some(([k,v])=>k==='workspace_id'&&v===`eq.${workspaceId}`));
    if(table==='leads')return {rows:[{id:entityId,workspace_id:workspaceId,name:'선택 대상',meta:missingScope?{}:{org_scope:'classin'},updated_at:'2026-09-20T00:00:00Z'}]};
    assert.equal(table,'crm_activities');assert.equal(options.limit,6);
    assert.ok(options.filters.some(([k,v])=>k==='lead_id'&&v===`eq.${entityId}`));
    assert.ok(!options.filters.some(([k])=>k==='company_id'));
    assert.ok(!options.select.includes('updated_at'));
    return {rows:activities.map((body,index)=>({id:index?`${index+4}3333333-3333-4333-8333-333333333333`:activityId,workspace_id:workspaceId,lead_id:wrongEntity?activityId:entityId,kind:'call',body,occurred_at:'2026-09-20T00:00:00Z',created_at:'2026-09-20T00:00:00Z'}))};
  }};
}
test('customer context uses only selected entity, caps activities explicitly and detects changed words',async()=>{
  const a=await getOfficeWorkflowContext(customer,customerReader({activities:Array.from({length:6},(_,i)=>`기록 ${i}`)}));
  assert.equal(a.status,'ready');assert.equal(a.facts.activities.length,5);assert.equal(a.facts.activityWindow.hasMore,true);
  assert.ok(a.missing.includes('activities-limited-to-latest-five'));
  const b=await getOfficeWorkflowContext(customer,customerReader({activities:['변경한 발언']}));
  assert.notEqual(a.contextHash,b.contextHash);
  const empty=await getOfficeWorkflowContext(customer,customerReader());
  assert.equal(empty.status,'ready');assert.ok(empty.missing.includes('recorded-customer-words-unavailable'));
});
test('customer mismatch, missing classification and unrelated activity fail closed',async()=>{
  assert.equal((await getOfficeWorkflowContext(customer,customerReader({scope:'personal'}))).error,'customer-scope-mismatch');
  assert.equal((await getOfficeWorkflowContext(customer,customerReader({missingScope:true}))).error,'customer-scope-unavailable');
  assert.equal((await getOfficeWorkflowContext(customer,customerReader({activities:['내용'],wrongEntity:true}))).error,'customer-activities-scope-mismatch');
  assert.equal((await getOfficeWorkflowContext(customer,customerReader({activities:['가'.repeat(10000)]}))).error,'context-too-large');
});
