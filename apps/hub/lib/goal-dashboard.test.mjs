import assert from 'node:assert/strict';
import test from 'node:test';
import { goalDashboardSnapshot } from './goal-dashboard.js';

const objective = (id = 'o1', patch = {}) => ({ id, scope: 'personal', status: 'active', periodStart: '2026-10-01', periodEnd: '2026-10-31', timezone: 'Asia/Seoul', ...patch });
const metric = (id, progress, patch = {}) => ({ id, objectiveId: 'o1', role: 'outcome', status: 'active', sourceKey: 'manual', direction: 'increase', baseline: 0, target: 10, measurement: { coverage: 'complete', value: progress / 10 }, progress: { state: 'in_progress', achieved: false, value: progress }, ...patch });
const observation = (id, observedAt, patch = {}) => ({ id, metricId: 'm1', observedAt, coverage: 'complete', value: 0, ...patch });
const model = (patch = {}) => ({ metrics: [], observations: [], failedSources: [], truncatedSources: [], ...patch });

test('summary averages measured KRs only, excluding health, reference, archived and unread measurements', () => {
  const result = goalDashboardSnapshot(model({ metrics: [metric('m1', 40), metric('m2', 80), metric('health', 100, { role: 'guardrail' }), metric('reference', 100, { target: null }), metric('archived', 100, { status: 'archived' }), metric('missing', 0, { measurement: { coverage: 'unmeasured', value: null } }), metric('partial', 90, { measurement: { coverage: 'partial', value: 9 } })] }), [objective()], '2026-10-18');
  assert.equal(result.progress, 60);
  assert.equal(result.measured, 2);
  assert.equal(result.unmeasured, 2);
  assert.equal(result.keyResults.length, 4);
  assert.equal(Math.round(result.expected), 58);
});

test('confirmed zero stays zero while a wholly unmeasured summary stays null', () => {
  assert.equal(goalDashboardSnapshot(model({ metrics: [metric('m1', 0)] }), [objective()], '2026-10-18').progress, 0);
  const result = goalDashboardSnapshot(model({ metrics: [metric('m1', 0, { measurement: { coverage: 'unmeasured', value: null } })] }), [objective()], '2026-10-18');
  assert.equal(result.progress, null);
  assert.equal(result.expected, null);
});

test('time marker is withheld when measured KRs include ended or upcoming periods', () => {
  const result = goalDashboardSnapshot(model({ metrics: [metric('m1', 20), metric('m2', 80, { objectiveId: 'o2' })] }), [objective(), objective('o2', { periodStart: '2026-09-01', periodEnd: '2026-09-30' })], '2026-10-18');
  assert.equal(result.progress, 50);
  assert.equal(result.expected, null);
});

test('scope and search restrict KRs, records and recent cards to the visible objectives', () => {
  const result = goalDashboardSnapshot(model({ metrics: [metric('m1', 40), metric('m2', 100, { objectiveId: 'o2' })], observations: [observation('a', '2026-10-18T01:00:00Z'), observation('b', '2026-10-18T02:00:00Z', { metricId: 'm2' })] }), [objective()], '2026-10-18');
  assert.equal(result.progress, 40);
  assert.deepEqual(result.recent.map(row => row.observation.id), ['a']);
  assert.equal(result.weeks.at(-1).complete, 1);
});

test('weekly count uses Seoul Monday boundaries and counts observations, never their value sum', () => {
  const result = goalDashboardSnapshot(model({ metrics: [metric('m1', 40)], observations: [observation('sunday', '2026-10-11T14:59:59Z', { value: 900 }), observation('monday', '2026-10-11T15:00:00Z', { value: 300 }), observation('pending', '2026-10-12T05:00:00Z', { coverage: 'partial', value: 8 })] }), [objective()], '2026-10-18');
  assert.equal(result.weeks.length, 7);
  assert.equal(result.weeks.at(-1).start, '2026-10-12');
  assert.equal(result.weeks.at(-1).complete, 1);
  assert.equal(result.weeks.at(-1).pending, 1);
  assert.equal(result.weeks.at(-2).complete, 1);
});

test('missing and capped observation sources do not turn unknown weeks into confirmed zeros', () => {
  for (const patch of [{ failedSources: ['operating_observations'] }, { truncatedSources: ['operating_observations'] }]) {
    const result = goalDashboardSnapshot(model(patch), [objective()], '2026-10-18');
    assert.notEqual(result.observationState, 'live');
    assert.ok(result.weeks.every(week => !week.known));
  }
  const result = goalDashboardSnapshot(model(), [objective()], '2026-10-18');
  assert.ok(result.weeks.every(week => week.known && week.complete === 0));
});

test('recent readings are sorted, capped, and reject future days and invalid dates', () => {
  const observations = Array.from({ length: 8 }, (_, i) => observation(String(i), `2026-10-${String(i + 1).padStart(2, '0')}T01:00:00Z`));
  observations.push(observation('future', '2026-10-19T01:00:00Z'), observation('invalid', 'bad-date'));
  const result = goalDashboardSnapshot(model({ metrics: [metric('m1', 40)], observations }), [objective()], '2026-10-18');
  assert.deepEqual(result.recent.map(row => row.observation.id), ['7', '6', '5', '4', '3']);
});

test('pace respects the objective timezone at a Seoul date boundary', () => {
  const result = goalDashboardSnapshot(model({ metrics: [metric('m1', 20)] }), [objective('o1', { timezone: 'America/Los_Angeles', periodStart: '2026-10-18' })], '2026-10-18', '2026-10-17T15:05:00Z');
  assert.equal(result.keyResults[0].period.phase, 'upcoming');
  assert.equal(result.keyResults[0].tone, 'wait');
});
