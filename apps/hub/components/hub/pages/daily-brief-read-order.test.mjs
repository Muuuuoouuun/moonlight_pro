import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as taskModel from '../../../lib/task-today.js';

// Execute the actual ledger hook, shared read cache, and TaskToday handler bodies.
// The controlled hook slots/effects do not model DOM rendering or React scheduling.
const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8');
const ledgerBody = source.slice(source.indexOf('const EMPTY_DAILY_BRIEF_STATE ='), source.indexOf('function MetricCard('));
const taskStart = source.indexOf('function TaskToday(');
const taskBody = source.slice(taskStart, source.indexOf('  // §5.2: missed', taskStart)) + '\nreturn { complete, currentTodayDone, items };\n}';
function hooks() {
  const slots = [], effects = [], cleanups = new Map(); let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const React = {
    useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i], deps)) { slots[i] = deps; effects.push(() => { cleanups.get(i)?.(); cleanups.set(i, fn()); }); } },
  };
  return { React, render(fn) { cursor = 0; const value = fn(); for (const effect of effects.splice(0)) effect(); return value; }, unmount() { for (const cleanup of cleanups.values()) cleanup?.(); } };
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; };
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
let moduleId = 0;
async function harness(t) {
  const brief = await import(`../daily-brief-signals.js?read-order=${++moduleId}`);
  const now = new Date(), task = { id: 'isolated-order', title: 'isolated task', status: 'todo', dueAt: now.toISOString(), createdAt: now.toISOString() };
  const doneTask = { ...task, status: 'done', completedAt: now.toISOString() };
  const fullData = (done, marker) => ({ status: 'live', generatedAt: marker, taskToday: taskModel.buildTaskToday([done ? doneTask : task], { now }) });
  await brief.readDailyBrief({ fetchImpl: async () => reply(fullData(false, 'cached')) });
  const full = [], narrow = [], scheduled = new Map();
  t.mock.method(globalThis, 'fetch', (url, options) => {
    if (options?.method === 'PATCH') return Promise.resolve(reply({ status: 'saved' }));
    const request = deferred(); (url === '/api/hub/tasks' ? narrow : full).push(request); return request.promise;
  });
  const ledgerHooks = hooks(), taskHooks = hooks();
  const useLedger = new Function('React', 'peekDailyBrief', 'readDailyBrief', 'briefEnvelope', 'getDailyBriefAuthVersion', 'invalidateDailyBriefAuth', 'buildTaskToday', `${ledgerBody}\nreturn useDailyBriefLedger;`)(ledgerHooks.React, brief.peekDailyBrief, brief.readDailyBrief, brief.briefEnvelope, brief.getDailyBriefAuthVersion, brief.invalidateDailyBriefAuth, taskModel.buildTaskToday);
  const taskFn = new Function('React', 'window', 'localStorage', 'setTimeout', 'useUndoableAction', ...Object.keys(taskModel), `${taskBody}\nreturn TaskToday;`)(taskHooks.React, {}, { getItem: () => null, setItem() {} }, () => {}, () => ({ schedule: (id, fn) => scheduled.set(id, fn), cancel: id => scheduled.delete(id) }), ...Object.values(taskModel));
  let key = 0;
  const ledger = () => ledgerHooks.render(() => useLedger(key));
  const view = () => { const state = ledger(); return taskHooks.render(() => taskFn({ taskToday: state.taskToday, onChanged: state.refreshTasks })); };
  return { task, full, narrow, brief, ledger, view, fullData,
    reload() { key++; return ledger(); },
    async complete() { view().complete(task); view(); scheduled.get(task.id)(); await settle(); },
    resolveFull(index, done = false) { full[index].resolve(reply(fullData(done, `full-${index}`))); },
    resolveNarrow(index, done = true) { narrow[index].resolve(reply({ status: 'live', tasks: [done ? doneTask : task] })); },
    unmount() { taskHooks.unmount(); ledgerHooks.unmount(); },
  };
}

