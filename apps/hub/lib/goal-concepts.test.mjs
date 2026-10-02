import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLOOR_SCORE, daysSinceObservation, floorPaceScore, goalConcept, hasTarget, keyResultPace, paceSuggestion, keyResultScore, kpiHealth, kpiSummary, kpiThresholdLabel, kpiTrend,
  objectivePace, objectivePeriod, objectiveScore, objectiveSuggestion, sortKpis, splitObjectiveMetrics,
} from './goal-concepts.js';

const metric = (role, progress, extra = {}) => ({ id: `${role}-${Math.random()}`, objectiveId: 'o1', role, progress, status: 'active', ...extra });

test('role decides the concept: outcome·driver are KRs, guardrail is a KPI', () => {
  assert.equal(goalConcept({ role: 'outcome' }), 'kr');
  assert.equal(goalConcept({ role: 'driver' }), 'kr');
  assert.equal(goalConcept({ role: 'guardrail' }), 'kpi');
  const split = splitObjectiveMetrics([
    metric('outcome', null, { direction: 'increase', target: 1 }), metric('driver', null, { direction: 'increase', target: 6 }), metric('guardrail', null), metric('driver', null, { status: 'archived', target: 2 }), metric('outcome', null, { objectiveId: 'o2', target: 1 }),
  ], 'o1');
  assert.equal(split.keyResults.length, 2);
  assert.equal(split.references.length, 0);
  assert.equal(split.healthIndicators.length, 1);
});

test('a metric without a target line is a reference reading, not a KR', () => {
  assert.equal(hasTarget({ direction: 'increase', target: 0 }), true);
  assert.equal(hasTarget({ direction: 'increase', target: null }), false);
  assert.equal(hasTarget({ direction: 'range', targetMin: 3, targetMax: 5 }), true);
  assert.equal(hasTarget({ direction: 'range', targetMin: 3, targetMax: null }), false);
  const split = splitObjectiveMetrics([
    metric('outcome', null, { direction: 'increase', target: 1 }),
    metric('outcome', null, { direction: 'increase', target: null }),
    metric('driver', null, { direction: 'increase', target: null }),
    metric('guardrail', null, { direction: 'decrease', target: null }),
  ], 'o1');
  assert.equal(split.keyResults.length, 1);
  assert.equal(split.references.length, 2);
  assert.equal(split.healthIndicators.length, 1);
});

test('KR score follows the floor 0.7 grading, and unmeasured KRs are not scored as zero', () => {
  assert.equal(FLOOR_SCORE, 0.7);
  assert.equal(keyResultScore({ progress: { state: 'achieved', achieved: true, value: 100 } }), 0.7);
  assert.ok(Math.abs(keyResultScore({ progress: { state: 'in_progress', achieved: false, value: 40 } }) - 0.28) < 1e-9);
  assert.equal(keyResultScore({ progress: { state: 'in_progress', achieved: false, value: null } }), null);
  assert.equal(keyResultScore({ progress: { state: 'unmeasured', achieved: null, value: null } }), null);
  const result = objectiveScore([
    { progress: { state: 'achieved', achieved: true, value: 100 } },
    { progress: { state: 'in_progress', achieved: false, value: 50 } },
    { progress: { state: 'unmeasured', achieved: null, value: null } },
  ]);
  assert.ok(Math.abs(result.score - 0.525) < 1e-9);
  assert.equal(result.scored, 2);
  assert.equal(result.unscored, 1);
  assert.equal(objectiveScore([]).score, null);
});

test('period elapsed counts both end days and pace speaks in words only', () => {
  const objective = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };
  assert.deepEqual(objectivePeriod(objective, '2026-09-30'), { phase: 'upcoming', elapsed: 0, daysLeft: 32 });
  const mid = objectivePeriod(objective, '2026-10-16');
  assert.equal(mid.phase, 'running');
  assert.equal(mid.daysLeft, 15);
  assert.ok(Math.abs(mid.elapsed - 16 / 31) < 1e-9);
  assert.equal(objectivePeriod(objective, '2026-11-01').phase, 'ended');
  // 바닥 페이스 = 0.7 × 16/31 ≈ 0.361, 허용폭 0.07
  assert.ok(Math.abs(floorPaceScore(mid) - 0.7 * 16 / 31) < 1e-9);
  assert.equal(objectivePace(0.45, mid), '바닥 페이스보다 앞섬');
  assert.equal(objectivePace(0.36, mid), '바닥 페이스와 비슷함');
  assert.equal(objectivePace(0.25, mid), '바닥 페이스보다 늦음');
  assert.equal(objectivePace(null, mid), null);
  assert.equal(objectivePace(0.5, { phase: 'ended', elapsed: 1 }), null);
});

