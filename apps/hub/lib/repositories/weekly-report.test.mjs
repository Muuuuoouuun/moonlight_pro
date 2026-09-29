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

test('a focus pick counts as done only while the task is still done — same rule as tasks_completed and the evening review', () => {
  // 재오픈 경로가 completed_at을 남겨도(상태는 todo) 완료로 세지 않는다. status가 없는 todo 모델은 completed_at만 본다.
  const summary = summarizeFocusWindow([
    { status: 'todo', completed_at: '2026-09-16T05:00:00.000Z', meta: { focus_dates: ['2026-09-16'] } },
    { status: 'done', completed_at: '2026-09-17T05:00:00.000Z', meta: { focus_dates: ['2026-09-17'] } },
    { completedAt: '2026-09-18T05:00:00.000Z', focusDates: ['2026-09-18'] },
    // todo 모델의 done:false는 완료 시각이 남아 있어도 완료가 아니다(task-today isDoneTask와 같은 판정).
    { done: false, completedAt: '2026-09-19T05:00:00.000Z', focusDates: ['2026-09-19'] },
  ], { since: '2026-09-14', until: '2026-09-20' });
  assert.deepEqual(summary, { picked: 4, done: 2, days: 4, rate: 50 });
});

test('a history read can skip goals without reporting the goal source as failed', async () => {
  let goalReads = 0;
  const report = await getWeeklyReport(dependencies({ includeGoals: false, periodStart: '2026-09-07', periodEnd: '2026-09-13', getGoals: async () => { goalReads += 1; return { status: 'error' }; } }));
  assert.equal(goalReads, 0);
  assert.equal(report.goals, null);
  assert.equal(report.partial, false);
  assert.deepEqual(report.failedSources, []);
  assert.equal(report.periodStart, '2026-09-07');
  assert.equal(report.stats.contacts, 0);
});

test('a history read with every source unavailable is still an error, not an empty week', async () => {
  const down = { rows: [], coverage: 'unmeasured' };
  const report = await getWeeklyReport(dependencies({ includeGoals: false, reader: {
    measure: async ({ sourceKey }) => measurement(sourceKey, null, 'unmeasured'),
    scopedRows: async () => down, read: async () => down,
  } }));
  assert.equal(report.source, 'error');
  assert.equal(report.stats, null);
});

test('every weekly stat the Hub returns survives the MCP projection with null kept as null', async () => {
  const { projectWeeklyPayload } = await import('../../../../packages/mcp-server/src/weekly-projection.js');
  for (const scope of ['personal', 'company']) {
    const report = await getWeeklyReport(dependencies({ scope }));
    const nulled = Object.fromEntries(Object.keys(report.stats).map(key => [key, null]));
    const projected = projectWeeklyPayload({ ...report, stats: nulled });
    assert.deepEqual(Object.keys(projected.stats).sort(), Object.keys(report.stats).sort(), `${scope} stats`);
    assert.ok(Object.values(projected.stats).every(value => value === null));
    for (const key of Object.keys(report.stats).filter(key => typeof report.definitions[key] === 'string')) {
      assert.equal(typeof projected.definitions[key], 'string', `${scope} definition ${key}`);
    }
  }
});

test('an undated legacy win untouched since before the week cannot have been won in it; one touched inside stays unmeasured', async () => {
  // deals.updated_at은 트리거가 유지한다 — 성사 전환도 행 수정이므로, 창 시작 전에 마지막으로 수정된 딜은
  // 창 안에서 성사됐을 수 없다. 창 안(또는 뒤)에 수정된 미상 성사는 여전히 판단할 수 없다.
  const rows = extra => ({ coverage: 'complete', rows: [
    { id: 'legacy', stage: 'won', amount: 500, updated_at: '2026-08-01T00:00:00Z' },
    { id: 'dated', stage: 'won', amount: 200, currency: 'KRW', won_at: '2026-09-17T00:00:00Z', updated_at: '2026-09-17T00:00:00Z' },
    ...extra,
  ] });
  const clean = await getWeeklyReport(dependencies({ scope: 'company', reader: { scopedRows: async table => table === 'deals' ? rows([]) : { rows: [], coverage: 'complete' } } }));
  assert.equal(clean.stats.wonDeals, 1);
  assert.equal(clean.stats.wonAmount, 200);
  assert.equal(clean.failedSources.includes('deal-win-timestamps'), false);

  const touched = await getWeeklyReport(dependencies({ scope: 'company', reader: { scopedRows: async table => table === 'deals' ? rows([{ id: 'edited', stage: 'won', updated_at: '2026-09-18T00:00:00Z' }]) : { rows: [], coverage: 'complete' } } }));
  assert.equal(touched.stats.wonDeals, null);
  assert.ok(touched.failedSources.includes('deal-win-timestamps'));
});
