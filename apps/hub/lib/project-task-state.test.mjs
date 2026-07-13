import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allowedTaskStatuses,
  applyAuthoritativeTask,
  beginComposerOperation,
  bindUnlockRetry,
  buildTaskDuePatch,
  createProjectReadState,
  formatTaskDueDate,
  guardUnlockRetry,
  isComposerOperationCurrent,
  isTaskOperationCurrent,
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

test('late unlock for composer A cannot retry after composer B replaces its context', async () => {
  const composerA = { projectId: 'project-a', title: 'A task', state: 'idle', error: '' };
  const { state: savingA, operation: operationA } = beginComposerOperation(composerA, {
    operationId: 'operation-a',
  });
  let currentComposer = savingA;
  let releaseUnlock;
  let retryCount = 0;
  const binding = bindUnlockRetry({
    kind: 'composer',
    operation: operationA,
    retry: async () => { retryCount += 1; },
  });
  const unlocked = new Promise((resolve) => {
    releaseUnlock = resolve;
  }).then(async () => {
    const guarded = guardUnlockRetry(binding, { composer: currentComposer, editor: null, todos: [] });
    if (guarded.allowed) await guarded.run();
  });

  currentComposer = { projectId: 'project-b', title: 'B draft', state: 'idle', error: '' };
  releaseUnlock();
  await unlocked;

  assert.equal(retryCount, 0);
  assert.deepEqual(currentComposer, {
    projectId: 'project-b',
    title: 'B draft',
    state: 'idle',
    error: '',
  });

  let activeEditor = liveTask;
  let releaseEditorSave;
  let editorCloseCount = 0;
  const editorSave = new Promise((resolve) => { releaseEditorSave = resolve; });
  const editorBinding = bindUnlockRetry({
    kind: 'editor',
    task: liveTask,
    retry: async () => {
      await editorSave;
      if (isTaskOperationCurrent(activeEditor, editorBinding.identity)) editorCloseCount += 1;
    },
  });
  const guardedEditorRetry = guardUnlockRetry(editorBinding, {
    composer: currentComposer,
    editor: activeEditor,
    todos: [liveTask],
  });
  const editorRetry = guardedEditorRetry.run();
  activeEditor = { ...liveTask, id: 'task-b' };
  releaseEditorSave();
  await editorRetry;
  assert.equal(editorCloseCount, 0);
  activeEditor = liveTask;
  const closingEditorRetry = guardUnlockRetry(editorBinding, {
    composer: currentComposer,
    editor: activeEditor,
    todos: [liveTask],
  }).run();
  activeEditor = null;
  await closingEditorRetry;
  assert.equal(editorCloseCount, 0);

  assert.equal(guardUnlockRetry(editorBinding, {
    composer: currentComposer,
    editor: activeEditor,
    todos: [liveTask],
  }).status, 'stale');
  assert.equal(guardUnlockRetry(editorBinding, {
    composer: currentComposer,
    editor: null,
    todos: [liveTask],
  }).status, 'stale');

  const completeBinding = bindUnlockRetry({ kind: 'complete', task: liveTask, retry: async () => {} });
  assert.equal(guardUnlockRetry(completeBinding, {
    composer: currentComposer,
    editor: null,
    todos: [{ ...liveTask, updatedAt: 'new-version' }],
  }).status, 'stale');
  assert.equal(isComposerOperationCurrent(currentComposer, operationA), false);
  assert.equal(isTaskOperationCurrent(liveTask, editorBinding.identity), true);
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
  assert.equal(
    localDateMidnightIso('2026-09-06', 'America/Santiago'),
    '2026-09-06T04:00:00.000Z',
  );
  assert.equal(
    localDateMidnightIso('2026-03-08', 'America/Havana'),
    '2026-03-08T05:00:00.000Z',
  );
  assert.equal(
    localDateMidnightIso('2011-12-30', 'Pacific/Apia'),
    '2011-12-30T10:00:00.000Z',
  );
  assert.deepEqual(
    buildTaskDuePatch({ dueDate: '2026-09-06', duePrecision: 'date' }, 'America/Santiago'),
    { dueAt: '2026-09-06T04:00:00.000Z', duePrecision: 'date' },
  );
  assert.deepEqual(
    buildTaskDuePatch({
      dueDate: '2026-07-14',
      dueAt: '2026-07-14T09:30:00.000Z',
      duePrecision: 'timed',
    }, 'America/New_York'),
    { dueAt: '2026-07-14T09:30:00.000Z', duePrecision: 'timed' },
  );
  assert.equal(localDateMidnightIso('2026-02-30', 'Asia/Seoul'), null);
  assert.equal(formatTaskDueDate(liveTask, 'America/New_York'), '2026-07-14');
});

test('Engine conflict task is normalized and applied before any refetch', () => {
  const current = resolveConflictTask({
    status: 'conflict',
    task: {
      id: liveTask.id,
      title: liveTask.title,
      status: 'doing',
      priority: 'critical',
      project_id: 'project-a',
      due_at: '2026-07-14T09:30:00.000Z',
      due_precision: 'timed',
      updated_at: '2026-07-13T01:00:00.000Z',
    },
  });
  assert.equal(current.status, 'doing');
  assert.equal(current.projectId, 'project-a');
  assert.equal(current.dueAt, '2026-07-14T09:30:00.000Z');
  assert.equal(current.duePrecision, 'timed');
  assert.equal(current.updatedAt, '2026-07-13T01:00:00.000Z');
  assert.equal(applyAuthoritativeTask([liveTask], current)[0].status, 'doing');

  const completed = resolveConflictTask({
    status: 'conflict',
    task: { ...liveTask, status: 'done' },
  });
  assert.deepEqual(applyAuthoritativeTask([liveTask], completed), []);

  assert.equal(resolveConflictTask({
    task: liveTask,
    currentTask: { ...liveTask, id: 'legacy-current' },
  }).id, liveTask.id);
  assert.equal(resolveConflictTask({ currentTask: liveTask }).id, liveTask.id);
  assert.equal(resolveConflictTask({ current_task: liveTask }).id, liveTask.id);
});
