import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGoalProgress } from '../../../packages/goal-contracts/index.js';
import { goalMetricReading, keyResultPace, keyResultScore, kpiBulletReading, kpiHealth, metricFreshnessLabel, objectivePeriod, periodWeeks, weeklyCells, zeroKeepWeeks } from './goal-concepts.js';
import { goalKpiRows } from './goal-input-ux.js';

const objective = { id: 'objective', scope: 'personal', status: 'active', periodStart: '2026-10-01', periodEnd: '2026-10-31', timezone: 'Asia/Seoul' };
const metric = { id: 'metric', objectiveId: objective.id, role: 'driver', direction: 'increase', baseline: 0, target: 10, sourceKey: 'manual', unit: '건' };
const observation = (value, day, coverage = 'complete', extra = {}) => ({ metricId: metric.id, periodStart: objective.periodStart, periodEnd: objective.periodEnd, value, coverage, observedAt: `${day}T03:00:00Z`, ...extra });

for (const [start, end, days] of [['2027-02-01', '2027-02-28', 28], ['2028-02-01', '2028-02-29', 29], ['2026-09-01', '2026-09-30', 30], ['2026-10-01', '2026-10-31', 31]]) {
  test(`partial-week quotas retain the ${days}-day period denominator`, () => {
    const period = { ...objective, periodStart: start, periodEnd: end };
    for (const baseline of [0, 5]) for (const span of [1, 10, 100]) {
      const cells = weeklyCells({ ...metric, baseline, target: baseline + span }, period, [], end);
      assert.equal(cells.reduce((sum, cell) => sum + cell.days, 0), days);
      assert.ok(Math.abs(cells.reduce((sum, cell) => sum + cell.quota, 0) - span) < 1e-10);
      for (const cell of cells) assert.ok(Math.abs(cell.quota - span * cell.days / days) < 1e-10);
    }
  });
}

test('October target 10 has five proportionate shares totalling 10, with no rounded weekly target', () => {
  const cells = weeklyCells(metric, objective, [], '2026-10-05');
  assert.deepEqual(cells.map(cell => cell.days), [4, 7, 7, 7, 6]);
  assert.equal(cells.reduce((sum, cell) => sum + cell.quota, 0), 10);
  const pace = keyResultPace(metric, objective, [], '2026-10-05');
  assert.equal(pace.weeklyPace, 70 / 31);
  assert.equal(pace.weekQuota, cells[1].quota);
});

test('one-day and invalid periods never divide by zero or normalize invalid dates', () => {
  const one = { ...objective, periodStart: '2026-12-31', periodEnd: '2026-12-31' };
  assert.equal(weeklyCells(metric, one, [], '2026-12-31')[0].quota, 10);
  assert.equal(objectivePeriod(one, '2026-12-31').elapsed, 1);
  assert.equal(objectivePeriod(one, '2027-01-01').phase, 'ended');
  for (const broken of [{ ...one, periodStart: '2026-02-30' }, { ...one, periodEnd: '2026-12-30' }]) {
    assert.equal(objectivePeriod(broken, '2026-12-31').phase, 'unknown');
    assert.deepEqual(periodWeeks(broken, '2026-12-31'), []);
    assert.deepEqual(weeklyCells(metric, broken, [], '2026-12-31'), []);
  }
});

test('a confirmed zero inside a week differs from a week without any observation', () => {
  const cells = weeklyCells(metric, objective, [observation(0, '2026-10-03')], '2026-10-08');
  assert.deepEqual(cells.map(cell => cell.done), [0, null, null, null, null]);
  assert.equal(keyResultPace({ ...metric, measurement: { value: 0, coverage: 'complete' } }, objective, [], '2026-10-08').weekDone, null);
});

test('missing boundary observations and a latest partial observation do not invent weekly shares', () => {
  assert.equal(weeklyCells(metric, objective, [observation(5, '2026-10-08')], '2026-10-08')[1].done, null);
  const rows = [observation(2, '2026-10-04'), observation(4, '2026-10-07'), observation(7, '2026-10-08', 'partial')];
  assert.equal(weeklyCells(metric, objective, rows, '2026-10-08')[1].done, null);
  assert.equal(weeklyCells(metric, objective, [observation(2, '2026-10-04', 'partial'), observation(4, '2026-10-07')], '2026-10-08')[1].done, null);
});

