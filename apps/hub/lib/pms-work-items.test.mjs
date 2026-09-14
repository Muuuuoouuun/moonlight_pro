import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskEditDraft, buildTaskPatch } from './pms-ui.js';

let work;
try { work = await import('./pms-work-items.js'); } catch {}
const now = new Date('2026-09-12T16:00:00Z'); // 서울 9월 13일
const projects = [{ id: 'p1', name: '출시', brand: 'moon' }, { id: 'p2', name: '출시', brand: 'work' }];
const tasks = [
  { id: 'a', project: 'p1', title: '자료', status: 'inbox', priorityRaw: 'critical', dueAt: '', nextAction: '요청 범위 확인' },
  { id: 'b', project: 'p1', title: '검토', status: 'blocked', priorityRaw: 'medium', dueAt: '2026-09-12', nextAction: '고객 회신 확인' },
  { id: 'c', project: 'p2', title: '납품', status: 'doing', priorityRaw: 'high', dueAt: '2026-09-13' },
  { id: 'd', project: '', title: '정리', status: 'todo', priorityRaw: 'low', dueAt: '2026-09-14' },
  { id: 'e', project: 'p1', title: '지난 작업', status: 'done', priorityRaw: 'high', dueAt: '2026-09-01' },
];

test('editing a task preserves its next action, clearing it carries the exact source version', () => {
  const source = { ...tasks[0], updatedAt: '2026-09-13T01:00:00.123456Z' };
  const draft = buildTaskEditDraft(source);
  assert.equal(draft.nextAction, source.nextAction);
  assert.deepEqual(buildTaskPatch(source, { ...draft, nextAction: '' }), { id: 'a', nextAction: '', expectedUpdatedAt: source.updatedAt });
  assert.deepEqual(buildTaskPatch(source, draft), { id: 'a' });
});

test('execution filters round-trip without removing unrelated navigation parameters', () => {
  assert.ok(work, 'PMS work item model must exist');
  const params = work.writeTaskFilters(new URLSearchParams('view=board&brand=moon'), { projectId: 'p1', priority: 'critical', lens: 'blocked', sort: 'priority' });
  assert.equal(params.get('view'), 'board');
  assert.equal(params.get('brand'), 'moon');
  assert.deepEqual(work.readTaskFilters(params), { projectId: 'p1', priority: 'critical', lens: 'blocked', sort: 'priority' });
  assert.deepEqual(work.readTaskFilters(new URLSearchParams('taskLens=bad&taskPriority=bad&taskSort=bad')), { projectId: '', priority: '', lens: 'open', sort: 'due' });
});

test('project IDs isolate identically named projects, and no-project is explicit', () => {
  assert.ok(work);
  assert.deepEqual(work.buildTaskExecutionModel(tasks, projects, { projectId: 'p1', now }).items.map(t => t.id), ['b', 'a']);
  assert.deepEqual(work.buildTaskExecutionModel(tasks, projects, { projectId: 'none', now }).items.map(t => t.id), ['d']);
  assert.equal(work.buildTaskExecutionModel(tasks, projects, { projectId: 'missing', now }).items.length, 0);
});

test('overdue uses Seoul calendar days, excludes completed work and invalid dates', () => {
  assert.ok(work);
  const model = work.buildTaskExecutionModel([...tasks, { id: 'bad', status: 'todo', dueAt: 'bad' }], projects, { lens: 'overdue', now });
  assert.deepEqual(model.items.map(t => t.id), ['b']);
  assert.equal(model.counts.undated, 2);
  assert.equal(model.counts.done, 1);
});

test('no deadline stays last even with critical priority, source rows are not mutated', () => {
  assert.ok(work);
  assert.deepEqual(work.buildTaskExecutionModel(tasks, projects, { now }).items.map(t => t.id), ['b', 'c', 'd', 'a']);
  assert.deepEqual(tasks.map(t => t.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(work.buildTaskExecutionModel(tasks, projects, { sort: 'priority', now }).items.map(t => t.id), ['a', 'c', 'b', 'd']);
});

test('search includes next actions and priority filters keep the critical distinction', () => {
  assert.ok(work);
  assert.deepEqual(work.buildTaskExecutionModel(tasks, projects, { query: '회신', now }).items.map(t => t.id), ['b']);
  assert.deepEqual(work.buildTaskExecutionModel(tasks, projects, { priority: 'critical', now }).items.map(t => t.id), ['a']);
  assert.equal(work.buildTaskExecutionModel(tasks, projects, { lens: 'done', now }).groups[0].key, 'done');
});

test('a saved task immediately moves project context, dates, status and next action together', () => {
  assert.ok(work);
  const result = work.mergeSavedTask(tasks[0], { id: 'a', project_id: 'p2', due_at: null, status: 'done', priority: 'critical', next_action: '결과 전달', description: '상세', updated_at: '2026-09-13T10:00:00.123456+00:00' }, projects);
  assert.equal(result.project, 'p2');
  assert.equal(result.brand, 'work');
  assert.equal(result.dueAt, '');
  assert.equal(result.done, true);
  assert.equal(result.priorityRaw, 'critical');
  assert.equal(result.nextAction, '결과 전달');
  assert.equal(result.description, '상세');
  assert.equal(result.updatedAt, '2026-09-13T10:00:00.123456+00:00');
});

test('bulk writes report per-row failures, preserve conflicts, and never count preview as saved', async () => {
  assert.ok(work);
  const calls = [];
  const result = await work.saveTaskChanges(tasks.slice(0, 3), { status: 'todo' }, {
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body); calls.push(payload);
      if (payload.id === 'b') return { ok: false, status: 409, json: async () => ({ status: 'conflict', task: { id: 'b', title: '다른 창' } }) };
      if (payload.id === 'c') return { ok: true, status: 202, json: async () => ({ status: 'preview' }) };
      return { ok: true, json: async () => ({ status: 'saved', task: { id: payload.id, status: 'todo' } }) };
    },
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(result.saved.map(r => r.id), ['a']);
  assert.deepEqual(result.failed.map(r => r.id), ['b', 'c']);
  assert.equal(result.failed[0].current.title, '다른 창');
  assert.match(result.failed[1].message, /연결|저장/);
});

test('task writes pass exact version, deduplicate selection, and contain network failures', async () => {
  assert.ok(work);
  let count = 0;
  const row = { id: 'a', updatedAt: '2026-09-13T10:00:00.123456+00:00' };
  const result = await work.saveTaskChanges([row, row], { dueAt: '' }, { fetchImpl: async (_url, opts) => {
    count += 1;
    assert.equal(JSON.parse(opts.body).expectedUpdatedAt, row.updatedAt);
    throw new Error('offline');
  } });
  assert.equal(count, 1);
  assert.equal(result.saved.length, 0);
  assert.equal(result.failed.length, 1);
});
