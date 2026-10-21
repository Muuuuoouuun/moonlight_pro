import assert from 'node:assert/strict';
import test from 'node:test';
import { collapsedTodayAgendaRows, todayAgendaRows, recordFirstRows } from './workflow-reading.js';
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

test('collapsed timeline keeps the next start after three past events, in chronological order', () => {
  const items = [9, 10, 11, 16, 17].map(hour => ({
    id: `local-${hour}`, outcomeKey: `original-${hour}`,
    whenAt: `2026-10-20T${String(hour).padStart(2, '0')}:00:00+09:00`,
  }));
  const rows = todayAgendaRows(items, '2026-10-20T15:00:00+09:00');
  const visible = collapsedTodayAgendaRows(rows);
  assert.deepEqual(visible.map(row => row.event.id), ['local-11', 'local-16', 'local-17']);
  assert.equal(visible.filter(row => row.next).length, 1);
  assert.equal(visible[1].event, items[3], 'the original event owns outcome writes');
  assert.equal(visible[0].label, '시작 시각 지남', 'a preceding start is not called ongoing or completed');
});

test('all-day rows cannot crowd the next start out of the collapsed timeline', () => {
  const items = [
    ...[1, 2, 3, 4].map(id => ({ id: `all-${id}`, allDay: true })),
    { id: 'past', whenAt: '2026-10-20T10:00:00+09:00' },
    { id: 'next', whenAt: '2026-10-20T16:00:00+09:00' },
    { id: 'later', whenAt: '2026-10-20T17:00:00+09:00' },
  ];
  const rows = todayAgendaRows(items, '2026-10-20T15:00:00+09:00');
  assert.deepEqual(collapsedTodayAgendaRows(rows).map(row => row.event.id), ['all-1', 'past', 'next']);
  assert.equal(rows.length, items.length, 'expanded input retains every event');
});

test('collapsed timeline handles no next start, missing times and the advancing clock', () => {
  const items = [9, 10, 11, 16, 17].map(hour => ({
    id: `local-${hour}`, whenAt: `2026-10-20T${String(hour).padStart(2, '0')}:00:00+09:00`,
  }));
  assert.deepEqual(collapsedTodayAgendaRows(todayAgendaRows(items, '2026-10-20T18:00:00+09:00')).map(row => row.event.id), ['local-11', 'local-16', 'local-17']);
  const before = todayAgendaRows(items, '2026-10-20T10:30:00+09:00');
  const after = todayAgendaRows(items, '2026-10-20T11:30:00+09:00');
  assert.ok(collapsedTodayAgendaRows(before).some(row => row.event.id === 'local-11' && row.next));
  assert.ok(collapsedTodayAgendaRows(after).some(row => row.event.id === 'local-16' && row.next));
  const untimed = todayAgendaRows([1, 2, 3, 4].map(id => ({ id })));
  assert.deepEqual(collapsedTodayAgendaRows(untimed), untimed.slice(0, 3));
  assert.deepEqual(collapsedTodayAgendaRows([]), []);
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