test('a weekly amount excludes observations for other metrics, periods, prior dates and future dates', () => {
  const rows = [
    observation(99, '2026-09-30'), observation(99, '2026-10-03', 'complete', { metricId: 'other' }),
    observation(99, '2026-10-03', 'complete', { periodStart: '2026-09-01' }),
    observation(99, '2026-10-09'), observation(99, '2026-11-01'), observation(2, '2026-10-03'),
  ];
  assert.deepEqual(weeklyCells(metric, objective, rows, '2026-10-08').map(cell => cell.done), [2, null, null, null, null]);
});

test('weekly observation boundaries use the objective timezone instead of a fixed Seoul day', () => {
  const period = { ...objective, timezone: 'America/New_York' };
  const rows = [observation(2, '2026-10-04'), observation(4, '2026-10-05', 'complete', { observedAt: '2026-10-05T01:00:00Z' })];
  assert.deepEqual(weeklyCells(metric, period, rows, '2026-10-05').slice(0, 2).map(cell => cell.done), [4, null]);
});

test('automatic period totals do not pretend to be historical weekly measurements', () => {
  const auto = { ...metric, sourceKey: 'tasks_completed', measurement: { coverage: 'complete', value: 5, observedAt: '2026-10-05T03:00:00Z' } };
  assert.equal(keyResultPace(auto, objective, [], '2026-10-05').weekDone, null);
  assert.ok(weeklyCells(auto, objective, [observation(5, '2026-10-05')], '2026-10-05').every(cell => cell.done === null));
  assert.equal(metricFreshnessLabel(auto, '2026-10-05'), '오늘 집계 조회 · 원천 최신일 미확인');
});

test('lower-is-better, zero targets, ranges and an unknown baseline have no additive weekly quota', () => {
  for (const item of [{ ...metric, direction: 'decrease', target: 0 }, { ...metric, direction: 'range', targetMin: 1, targetMax: 3 }, { ...metric, target: 0 }, { ...metric, baseline: null }]) {
    assert.equal(keyResultPace(item, objective, [], '2026-10-05'), null);
    assert.deepEqual(weeklyCells(item, objective, [], '2026-10-05'), []);
  }
});

test('zero-keep counts the actual zero line, not a zero change after a previous violation', () => {
  const zero = { ...metric, direction: 'decrease', target: 0 };
  const cells = zeroKeepWeeks(zero, objective, [observation(1, '2026-10-03'), observation(1, '2026-10-08'), observation(0, '2026-10-14', 'partial')], '2026-10-14');
  assert.deepEqual(cells.cells.map(cell => cell.state), ['broken', 'broken', 'pending', 'future', 'future']);
  assert.equal(cells.streak, 0);
  assert.equal(zeroKeepWeeks(zero, objective, [observation(0, '2026-10-03')], '2026-10-03').cells[0].state, 'kept');
});

test('KR score and floor achievement percentage are separate for increase and lower-is-better', () => {
  for (const item of [metric, { ...metric, baseline: 10, target: 0, direction: 'decrease' }]) {
    const measured = { ...item, measurement: { coverage: 'complete', value: 5 } };
    measured.progress = calculateGoalProgress(measured, measured.measurement);
    const reading = goalMetricReading(measured);
    assert.equal(reading.score, 0.35);
    assert.equal(reading.achievementPercent, 50);
  }
  const reached = { ...metric, measurement: { coverage: 'complete', value: 10 }, progress: { state: 'achieved', value: 100, achieved: true } };
  assert.equal(goalMetricReading(reached).score, 0.7);
  assert.equal(goalMetricReading(reached).achievementPercent, 100);
});

test('partial, unavailable, KPI and reference readings never show an earned KR score', () => {
  const achieved = { ...metric, progress: { state: 'achieved', value: 100, achieved: true } };
  for (const coverage of ['partial', 'unmeasured']) assert.equal(keyResultScore({ ...achieved, measurement: { coverage, value: 0 } }), null);
  assert.equal(goalMetricReading({ ...achieved, role: 'guardrail' }).score, null);
  assert.equal(goalMetricReading({ ...achieved, target: null }).concept, 'reference');
  assert.equal(kpiHealth({ ...achieved, measurement: { coverage: 'partial', value: 50 } }), 'partial');
  assert.equal(kpiHealth({ ...achieved, measurement: { coverage: 'unmeasured', value: null } }), 'unmeasured');
});

test('latest partial numeric and bullet values are both 50, with the old complete 10 as a comparison only', () => {
  const item = { ...metric, measurement: { value: 50, coverage: 'partial', observedAt: '2026-10-05T03:00:00Z' } };
  const reading = kpiBulletReading(item, [observation(10, '2026-10-01'), observation(50, '2026-10-05', 'partial')]);
  assert.deepEqual(reading, { now: 50, partial: true, previous: 10, previousAt: '2026-10-01T03:00:00Z' });
});