test('KPI health is inside/outside the line, never a score', () => {
  assert.equal(kpiHealth({ progress: { state: 'achieved', achieved: true } }), 'inside');
  assert.equal(kpiHealth({ progress: { state: 'in_progress', achieved: false } }), 'outside');
  assert.equal(kpiHealth({ progress: { state: 'partial' } }), 'partial');
  assert.equal(kpiHealth({ progress: { state: 'target_unset' } }), 'unset');
  assert.equal(kpiHealth({ progress: { state: 'unmeasured' } }), 'unmeasured');
  assert.equal(kpiHealth({}), 'unmeasured');
});

test('KPI rows sort breaches first and the summary separates outside from not-yet-measured', () => {
  const rows = ['inside', 'unmeasured', 'outside', 'inside', 'partial'].map((health, index) => ({ health, index }));
  assert.deepEqual(sortKpis(rows).map(row => row.health), ['outside', 'unmeasured', 'partial', 'inside', 'inside']);
  assert.deepEqual(sortKpis(rows).filter(row => row.health === 'inside').map(row => row.index), [0, 3]);
  assert.deepEqual(kpiSummary(rows), { total: 5, inside: 2, outside: 1, unmeasured: 2 });
});

test('threshold copy follows the direction', () => {
  assert.equal(kpiThresholdLabel({ direction: 'range', targetMin: 60, targetMax: 100, unit: '%' }), '60–100 % 안');
  assert.equal(kpiThresholdLabel({ direction: 'decrease', target: 0, unit: '건' }), '0 건 이하');
  assert.equal(kpiThresholdLabel({ direction: 'increase', target: 3, unit: '점' }), '3 점 이상');
});

test('trend keeps only confirmed numeric observations in time order', () => {
  const observations = [
    { coverage: 'complete', value: 3, observedAt: '2026-10-08T00:00:00Z' },
    { coverage: 'partial', value: 9, observedAt: '2026-10-09T00:00:00Z' },
    { coverage: 'complete', value: 1, observedAt: '2026-10-01T00:00:00Z' },
    { coverage: 'complete', value: null, observedAt: '2026-10-02T00:00:00Z' },
  ];
  assert.deepEqual(kpiTrend(observations), [1, 3]);
  assert.deepEqual(kpiTrend(observations, 1), [3]);
});

test('days since the last observation use the Seoul calendar day', () => {
  assert.equal(daysSinceObservation([], '2026-10-10'), null);
  assert.equal(daysSinceObservation([{ observedAt: '2026-10-07T20:00:00Z' }], '2026-10-10'), 2);
  assert.equal(daysSinceObservation([{ observedAt: '2026-10-10T01:00:00Z' }], '2026-10-10'), 0);
});

test('at most one suggestion, and only for a real deviation from OKR practice', () => {
  const kr = role => ({ role });
  assert.match(objectiveSuggestion([], [kr('guardrail')]), /KR이 없습니다/);
  assert.equal(objectiveSuggestion([], []), null);
  assert.match(objectiveSuggestion(Array.from({ length: 6 }, () => kr('outcome')), []), /5개를 넘으면/);
  assert.match(objectiveSuggestion([kr('driver')], []), /결과 KR이 없으면/);
  assert.equal(objectiveSuggestion([kr('outcome'), kr('driver')], []), null);
});

const october = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };
const count = (target, value, extra = {}) => ({ direction: 'increase', target, baseline: 0, unit: '건', name: '가격 제시', measurement: value === null ? { coverage: 'unmeasured' } : { coverage: 'complete', value }, ...extra });

test('weekly pace splits the period target and stays silent below one per week', () => {
  assert.equal(keyResultPace(count(6, null), october, [], '2026-10-01').weeklyPace, 2);
  assert.equal(keyResultPace(count(8, null), october, [], '2026-10-01').weeklyPace, 2);
  assert.equal(keyResultPace(count(1, null), october, [], '2026-10-01').weeklyPace, null);
  assert.equal(keyResultPace(count(6, null), october, [], '2026-09-30').phase, 'upcoming');
  assert.equal(keyResultPace(count(6, null), october, [], '2026-11-01'), null);
  assert.equal(keyResultPace({ ...count(0, 0), direction: 'decrease' }, october, [], '2026-10-10'), null);
});

