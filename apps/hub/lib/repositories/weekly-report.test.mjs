import assert from "node:assert/strict";
import { test } from "node:test";
import { getWeeklyReport, summarizeFocusWindow } from "./weekly-report.js";
const now = new Date('2026-09-21T00:00:00Z');
const measurement = (sourceKey,value=0,coverage='complete') => ({sourceKey,value,coverage,evidence:[]});
function dependencies(overrides={}) {
  return { now, workspaceId:'workspace',
    getGoals:async()=>({status:'live',objectives:[],metrics:[]}), ...overrides,
    reader:{ measure:async ({sourceKey})=>measurement(sourceKey),scopedRows:async()=>({rows:[],coverage:'complete'}),read:async()=>({rows:[],coverage:'complete'}),...overrides.reader } };
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
  const report=await getWeeklyReport(dependencies({reader:{measure:async({sourceKey})=>measurement(sourceKey,null,'unmeasured'),scopedRows:async()=>({rows:[],coverage:'unmeasured'}),read:async()=>({rows:[],coverage:'unmeasured'})},getGoals:async()=>({status:'error'})}));
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

// ── 세 축·Action KPI 주간 필드(2026-09-20 §6.2·§6.3·§7.3) — claude/workflow-os-a-week1에서 이식 ──
// 원 브랜치의 fetchSupabaseRows 스텁 테스트를 이 파일의 metric reader 주입 방식으로 옮겼다.
// 캠페인 스코어카드 두 테스트는 옮기지 않았다: 주간 리포트는 기간 증거 없는 캠페인 수동값을
// 싣지 않는다(scorecard:null, definitions.scorecard) — 첫 테스트가 그 계약을 고정한다.
const readStub = (slices) => async (table, filters=[]) => {
  const key = table==='tasks'&&filters.some(([field])=>field==='meta->>focus_dates') ? 'tasks:focus'
    : table==='journal_entries' ? `journal_entries:${(filters.find(([field])=>field==='entry_kind')?.[1]||'').replace('eq.','')}` : table;
  return slices[key] ?? {rows:[],coverage:'complete'};
};

test('personal stats carry focus, memo and review counts for the Action KPI card',async()=>{
  const reads=[]; const measured=[];
  const report=await getWeeklyReport(dependencies({reader:{
    measure:async({sourceKey})=>{measured.push(sourceKey);return measurement(sourceKey,sourceKey==='reviews_completed'?3:sourceKey==='tasks_completed'?1:0);},
    read:async(table,filters)=>{reads.push([table,filters]);return readStub({
      'tasks:focus':{coverage:'complete',rows:[
        // 월요일(09-14)에 골라 그날 끝냄 → picked 1 · done 1
        {id:'t1',status:'done',completed_at:'2026-09-14T03:00:00Z',meta:{focus_dates:['2026-09-14']}},
        // 금요일에 골랐지만 안 끝냄 → picked 1 · done 0
        {id:'t2',status:'todo',completed_at:null,meta:{focus_dates:['2026-09-18']}},
        // 창 밖(3주 전·오늘) 선택은 세지 않는다
        {id:'t3',status:'done',completed_at:'2026-09-01T01:00:00Z',meta:{focus_dates:['2026-09-01','2026-09-21']}},
      ]},
      'journal_entries:note':{coverage:'complete',rows:[{id:'m1'},{id:'m2'}]},
    })(table,filters);},
  }}));
  // 완료 할 일·연락은 metric 정의(tasks_completed=completed_at, contacts_recorded=crm_activities 접촉 kind)로 잰다.
  assert.deepEqual(measured.sort(),['contacts_recorded','content_published','reviews_completed','tasks_completed']);
  assert.equal(report.stats.doneTasks,1);
  assert.equal(report.stats.focusPicked,2);assert.equal(report.stats.focusDone,1);assert.equal(report.stats.focusRate,50);assert.equal(report.stats.focusDays,2);
  assert.equal(report.stats.memos,2);assert.equal(report.stats.reviewDays,3);
  assert.equal(report.partial,false);
  const memoRead=reads.find(([table])=>table==='journal_entries');
  assert.ok(memoRead[1].some(([field,value])=>field==='created_at'&&value.startsWith('gte.')),'메모는 창 안에 만든 것만 센다');
});

test('an unreadable focus or memo source is named and stays null, never zero',async()=>{
  const report=await getWeeklyReport(dependencies({reader:{read:readStub({'tasks:focus':{rows:[],coverage:'unmeasured'},'journal_entries:note':{rows:[{id:'m1'}],coverage:'partial'}})}}));
  assert.equal(report.stats.focusPicked,null);assert.equal(report.stats.focusRate,null);assert.equal(report.stats.memos,null);
  assert.equal(report.partial,true);
  assert.ok(report.failedSources.includes('tasks:focus'));assert.ok(report.failedSources.includes('journal_entries:note'));
});

test('company weekly report counts stage moves and does not read personal sources',async()=>{
  const reads=[]; const scoped=[];
  const report=await getWeeklyReport(dependencies({scope:'company',reader:{
    read:async(table,filters)=>{reads.push(table);return {rows:[],coverage:'complete'};},
    scopedRows:async(table,filters,scope)=>{scoped.push([table,filters,scope]);return table==='crm_activities'?{coverage:'complete',rows:[
      {id:'a1',kind:'deal',meta:{from:'quote',to:'final'}},
      // 단계 필드 없는 딜 기록(메모성)은 이동이 아니다
      {id:'a2',kind:'deal',meta:{}},
    ]}:{rows:[],coverage:'complete'};},
  }}));
  assert.deepEqual(reads,[],'회사 리포트는 오늘 3개·메모를 읽지 않는다');
  const moveRead=scoped.find(([table])=>table==='crm_activities');
  assert.equal(moveRead[2],'company');
  assert.ok(moveRead[1].some(([field,value])=>field==='kind'&&value==='eq.deal'));
  assert.equal(report.stats.movedDeals,1,"kind='deal' + meta.from/to 행만 이동 딜");
  assert.equal(report.stats.modifiedOpenDeals,0);
  assert.equal(report.stats.focusPicked,undefined);
});

test('summarizeFocusWindow treats a reopened task as not done and ignores out-of-window picks', () => {
  const summary = summarizeFocusWindow([
    { completed_at: null, meta: { focus_dates: ['2026-09-18', '2026-09-19'] } },
    { completed_at: '2026-09-19T05:00:00.000Z', meta: { focus_dates: ['2026-09-19'] } },
    { completed_at: '2026-09-10T05:00:00.000Z', meta: { focus_dates: ['2026-09-10'] } },
  ], { since: '2026-09-14T03:00:00.000Z', until: '2026-09-21T03:00:00.000Z' });

  assert.deepEqual(summary, { picked: 3, done: 1, days: 2, rate: 33 });
});