test('the bullet distinguishes measured zero from unavailable and does not use the current or future record as previous', () => {
  const item = { ...metric, measurement: { value: 0, coverage: 'complete', observedAt: '2026-10-05T03:00:00Z' } };
  const rows = [observation(10, '2026-10-01'), observation(0, '2026-10-05'), observation(99, '2026-10-06')];
  assert.equal(kpiBulletReading(item, rows).now, 0);
  assert.equal(kpiBulletReading(item, rows).previous, 10);
  assert.equal(kpiBulletReading({ ...item, measurement: { ...item.measurement, coverage: 'unmeasured' } }, rows).now, null);
  assert.equal(kpiBulletReading({ ...item, measurement: undefined }, rows).now, null);
});

test('stale manual observations stay dated, while missing timestamps remain unknown', () => {
  const item = { ...metric, measurement: { observedAt: '2026-10-01T03:00:00Z' } };
  assert.equal(metricFreshnessLabel(item, '2026-10-05'), '4일 전 관측');
  assert.equal(metricFreshnessLabel({ ...item, measurement: {} }, '2026-10-05'), '관측 시각 미확인');
});

test('KPI name search preserves active/archived state, excludes archived metrics and respects the supplied scope', () => {
  const model = { objectives: [{ ...objective, title: '성과 목표' }, { ...objective, id: 'company', scope: 'company', title: '회사 목표' }, { ...objective, id: 'old', status: 'archived', title: '지난 목표' }], metrics: [
    { ...metric, name: 'Energy', role: 'guardrail' }, { ...metric, id: 'kr', name: 'Energy', role: 'driver' },
    { ...metric, id: 'company-metric', objectiveId: 'company', name: 'Energy', role: 'guardrail' },
    { ...metric, id: 'old-metric', objectiveId: 'old', name: 'Energy', role: 'guardrail' },
    { ...metric, id: 'archived-metric', name: 'Energy', role: 'guardrail', status: 'archived' },
  ] };
  assert.deepEqual(goalKpiRows(model, { search: ' ENERGY ' }).map(row => row.metric.id), ['metric', 'company-metric']);
  assert.deepEqual(goalKpiRows(model, { search: '지난', status: 'archived' }).map(row => row.metric.id), ['old-metric']);
  const personal = { ...model, objectives: model.objectives.filter(item => item.scope === 'personal') };
  assert.deepEqual(goalKpiRows(personal, { search: 'energy' }).map(row => row.metric.id), ['metric']);
  assert.equal(goalKpiRows(personal, { search: 'unknown' }).length, 0);
  assert.equal(goalKpiRows(personal).length, 1);
  assert.equal(goalKpiRows({ objectives: [objective], metrics: [] }).length, 0);
});

test('truncated or invalid-time observation histories cannot certify weekly amounts or zero-keep streaks', () => {
  for (const reason of ['observation-history-incomplete', 'invalid-observation-time']) {
    const item = { ...metric, measurement: { coverage: 'partial', value: 0, reason } };
    const rows = [observation(0, '2026-10-03')];
    assert.ok(weeklyCells(item, objective, rows, '2026-10-05').every(cell => cell.done === null));
    assert.equal(zeroKeepWeeks({ ...item, direction: 'decrease', target: 0 }, objective, rows, '2026-10-05').streak, 0);
  }
  assert.equal(metricFreshnessLabel({ ...metric, measurement: { observedAt: '2027-01-01T00:00:00Z', reason: 'invalid-observation-time' } }, '2026-10-05'), '관측 시각 확인 필요');
});

test('bullet comparisons exclude other metrics and another objective period', () => {
  const item = { ...metric, measurement: { value: 50, coverage: 'partial', observedAt: '2026-10-05T03:00:00Z', periodStart: objective.periodStart, periodEnd: objective.periodEnd } };
  const rows = [observation(10, '2026-10-01'), observation(20, '2026-10-04', 'complete', { metricId: 'other' }), observation(30, '2026-10-04', 'complete', { periodStart: '2026-09-01' })];
  assert.equal(kpiBulletReading(item, rows).previous, 10);
});

test('a corrected cumulative value preserves a negative observation change instead of manufacturing zero', () => {
  const rows = [observation(4, '2026-10-04'), observation(3, '2026-10-08')];
  assert.equal(weeklyCells(metric, objective, rows, '2026-10-08')[1].done, -1);
});