test('expected progress line and behind/on/ahead use a 10% tolerance of the target', () => {
  const mid = '2026-10-16';
  const pace = value => keyResultPace(count(6, value), october, [], mid);
  assert.ok(Math.abs(pace(2).expected - 6 * (16 / 31)) < 1e-9);
  assert.equal(pace(2).state, 'behind');
  assert.equal(pace(3).state, 'on');
  assert.equal(pace(4).state, 'ahead');
  assert.equal(pace(null).state, 'unknown');
  assert.equal(pace(null).gap, null);
  assert.equal(keyResultPace(count(6, 0), october, [], '2026-10-01').state, 'on');
});

test('this-week share is measured from the last confirmed value before Monday', () => {
  const observations = [
    { coverage: 'complete', value: 2, observedAt: '2026-10-11T03:00:00Z' },
    { coverage: 'complete', value: 4, observedAt: '2026-10-13T03:00:00Z' },
  ];
  // 2026-10-14 is a Wednesday; its Monday is 10-12. Last value before that is 2 (10-11 Sunday).
  assert.equal(keyResultPace(count(6, 4), october, observations, '2026-10-14').weekDone, 2);
  assert.equal(keyResultPace(count(6, 3), october, [], '2026-10-14').weekDone, 3);
  assert.equal(keyResultPace(count(6, null), october, [], '2026-10-14').weekDone, null);
});

test('the pace suggestion names the most-behind KR only', () => {
  const rows = [
    { metric: { name: '고객 대화', unit: '건' }, pace: { state: 'behind', gap: -1, target: 8 } },
    { metric: { name: '가격 제시', unit: '건' }, pace: { state: 'behind', gap: -1.2, target: 6 } },
    { metric: { name: '결제', unit: '건' }, pace: { state: 'on', gap: 0, target: 1 } },
  ];
  assert.match(paceSuggestion(rows), /^가격 제시이\(가\) 기준선보다 1\.2건 늦습니다/);
  assert.equal(paceSuggestion([rows[2]]), null);
  assert.equal(paceSuggestion([]), null);
});

test('a KR under one per week is not judged behind until its last week', () => {
  assert.equal(keyResultPace(count(1, 0, { name: '결제' }), october, [], '2026-10-16').state, 'unknown');
  assert.equal(keyResultPace(count(1, 0, { name: '결제' }), october, [], '2026-10-27').state, 'behind');
  assert.equal(keyResultPace(count(1, 1, { name: '결제' }), october, [], '2026-10-27').state, 'ahead');
});

const obs = (value, day) => ({ coverage: 'complete', value, observedAt: `${day}T03:00:00Z` });

test('the period splits into Monday weeks with a short first week', async () => {
  const { periodWeeks } = await import('./goal-concepts.js');
  const weeks = periodWeeks(october, '2026-10-08');
  assert.deepEqual(weeks.map(week => [week.label, week.days, week.phase]), [['10/1–4', 4, 'past'], ['10/5', 7, 'now'], ['10/12', 7, 'future'], ['10/19', 7, 'future'], ['10/26', 6, 'future']]);
});

test('weekly cells turn cumulative observations into each week\'s share, and stay unknown without records', async () => {
  const { weeklyCells } = await import('./goal-concepts.js');
  const metric = count(6, 2);
  const cells = weeklyCells(metric, october, [obs(1, '2026-10-03'), obs(2, '2026-10-07')], '2026-10-08', 2);
  assert.deepEqual(cells.map(cell => cell.done), [1, 1, null, null, null]);
  assert.deepEqual(weeklyCells(metric, october, [], '2026-10-08', 2).map(cell => cell.done), [null, null, null, null, null]);
});

test('zero-keep weeks need a check inside the week and count the kept streak', async () => {
  const { isZeroKeep, zeroKeepWeeks } = await import('./goal-concepts.js');
  const metric = { direction: 'decrease', target: 0, baseline: 0 };
  assert.equal(isZeroKeep(metric), true);
  assert.equal(isZeroKeep({ direction: 'decrease', target: 2 }), false);
  const kept = zeroKeepWeeks(metric, october, [obs(0, '2026-10-02'), obs(0, '2026-10-06'), obs(0, '2026-10-13')], '2026-10-14');
  assert.deepEqual(kept.cells.map(cell => cell.state), ['kept', 'kept', 'kept', 'future', 'future']);
  assert.equal(kept.streak, 3);
  const broken = zeroKeepWeeks(metric, october, [obs(0, '2026-10-02'), obs(1, '2026-10-08')], '2026-10-14');
  assert.deepEqual(broken.cells.map(cell => cell.state), ['kept', 'broken', 'pending', 'future', 'future']);
  assert.equal(broken.streak, 0);
  assert.equal(zeroKeepWeeks(metric, october, [], '2026-10-14').cells[0].state, 'unknown');
});