test('a late older full read retains the completed task slice and updates other ledger fields', async t => {
  const h = await harness(t); await h.complete(); h.resolveNarrow(0); await settle(); h.view();
  assert.equal(h.view().currentTodayDone, 1); assert.equal(h.view().items.length, 0);
  h.resolveFull(0); await settle(); h.view();
  assert.equal(h.view().currentTodayDone, 1); assert.equal(h.view().items.length, 0);
  assert.equal(h.ledger().generatedAt, 'full-0');
});

test('an older full response settling first leaves the later task read able to reconcile', async t => {
  const h = await harness(t); await h.complete(); h.resolveFull(0); await settle();
  assert.equal(h.view().currentTodayDone, 1); h.resolveNarrow(0); await settle(); h.view();
  assert.equal(h.view().currentTodayDone, 1); assert.equal(h.view().items.length, 0);
});

test('a newer full read owns tasks when an earlier narrow read settles later', async t => {
  const h = await harness(t); h.ledger(); h.resolveFull(0); await settle();
  const pending = h.ledger().refreshTasks(); h.reload(); h.resolveFull(1, true); await settle();
  h.resolveNarrow(0, false); assert.equal(await pending, false);
  assert.equal(h.ledger().taskToday.streak.todayDoneCount, 1); assert.equal(h.ledger().generatedAt, 'full-1');
});

test('failed full reads preserve the latest task slice with partial truth', async t => {
  for (const failure of ['envelope', 'network']) {
    const h = await harness(t); await h.complete(); h.resolveNarrow(0); await settle(); h.view();
    if (failure === 'network') h.full[0].reject(new Error('isolated offline'));
    else h.full[0].resolve(reply({ status: 'error' }));
    await settle(); assert.equal(h.ledger().syncState, 'partial'); assert.equal(h.view().currentTodayDone, 1);
  }
});

test('failed narrow reads do not let an earlier full read roll back the task slice', async t => {
  const h = await harness(t); h.ledger(); h.resolveFull(0); await settle();
  const saved = h.ledger().refreshTasks(); h.resolveNarrow(0); assert.equal(await saved, true);
  h.reload(); const failed = h.ledger().refreshTasks(); h.narrow[1].resolve(reply({ status: 'error' })); assert.equal(await failed, false);
  h.resolveFull(1, false); await settle(); assert.equal(h.ledger().taskToday.streak.todayDoneCount, 1);
});

test('a narrow 401 supersedes an older full success and clears private caches', async t => {
  const h = await harness(t); h.ledger(); const pending = h.ledger().refreshTasks();
  h.narrow[0].resolve(reply({ status: 'unauthorized' }, 401)); assert.equal(await pending, false);
  h.resolveFull(0); await settle(); assert.equal(h.ledger().authRequired, true);
  assert.equal(h.ledger().taskToday.items.length, 0); assert.equal(h.brief.peekDailyBrief(), null);
});

test('a newer full 401 rejects an older narrow success', async t => {
  const h = await harness(t); h.ledger(); h.resolveFull(0); await settle();
  const pending = h.ledger().refreshTasks(); h.reload(); h.full[1].resolve(reply({ status: 'unauthorized' }, 401)); await settle();
  h.resolveNarrow(0); assert.equal(await pending, false); assert.equal(h.ledger().authRequired, true);
  assert.equal(h.ledger().taskToday.items.length, 0); assert.equal(h.brief.peekDailyBrief(), null);
});

test('a task read settling after unmount cannot update the old hook or start another refresh', async t => {
  const h = await harness(t); h.ledger(); h.resolveFull(0); await settle();
  const before = h.ledger(), pending = before.refreshTasks(); h.unmount(); h.resolveNarrow(0); assert.equal(await pending, false);
  assert.equal(h.ledger().taskToday, before.taskToday);
  assert.equal(await before.refreshTasks(), false); assert.equal(h.narrow.length, 1);
});
