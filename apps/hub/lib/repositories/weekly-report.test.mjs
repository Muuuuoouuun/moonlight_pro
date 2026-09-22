import assert from "node:assert/strict";
import { test } from "node:test";
import { getWeeklyReport } from "./weekly-report.js";
const now = new Date('2026-09-21T00:00:00Z');
const measurement = (sourceKey,value=0,coverage='complete') => ({sourceKey,value,coverage,evidence:[]});
function dependencies(overrides={}) {
  return { now, workspaceId:'workspace',
    reader:{ measure:async ({sourceKey})=>measurement(sourceKey),scopedRows:async()=>({rows:[],coverage:'complete'}),...overrides.reader },
    getGoals:async()=>({status:'live',objectives:[],metrics:[]}), ...overrides };
}
test('weekly window consists of seven completed calendar days and includes shared goals', async()=>{
  const goals={status:'live',objectives:[{id:'goal'}],metrics:[]};
  const report=await getWeeklyReport(dependencies({getGoals:async()=>goals}));
  assert.equal(report.periodStart,'2026-09-14'); assert.equal(report.periodEnd,'2026-09-20');
  assert.deepEqual(report.goals,goals); assert.equal(report.scorecard,null); assert.equal(report.stats.contacts,0);
});
test('explicit completed period is stable across reopening and rejects partial/future periods',async()=>{
  const input={periodStart:'2026-09-14',periodEnd:'2026-09-20',timezone:'Asia/Seoul'};
  const a=await getWeeklyReport({...dependencies(),...input});
  const b=await getWeeklyReport({...dependencies(),...input,now:new Date('2026-09-24T00:00:00Z')});
  assert.equal(a.since,b.since);assert.equal(a.until,b.until);assert.equal(b.windowDays,7);
  await assert.rejects(getWeeklyReport({...dependencies(),periodStart:input.periodStart}),/invalid-weekly-period/);
  await assert.rejects(getWeeklyReport({...dependencies(),...input,periodEnd:'2026-09-21'}),/invalid-weekly-period/);
  await assert.rejects(getWeeklyReport({...dependencies(),...input,periodStart:'2026-08-01'}),/invalid-weekly-period/);
});
test('partial source reads remain null instead of fabricating zero or achievement',async()=>{
  const report=await getWeeklyReport(dependencies({reader:{measure:async ({sourceKey})=>measurement(sourceKey,sourceKey==='tasks_completed'?null:0,sourceKey==='tasks_completed'?'unmeasured':'complete'),scopedRows:async()=>({rows:[],coverage:'complete'})}}));
  assert.equal(report.stats.doneTasks,null);assert.equal(report.stats.contacts,0);assert.equal(report.partial,true);
  assert.ok(report.failedSources.includes('tasks_completed'));
});
test('all unavailable sources produce an error report, not a live empty report',async()=>{
  const report=await getWeeklyReport(dependencies({reader:{measure:async({sourceKey})=>measurement(sourceKey,null,'unmeasured'),scopedRows:async()=>({rows:[],coverage:'unmeasured'})},getGoals:async()=>({status:'error'})}));
  assert.equal(report.source,'error');assert.equal(report.stats,null);
});
test('company won results require an actual won timestamp and distinguish modified open deals',async()=>{
  const report=await getWeeklyReport(dependencies({scope:'company',reader:{measure:async ({sourceKey})=>measurement(sourceKey),scopedRows:async()=>({coverage:'complete',rows:[
    {id:'old',stage:'won',amount:100,updated_at:'2026-09-17T00:00:00Z',won_at:'2026-08-01T00:00:00Z'},
    {id:'new',stage:'won',amount:200,currency:'KRW',won_at:'2026-09-17T00:00:00Z'},
    {id:'open',stage:'proposal',updated_at:'2026-09-17T00:00:00Z'},
  ]})}}));
  assert.equal(report.stats.wonDeals,1);assert.equal(report.stats.wonAmount,200);assert.equal(report.stats.modifiedOpenDeals,1);
  assert.match(report.definitions.wonAmount,/입금/);
});
test('undated wins are unmeasured, and missing goal storage is surfaced without erasing measured activities',async()=>{
  const report=await getWeeklyReport(dependencies({scope:'company',reader:{measure:async ({sourceKey})=>measurement(sourceKey,2),scopedRows:async()=>({coverage:'complete',rows:[{id:'old',stage:'won'}]})},getGoals:async()=>({status:'error',error:'migration-required'})}));
  assert.equal(report.stats.wonDeals,null);assert.equal(report.stats.wonAmount,null);assert.equal(report.stats.contacts,2);assert.equal(report.partial,true);
  assert.ok(report.failedSources.includes('goals'));assert.ok(report.failedSources.includes('deal-win-timestamps'));
});
test('modified open deals use canonical legacy aliases and stage_detail precedence',async()=>{
  const rows=['new','nurturing','consult'].map((stage,i)=>({id:String(i),stage,updated_at:'2026-09-17T00:00:00Z'}));
  rows.push({id:'detail',stage:'won',meta:{stage_detail:'contact'},updated_at:'2026-09-17T00:00:00Z'});
  const report=await getWeeklyReport(dependencies({scope:'company',reader:{measure:async({sourceKey})=>measurement(sourceKey),scopedRows:async()=>({rows,coverage:'complete'})}}));
  assert.equal(report.stats.modifiedOpenDeals,4);assert.equal(report.stats.wonDeals,0);
});
