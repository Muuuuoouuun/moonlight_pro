import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskDraft, buildTaskEditDraft, buildTaskPatch } from './pms-ui.js';
import { mergeSavedTask } from './pms-work-items.js';
let checks; try { checks = await import('./task-checklist.js'); } catch {}
const checklist = [
  { id: '11111111-1111-4111-8111-111111111111', title: '준비', done: true, note: '자료 정리' },
  { id: '22222222-2222-4222-8222-222222222222', title: '확인', done: false, note: '' },
];
const source = { id: 'task', checklist, updatedAt: '2026-09-13T01:00:00.123456Z' };

test('checklist progress is evidence-based and absent checklists never become fake zero percent', () => {
  assert.ok(checks, 'task checklist helpers exist');
  assert.deepEqual(checks.buildTaskChecklistProgress(source), { value: 50, done: 1, total: 2, source: 'checklist', label: '체크리스트' });
  assert.equal(checks.buildTaskChecklistProgress({ status: 'done' }).value, null);
  assert.equal(checks.buildTaskChecklistProgress({ ...source, status: 'done' }).value, 50);
});

test('drafts clone checklist entries and only include a checklist patch when edited', () => {
  assert.deepEqual(buildTaskDraft().checklist, []);
  const draft = buildTaskEditDraft(source);
  assert.deepEqual(draft.checklist, checklist);
  assert.notEqual(draft.checklist[0], checklist[0]);
  assert.deepEqual(buildTaskPatch(source, draft), { id: 'task' });
  assert.deepEqual(buildTaskPatch(source, { ...draft, checklist: [] }), { id: 'task', checklist: [], expectedUpdatedAt: source.updatedAt });
  assert.deepEqual(buildTaskPatch(source, { ...draft, checklist: [...checklist].reverse() }).checklist, [...checklist].reverse());
});

test('database echoes immediately replace the checklist while preserving other task fields', () => {
  const merged = mergeSavedTask({ ...source, title: '하위 아이템' }, { id: 'task', meta: { checklist: [checklist[0]] } });
  assert.deepEqual(merged.checklist, [checklist[0]]);
  assert.equal(merged.title, '하위 아이템');
});

test('overlapping checklist changes require an explicit choice, unrelated edits do not', () => {
  assert.ok(checks);
  const local = { ...source, checklist: checklist.map(item => ({ ...item, done: true })) };
  const server = { ...source, checklist: [checklist[0]] };
  assert.equal(checks.hasChecklistConflict(source, local, server), true);
  assert.equal(checks.hasChecklistConflict(source, local, { ...source, title: '서버 변경' }), false);
  assert.equal(checks.hasChecklistConflict(source, local, local), false);
});
