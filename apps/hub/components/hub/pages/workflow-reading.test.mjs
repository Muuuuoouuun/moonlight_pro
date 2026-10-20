import assert from 'node:assert/strict';
import test from 'node:test';
import { todayAgendaRows, recordFirstRows } from './workflow-reading.js';
import { goalCheckRows } from '../../../lib/goal-input-ux.js';

test('time flow sorts actual timestamps, keeps all-day separate, and never infers completion', () => {
  const events = [
    { id: 'later', whenAt: '2026-10-20T07:00:00Z', outcomeKey: 'original-later' },
    { id: 'past', whenAt: '2026-10-20T08:00:00+09:00' },
    { id: 'untimed', whenAt: 'invalid' },
    { id: 'all-day', whenAt: '2026-10-20', allDay: true },
    { id: 'next', whenAt: '2026-10-20T15:00:00+09:00' },
  ];
  const before = structuredClone(events);
  const rows = todayAgendaRows(events, '2026-10-20T14:00:00+09:00');
  assert.deepEqual(rows.map(row => row.event.id), ['all-day', 'past', 'next', 'later', 'untimed']);
  assert.deepEqual(rows.map(row => row.label), ['종일', '시작 시각 지남', '다음 시작', '예정', '시각 확인 필요']);
  assert.equal(rows.filter(row => row.next).length, 1);
  assert.equal(rows[3].event, events[0], 'outcome action receives the original event');
  assert.deepEqual(events, before, 'presentation must not alter schedule or outcome state');
});

test('time flow ties are deterministic and advancing time does not mark work done', () => {
  const events = ['b', 'a'].map(id => ({ id, whenAt: '2026-10-20T15:00:00+09:00' }));
  assert.deepEqual(todayAgendaRows(events, '2026-10-20T15:00:00+09:00').map(row => [row.event.id, row.next]), [['a', true], ['b', false]]);
  assert.ok(todayAgendaRows(events, '2026-10-20T16:00:00+09:00').every(row => row.label === '시작 시각 지남' && !row.next));
  assert.deepEqual(todayAgendaRows(null), []);
});

test('record-first respects objective scope and archive state and keeps real zero measured', () => {
  const active = { id: 'active', status: 'active', scope: 'personal' };
  const archived = { id: 'archived', status: 'archived' };
  const model = { objectives: [active, archived], metrics: [
    { id: 'zero', objectiveId: 'active', sourceKey: 'manual', measurement: { value: 0, coverage: 'complete' } },
    { id: 'missing', objectiveId: 'active', sourceKey: 'manual', measurement: { value: null, coverage: 'complete' } },
    { id: 'partial', objectiveId: 'active', sourceKey: 'manual', measurement: { value: 5, coverage: 'partial' } },
    { id: 'auto', objectiveId: 'active', sourceKey: 'tasks_completed' },
    { id: 'archived-metric', objectiveId: 'active', sourceKey: 'manual', status: 'archived' },
    { id: 'archived-goal', objectiveId: 'archived', sourceKey: 'manual' },
    { id: 'other-scope', objectiveId: 'company-goal', sourceKey: 'manual' },
  ] };
  const rows = goalCheckRows(model, { status: 'all' });
  const selected = recordFirstRows(rows);
  assert.deepEqual(selected.map(row => row.metric.id), ['missing', 'partial', 'zero']);
  assert.equal(selected[2].needsEvidence, false);
  assert.equal(selected[0].objective, active);
  assert.equal(selected[0].metric, model.metrics[1]);
  assert.deepEqual(recordFirstRows(rows, 1).map(row => row.metric.id), ['missing']);
});
