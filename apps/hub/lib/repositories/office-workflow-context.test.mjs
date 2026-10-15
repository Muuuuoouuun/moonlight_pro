import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getOfficeWorkflowContext,normalizeOfficeOrigin} from './office-workflow-context.js';
import {getWeeklyReport} from './weekly-report.js';
import {createMetricReader} from '../metrics/source-adapters.js';
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
test('weekly context compares the preceding seven days in the same scope/timezone with no prior goals',async()=>{
  const calls=[];
  const weeklyReport=async options=>{
    calls.push(options);
    return {source:'supabase',stats:{contacts:options.periodStart==='2026-09-14'?1:0},failedSources:[],definitions:{contacts:'actual activities'},goals:{objectives:[]}};
  };
  const context=await getOfficeWorkflowContext({...weekly,scope:'classin'},{...base,weeklyReport});
  assert.equal(context.status,'ready');assert.equal(calls.length,2);
  const prior=calls.find(item=>item.periodStart==='2026-09-07');
  assert.equal(prior.periodEnd,'2026-09-13');assert.equal(prior.timezone,'Asia/Seoul');
  assert.equal(prior.scope,'company');assert.equal(prior.includeGoals,false);
  assert.equal(context.facts.comparison.status,'live');
  assert.equal(context.facts.metricEvidence[0].comparison.delta,1);
  assert.ok(context.sourceRefs.some(item=>item.id==='weekly:stats:contacts'));
  assert.ok(context.sourceRefs.some(item=>item.id==='weekly:comparison'));
});
test('failed prior read preserves current facts and a changed prior value changes the context hash',async()=>{
  const makeReport=prior=>async options=>{
    if(options.periodStart==='2026-09-07'){
      if(prior===null)throw new Error('prior unavailable');
      return {source:'supabase',stats:{doneTasks:prior},failedSources:[]};
    }
    return {source:'supabase',stats:{doneTasks:3},failedSources:[]};
  };
  const unavailable=await getOfficeWorkflowContext(weekly,{...base,weeklyReport:makeReport(null)});
  assert.equal(unavailable.status,'ready');assert.equal(unavailable.facts.stats.doneTasks,3);
  assert.equal(unavailable.facts.comparison.status,'unavailable');
  assert.equal(unavailable.facts.metricEvidence[0].comparison.delta,null);
  assert.deepEqual(unavailable.missing,[]);
  const a=await getOfficeWorkflowContext(weekly,{...base,weeklyReport:makeReport(1)});
  const b=await getOfficeWorkflowContext(weekly,{...base,weeklyReport:makeReport(2)});
  assert.notEqual(a.contextHash,b.contextHash);
});
test('real weekly metric evidence with 120-character task titles fits the fixed context budget without losing records',async()=>{
  const recordId=(group,index)=>`${group}${String(index).padStart(7,'0')}-1111-4111-8111-111111111111`;
  const entries=(group,fields)=>Array.from({length:19},(_,index)=>({id:recordId(group,index),workspace_id:workspaceId,...fields(index)}));
  const tables={
    tasks:entries('1',()=>({title:'가'.repeat(120),status:'done',completed_at:'2026-09-14T03:00:00Z',meta:{}})),
    crm_activities:entries('2',()=>({kind:'call',occurred_at:'2026-09-14T03:00:00Z',meta:{org_scope:'personal'}})),
    publish_logs:entries('3',index=>({variant_id:recordId('4',index),channel:'threads',status:'published',published_at:'2026-09-14T03:00:00Z',target_url:`https://example.org/posts/${index}`})),
    content_variants:entries('4',index=>({content_id:recordId('5',index),meta:{}})),
    content_items:entries('5',()=>({meta:{org_scope:'personal'}})),
    journal_entries:Array.from({length:7},(_,index)=>({id:recordId('6',index),workspace_id:workspaceId,entry_kind:'daily_review',review_date:`2026-09-${14+index}`,review_timezone:'Asia/Seoul'})),
  };
  const readRows=async(table,{filters=[],limit=500})=>{
    const matching=(tables[table]||[]).filter(row=>filters.every(([field,value])=>{
      if(value.startsWith('eq.'))return row[field]===value.slice(3);
      if(value.startsWith('gte.'))return row[field]>=value.slice(4);
      if(value.startsWith('lt.'))return row[field]<value.slice(3);
      if(value.startsWith('gt.'))return row[field]>value.slice(3);
      if(value.startsWith('in.('))return value.slice(4,-1).split(',').includes(row[field]);
      if(field==='meta->>focus_dates'&&value==='not.is.null')return Array.isArray(row.meta?.focus_dates);
      assert.fail(`Unexpected local reader filter: ${field} ${value}`);
    }));
    return {rows:matching.slice(0,limit),count:matching.length};
  };
  const weeklyReport=options=>getWeeklyReport({...options,reader:createMetricReader({workspaceId,readRows,now}),getGoals:async()=>({status:'live',objectives:[]})});
  const context=await getOfficeWorkflowContext(weekly,{...base,weeklyReport});
  assert.equal(context.status,'ready',JSON.stringify(context));
  assert.deepEqual(context.missing,[]);
  assert.equal(context.facts.stats.doneTasks,19);
  assert.equal(context.facts.stats.contacts,19);
  assert.equal(context.facts.stats.publishes,19);
  assert.equal(context.facts.stats.reviewDays,7);
  assert.deepEqual(context.facts.measurements.map(item=>item.evidence.filter(ref=>ref.type==='ledger').length),[19,19,19,7]);
  assert.equal(context.facts.measurements[0].evidence[0].label,'가'.repeat(120));
  assert.equal(context.facts.comparison.stats.doneTasks,0);
  assert.equal(context.facts.comparison.definitionRelation,'same');
  assert.deepEqual(context.facts.comparison.definitions,{});
  assert.equal(context.sourceRefs.length,16);
  assert.ok(Buffer.byteLength(JSON.stringify({facts:context.facts,sourceRefs:context.sourceRefs,missing:context.missing}),'utf8')<=24*1024);
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