test('bullet scale keeps percent on 0–100 and pads other units around the line', async () => {
  const { bulletScale } = await import('./goal-concepts.js');
  const share = bulletScale({ direction: 'range', targetMin: 60, targetMax: 100, unit: '%' }, [52, 66]);
  assert.deepEqual([share.min, share.max, share.band], [0, 100, [60, 100]]);
  assert.equal(share.at(52), 52);
  const energy = bulletScale({ direction: 'range', targetMin: 3, targetMax: 5, unit: '점' }, [3.4]);
  assert.ok(energy.min < 3 && energy.max > 5);
  assert.equal(bulletScale({ direction: 'range', targetMin: null, targetMax: 5 }), null);
});

test('milestones pick the nearest open task and the two latest finished ones', async () => {
  const { milestoneSummary } = await import('./goal-concepts.js');
  const link = (title, dueAt, taskStatus, extra = {}) => ({ entityType: 'tasks', entityTitle: title, dueAt, taskStatus, ...extra });
  const summary = milestoneSummary([
    link('모집 오픈', '2026-10-09T09:00:00Z', 'todo'),
    link('가격', '2026-10-03T09:00:00Z', 'todo'),
    link('규칙', '2026-10-02T09:00:00Z', 'done'),
    link('끊긴 연결', '2026-10-01T09:00:00Z', 'todo', { stale: true }),
    link('기한 없음', null, 'todo'),
  ], '2026-10-04');
  assert.equal(summary.next.entityTitle, '가격');
  assert.equal(summary.next.daysLeft, -1);
  assert.deepEqual(summary.done.map(row => row.entityTitle), ['규칙']);
  assert.equal(summary.openCount, 2);
});

test('the month-end verdict reads only floor reach of outcome and driver KRs', async () => {
  const { objectiveVerdict, floorStatus } = await import('./goal-concepts.js');
  const kr = (role, state) => ({ role, progress: state === 'reached' ? { state: 'achieved', achieved: true } : state === 'missed' ? { state: 'in_progress', achieved: false } : { state: 'partial' } });
  assert.equal(floorStatus(kr('outcome', 'reached')), 'reached');
  assert.equal(objectiveVerdict([kr('outcome', 'missed'), kr('driver', 'reached'), kr('driver', 'reached')]).key, 'change-one');
  assert.equal(objectiveVerdict([kr('outcome', 'reached'), kr('driver', 'reached')]).key, 'repeat');
  assert.equal(objectiveVerdict([kr('outcome', 'reached'), kr('driver', 'missed')]).key, 'redefine');
  assert.equal(objectiveVerdict([kr('outcome', 'missed'), kr('driver', 'missed')]).key, 'volume');
  assert.deepEqual(objectiveVerdict([kr('outcome', 'missed'), kr('driver', 'unknown')]), { key: null, reason: 'unmeasured', unknown: 1 });
  assert.equal(objectiveVerdict([kr('driver', 'reached')]).reason, 'needs-both');
});

test('the next period draft rolls a monthly objective to the next whole month', async () => {
  const { nextPeriodDraft } = await import('./goal-concepts.js');
  assert.deepEqual(nextPeriodDraft({ title: '10월 · 가진 것을 돈으로', periodStart: '2026-10-01', periodEnd: '2026-10-31' }), { title: '11월 · 가진 것을 돈으로', periodStart: '2026-11-01', periodEnd: '2026-11-30', monthly: true });
  assert.deepEqual(nextPeriodDraft({ title: '12월 결산', periodStart: '2026-12-01', periodEnd: '2026-12-31' }).periodEnd, '2027-01-31');
  assert.deepEqual(nextPeriodDraft({ title: '스프린트', periodStart: '2026-10-05', periodEnd: '2026-10-18' }), { title: '스프린트', periodStart: '2026-10-19', periodEnd: '2026-11-01', monthly: false });
});
