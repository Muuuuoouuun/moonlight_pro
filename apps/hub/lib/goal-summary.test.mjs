import assert from 'node:assert/strict';
import test from 'node:test';
import { goalSummary } from './goal-summary.js';

const objective = { id: 'o', title: '목표', status: 'active', periodStart: '2026-10-01', periodEnd: '2026-10-31' };
const metric = (id, role, target = 10) => ({ id, objectiveId: 'o', name: id, role, direction: 'increase', target, measurement: { coverage: 'complete', value: 5 }, progress: { state: 'in_progress', value: 50, achieved: false } });
const model = (metrics, extra = {}) => ({ status: 'live', objectives: [objective], metrics, observations: [], links: [], ...extra });

test('summary scores KRs separately and limits drivers while preserving KPI truth', () => {
  const summary = goalSummary(model([metric('result', 'outcome'), metric('one', 'driver'), metric('two', 'driver'), metric('three', 'driver'), metric('reference', 'outcome', null), metric('line', 'guardrail')]), '2026-10-03');
  assert.equal(summary.objectives[0].score.score, 0.35);
  assert.equal(summary.objectives[0].score.scored, 4);
  assert.deepEqual(summary.objectives[0].drivers.map(row => row.metric.id), ['one', 'two']);
  assert.equal(summary.kpis.outside, 1);
  assert.equal(summary.kpis.unmeasured, 0);
});

test('archived objectives and metrics do not appear in active summary', () => {
  const summary = goalSummary(model([metric('active', 'outcome'), { ...metric('old', 'driver'), status: 'archived' }, { ...metric('other', 'guardrail'), objectiveId: 'archived' }], { objectives: [objective, { ...objective, id: 'archived', status: 'archived' }] }), '2026-10-03');
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.objectives[0].score.scored, 1);
  assert.equal(summary.kpis.total, 0);
});

test('missing measurements stay unknown and failed metric reads cannot show a clean KPI count', () => {
  const summary = goalSummary(model([{ ...metric('unknown', 'driver'), measurement: null, progress: { state: 'unmeasured' } }], { status: 'partial', failedSources: ['operating_metrics'] }), '2026-10-03');
  assert.equal(summary.objectives[0].score.score, null);
  assert.equal(summary.objectives[0].drivers[0].pace, null);
  assert.deepEqual(summary.objectives[0].drivers[0].cells, []);
  assert.equal(summary.metricState, 'error');
});

test('summary retains the next linked milestone and does not call an ended goal on pace', () => {
  const summary = goalSummary(model([metric('result', 'outcome')], { links: [{ objectiveId: 'o', entityType: 'tasks', entityTitle: '모집', dueAt: '2026-10-09T00:00:00+09:00', taskStatus: 'active' }] }), '2026-11-01');
  assert.equal(summary.objectives[0].period.phase, 'ended');
  assert.equal(summary.objectives[0].milestone.entityTitle, '모집');
});

test('automatic cumulative metrics cannot manufacture weekly cells from snapshot observations', () => {
  const summary = goalSummary(model([{ ...metric('auto', 'driver', 31), sourceKey: 'tasks_completed' }], { observations: [{ metricId: 'auto', value: 5, coverage: 'complete', observedAt: '2026-10-03T03:00:00Z' }] }), '2026-10-05');
  assert.deepEqual(summary.objectives[0].drivers[0].cells, []);
});
