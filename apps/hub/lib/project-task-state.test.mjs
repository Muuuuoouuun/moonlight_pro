import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allowedTaskStatuses,
  applyAuthoritativeTask,
  beginComposerOperation,
  createProjectReadState,
  formatTaskDueDate,
  localDateMidnightIso,
  reconcileProjectReadState,
  resolveConflictTask,
  resolveTaskTimezone,
  settleComposerOperation,
  taskToDraft,
} from './project-task-state.js';

const liveLedger = {
  focusProjects: [{ id: 'project-a', title: 'A' }],
  otherProjects: [],
  projectCounts: { focus: 1, total: 1 },
  today: { items: [] },
  alerts: [],
};

const liveTask = {
  id: 'task-a',
  title: 'Call A',
  status: 'todo',
  priority: 'high',
  dueAt: '2026-07-14T15:00:00.000Z',
  projectId: 'project-a',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

test('read reconciliation keeps last-known-live ledger and tasks through read failure and preview', () => {
  const initial = createProjectReadState();
  const live = reconcileProjectReadState(initial, {
    type: 'success',
    data: {
      source: 'supabase',
      ledger: liveLedger,
      todos: [liveTask],
      taskSource: 'live',
      taskTimezone: 'Asia/Seoul',
    },
  });

  const failed = reconcileProjectReadState(live, {
    type: 'failure',
    message: 'network failed',
  });

  assert.equal(failed.syncState, 'error');
  assert.equal(failed.taskSource, 'error');
  assert.equal(failed.ledger, live.ledger);
  assert.equal(failed.todos, live.todos);
  assert.equal(failed.hasLedgerSnapshot, true);
  assert.equal(failed.hasTaskSnapshot, true);

  const preview = reconcileProjectReadState(failed, {
    type: 'success',
    data: {
      source: 'preview',
      ledger: { ...liveLedger, focusProjects: [] },
      todos: [{ ...liveTask, id: 'task-preview' }],
      taskSource: 'live',
    },
  });

  assert.equal(preview.syncState, 'preview');
  assert.equal(preview.taskSource, 'preview');
  assert.equal(preview.ledger, live.ledger);
  assert.equal(preview.todos, live.todos);
});

test('late composer success cannot clear or mutate a newly opened project composer', async () => {
  const composerA = { projectId: 'project-a', title: 'A task', state: 'idle', error: '' };
  const { state: savingA, operation: operationA } = beginComposerOperation(composerA, {
    operationId: 'operation-a',
  });

  let release;
  const deferred = new Promise((resolve) => {
    release = resolve;
  });
  const lateSettlement = deferred.then(() =>
    settleComposerOperation(
      { projectId: 'project-b', title: 'B task', state: 'idle', error: '' },
      operationA,
      { projectId: null, title: '', state: 'idle', error: '' },
    ),
  );

  assert.equal(savingA.operationId, 'operation-a');
  release();
  assert.deepEqual(await lateSettlement, {
    projectId: 'project-b',
    title: 'B task',
    state: 'idle',
    error: '',
  });
});

test('task transitions remain anchored to immutable persisted status', () => {
  const draft = taskToDraft(liveTask, 'Asia/Seoul');
  assert.equal(draft.baseStatus, 'todo');
  assert.deepEqual(allowedTaskStatuses(draft.baseStatus), ['todo', 'doing', 'blocked', 'done']);

  draft.status = 'done';
  assert.equal(draft.baseStatus, 'todo');
  assert.deepEqual(allowedTaskStatuses(draft.baseStatus), ['todo', 'doing', 'blocked', 'done']);
});

test('timezone helpers create exact timezone-local midnight and fall back safely', () => {
  assert.equal(resolveTaskTimezone('America/New_York'), 'America/New_York');
  assert.equal(resolveTaskTimezone('Definitely/Invalid'), 'Asia/Seoul');
  assert.equal(
    localDateMidnightIso('2026-07-14', 'America/New_York'),
    '2026-07-14T04:00:00.000Z',
  );
  assert.equal(
    localDateMidnightIso('2026-07-14', 'Asia/Seoul'),
    '2026-07-13T15:00:00.000Z',
  );
  assert.equal(formatTaskDueDate(liveTask, 'America/New_York'), '2026-07-14');
});

test('conflict current task is normalized and applied before any refetch', () => {
  const current = resolveConflictTask({
    status: 'conflict',
    currentTask: {
      ...liveTask,
      status: 'doing',
      updatedAt: '2026-07-13T01:00:00.000Z',
    },
  });
  assert.equal(current.status, 'doing');
  assert.equal(applyAuthoritativeTask([liveTask], current)[0].status, 'doing');

  const completed = resolveConflictTask({
    status: 'conflict',
    current_task: { ...liveTask, status: 'done' },
  });
  assert.deepEqual(applyAuthoritativeTask([liveTask], completed), []);
});
