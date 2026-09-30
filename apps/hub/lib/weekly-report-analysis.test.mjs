import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildWeeklyMetricEvidence} from './weekly-report-analysis.js';

test('weekly evidence preserves activity/deal meanings and measured zero without inventing a percent trend',()=>{
  const rows=buildWeeklyMetricEvidence({stats:{contacts:1,newDeals:0,wonDeals:0,wonAmount:0}}, {stats:{contacts:0,newDeals:0,wonDeals:0,wonAmount:0}}, 'company');
  assert.equal(rows[0].label,'고객 연락 활동');
  assert.equal(rows[1].label,'새로 생성된 딜');
  assert.equal(rows[2].value,0);
  assert.equal(rows[3].unit,'원');
  assert.equal(rows[0].comparison.delta,1);
  assert.equal(rows[0].comparison.percentChange,null);
  assert.equal(rows[0].comparison.reason,'zero-baseline');
  assert.match(rows[0].meaning,/고유 고객 수가 아닙니다/);
  assert.match(rows[3].meaning,/입금/);
});
test('missing, changed definitions and unavailable comparisons cannot create numeric changes',()=>{
  const current={stats:{contacts:null,doneTasks:4,publishes:3},definitions:{doneTasks:'new definition'}};
  const prior={stats:{contacts:2,doneTasks:1,publishes:2},definitions:{doneTasks:'old definition'}};
  const rows=buildWeeklyMetricEvidence(current,prior,'personal');
  assert.deepEqual(rows.map(row=>row.comparison.reason),['unmeasured','definition-changed',null]);
  assert.equal(rows[1].comparison.delta,null);
  assert.equal(rows[2].comparison.percentChange,50);
  assert.equal(buildWeeklyMetricEvidence(current,null,'personal')[2].comparison.reason,'comparison-unavailable');
});
test('workspace focus and notes keep a different denominator from personal completed tasks',()=>{
  const rows=buildWeeklyMetricEvidence({stats:{doneTasks:2,focusRate:50,memos:1}},null,'personal');
  assert.match(rows[1].scopeNote,/워크스페이스 전체/);
  assert.match(rows[2].scopeNote,/워크스페이스 전체/);
  assert.match(rows[0].scopeNote,/개인/);
});
test('one-sided definition changes block comparisons and rate changes declare percentage points',()=>{
  const changed=buildWeeklyMetricEvidence({stats:{contacts:2},definitions:{contacts:'new definition'}},{stats:{contacts:1}},'company')[0];
  assert.equal(changed.comparison.reason,'definition-changed');assert.equal(changed.comparison.delta,null);
  const rate=buildWeeklyMetricEvidence({stats:{focusRate:60}},{stats:{focusRate:40}},'personal')[0];
  assert.equal(rate.comparison.delta,20);assert.equal(rate.comparison.deltaUnit,'%p');assert.equal(rate.comparison.percentChange,50);
});
