import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async(name)=>{try{return await readFile(new URL(name,import.meta.url),'utf8');}catch{return '';}};
const source=await read('./finance.jsx'),css=await read('./finance.css');
test('personal finance uses one inner view switch, scoped read and canonical review drawer',()=>{
  assert.match(source,/\/api\/hub\/finance\?scope=personal/);
  assert.equal((source.match(/<SegmentedControl\b/g)||[]).length,1);
  for(const component of ['EmptyState','Skeleton','TruthBadge','EditDrawer','Drawer','SelectField']) assert.match(source,new RegExp(`<${component}\\b`));
  assert.doesNotMatch(source,/hub-futura|fx-card|OfficeWorkflowPanel|onMouseEnter|onMouseLeave/);
});
test('secondary tools stay in More and finance never dispatches an Office request',()=>{
  const more=source.slice(source.indexOf('{moreOpen && <Drawer'));
  assert.match(more,/수집 범위/);assert.match(more,/CFO 리피아/);assert.match(more,/dashboard\/agents\/office-council/);
  assert.doesNotMatch(source,/agent.*request|\/api\/hub\/office|create_task|onNew|usePageCreateHotkey/);
});
test('unknown money is explicit and review saves await the persistence envelope',()=>{
  assert.match(source,/financeMoney/);assert.match(source,/financeReadState/);assert.match(source,/financeSaveResult/);
  assert.match(source,/expectedRevision/);assert.match(source,/은행 원장 미조회/);
  assert.match(source,/approvedAmount/);assert.match(source,/recoveredAmount/);
});
test('finance title, mobile input and touch floors stay within the design contract',()=>{
  assert.match(css,/padding: var\(--section-gap\)/);
  assert.match(css,/font-size: 20px/);assert.match(css,/font-weight: 500/);
  assert.match(css,/max-width: 600px/);assert.match(css,/min-height: 44px/);assert.match(css,/font-size: 16px/);
  assert.doesNotMatch(css,/(?:#[0-9a-f]{3,8}\b|rgba?\(|oklch\(|\b\d+(?:\.\d+)?m?s\b)/i);
});
test('cashflow and subscriptions put actionable rows before optional monthly evidence',()=>{
  const flow=source.slice(source.indexOf("filters.view==='flow'"),source.indexOf("filters.view==='subscriptions'"));
  const subscriptions=source.slice(source.indexOf("filters.view==='subscriptions'"),source.indexOf("filters.view==='claims'"));
  assert.ok(flow.indexOf('<FinanceRows ') < flow.indexOf('<details className="finance-supporting"'));
  assert.ok(subscriptions.indexOf('<SubscriptionRows ') < subscriptions.indexOf('<details className="finance-supporting"'));
  assert.match(flow,/<MonthlyTable rows=\{monthly\}/);
  assert.match(flow,/<MonthlyTable rows=\{wallet\} wallet/);
  assert.match(subscriptions,/<SubscriptionPaymentTable table=\{payments\} onReview=/);
  assert.match(source,/<SelectField label="관측 월"/);
  assert.match(source,/<TextField label="검색"/);
});
test('the existing personal forecast remains directly reachable without synthesizing a cashflow gauge',()=>{
  assert.match(source,/<Link className="finance-forecast-link hub-row" href="\/dashboard\/revenue\/overview\?scope=personal">개인 매출 전망<\/Link>/);
  assert.doesNotMatch(source,/<ProgressRing|<Gauge|<PersonalRevenueRoadmap/);
});
