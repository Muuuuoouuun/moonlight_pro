import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as taskModel from '../../../lib/task-today.js';
import * as reviewState from '../../../lib/daily-review-state.js';
import * as reviewContract from '../../../lib/daily-review.js';
import * as reviewRhythm from '../../../lib/daily-review-rhythm.js';
import * as overviewTruth from './overview-truth.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
// Evaluate actual hook/handler bodies with controlled effects and transport.
// These regressions exercise state transitions; they do not claim browser QA.
function hooks() {
  const slots = [], effects = [], cleanups = new Map(); let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const React = {
    useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i], deps)) { slots[i] = deps; effects.push(() => { cleanups.get(i)?.(); cleanups.set(i, fn()); }); } },
  };
  return { React, render(fn) { cursor = 0; const result = fn(); for (const e of effects.splice(0)) e(); return result; }, unmount() { for (const cleanup of cleanups.values()) cleanup?.(); } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function taskHarness(count = 2) {
  const source = read('./daily-brief.jsx'), start = source.indexOf('function TaskToday(');
  const code = source.slice(start, source.indexOf('  // §5.2: missed', start)) + '\n return { complete, undoComplete, currentTodayDone, items };\n}';
  const h = hooks(), scheduled = new Map(), requests = [], now = new Date();
  const tasks = Array.from({ length: count }, (_, i) => ({ id: `isolated-${i}`, title: `isolated task ${i}`, status: 'todo', dueAt: now.toISOString(), createdAt: now.toISOString() }));
  let ledger = taskModel.buildTaskToday(tasks, { now });
  const ctx = vm.createContext({ React: h.React, ...taskModel, window: {}, localStorage: { getItem: () => null, setItem() {} }, setTimeout() {},
    useUndoableAction: () => ({ schedule: (id, fn) => scheduled.set(id, fn), cancel: id => scheduled.delete(id) }),
    fetch: async () => { const request = deferred(); requests.push(request); return request.promise; },
  });
  const fn = vm.runInContext(`${code}; TaskToday`, ctx);
  const render = () => h.render(() => fn({ taskToday: ledger, onChanged() {} }));
  return { tasks, render, requests, flush(id) { const fn = scheduled.get(id); scheduled.delete(id); fn(); },
    snapshot(done) { ledger = taskModel.buildTaskToday(tasks.map(t => done.includes(t.id) ? { ...t, status: 'done', completedAt: now.toISOString() } : t), { now }); render(); return render(); },
  };
}

test('Today counts a saved completion once after the authoritative task reread', async () => {
  const h = taskHarness(1); h.render().complete(h.tasks[0]);
  assert.equal(h.render().currentTodayDone, 1);
  h.flush(h.tasks[0].id); h.requests[0].resolve({ ok: true, json: async () => ({ status: 'saved' }) }); await settle();
  assert.equal(h.snapshot([h.tasks[0].id]).currentTodayDone, 1);
});

test('rapid completions retain unacknowledged IDs through partial and older snapshots', async () => {
  const h = taskHarness(); const [a, b] = h.tasks;
  h.render().complete(a); h.render().complete(b);
  assert.equal(h.render().currentTodayDone, 2);
  h.flush(a.id); h.flush(b.id);
  h.requests[0].resolve({ ok: true, json: async () => ({ status: 'saved' }) }); await settle();
  assert.equal(h.snapshot([]).currentTodayDone, 2, 'an older read must not clear both optimistic actions');
  assert.equal(h.snapshot([a.id]).currentTodayDone, 2, 'only A has reached the ledger; B remains optimistic');
  h.requests[1].resolve({ ok: true, json: async () => ({ status: 'saved' }) }); await settle();
  assert.equal(h.snapshot([a.id, b.id]).currentTodayDone, 2);
});

test('undo and failed writes remove only their own optimistic completion', async () => {
  const h = taskHarness(); const [a, b] = h.tasks;
  h.render().complete(a); h.render().complete(b); h.render().undoComplete(a);
  assert.equal(h.render().currentTodayDone, 1); assert.ok(h.render().items.some(t => t.id === a.id));
  h.flush(b.id); h.requests[0].resolve({ ok: false, json: async () => ({ status: 'error' }) }); await settle();
  assert.equal(h.render().currentTodayDone, 0); assert.equal(h.render().items.length, 2);
});

test('the actual narrow task reread rejects an older response after newer completions', async () => {
  const source = read('./daily-brief.jsx'), start = source.indexOf('function useDailyBriefLedger(');
  const code = source.slice(start, source.indexOf('\nfunction ', start + 1));
  // Keep the real helper in the VM alongside the hook that now calls it.
  // Do not replace pending/previous-value behavior with a test-only stub.
  const helperStart = source.indexOf('function pendingTaskState(');
  const helperEnd = source.indexOf('\n// /api/hub/daily-brief', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'extract the real pending task helper');
  const helper = source.slice(helperStart, helperEnd);
  const h = hooks(), requests = [], initial = { taskToday: { ...taskModel.buildTaskToday([]), state: 'live' } };
  const ctx = vm.createContext({ React: h.React, ...taskModel, Date, AbortSignal,
    servableBriefState: () => initial, EMPTY_DAILY_BRIEF_STATE: initial, dailyBriefCache: null,
    getDailyBriefAuthVersion: () => 0, readDailyBrief: () => new Promise(() => {}),
    fetch: () => { const d = deferred(); requests.push(d); return d.promise; },
  });
  const fn = vm.runInContext(`${helper}\n${code}; useDailyBriefLedger`, ctx);
  const render = () => h.render(() => fn(0));
  const first = render().refreshTasks(), second = render().refreshTasks();
  requests[1].resolve({ ok: true, status: 200, json: async () => ({ status: 'live', tasks: [{ id: 'isolated', status: 'done', completedAt: new Date().toISOString() }] }) });
  assert.equal(await second, true); assert.equal(render().taskToday.streak.todayDoneCount, 1);
  requests[0].resolve({ ok: true, status: 200, json: async () => ({ status: 'live', tasks: [] }) });
  assert.equal(await first, false); assert.equal(render().taskToday.streak.todayDoneCount, 1);
});

test('the real Today ledger refreshes its narrow slice on KST rollover and window return, then removes listeners', async () => {
  const source = read('./daily-brief.jsx'), start = source.indexOf('function useDailyBriefLedger(');
  const code = source.slice(start, source.indexOf('\nfunction ', start + 1));
  const helper = source.slice(source.indexOf('function pendingTaskState('), source.indexOf('\n// /api/hub/daily-brief'));
  let clock = new Date('2026-10-27T14:59:00Z'), tick;
  const listeners = new Map(), requests = [], h = hooks();
  const build = tasks => taskModel.buildTaskToday(tasks, { now: clock });
  const initial = { taskToday: { ...build([{ id: 'previous-day', title: '어제 고른 일', status: 'todo', focusDates: ['2026-10-27'] }]), state: 'live' } };
  const browser = { setInterval(callback) { tick = callback; return 1; }, clearInterval() { tick = null; },
    addEventListener(name, callback) { listeners.set(name, callback); }, removeEventListener(name) { listeners.delete(name); } };
  const ctx = vm.createContext({ React: h.React, ...taskModel, buildTaskToday: build, Date, AbortSignal, window: browser,
    servableBriefState: () => initial, EMPTY_DAILY_BRIEF_STATE: initial, dailyBriefCache: null,
    getDailyBriefAuthVersion: () => 0, readDailyBrief: () => new Promise(() => {}),
    fetch: (url, options) => { const request = deferred(); requests.push({ ...request, url, options }); return request.promise; },
  });
  const fn = vm.runInContext(`${helper}\n${code}; useDailyBriefLedger`, ctx), render = () => h.render(() => fn(0));
  render(); tick(); assert.equal(requests.length, 0, 'ordinary minute ticks do not reread the ledger');
  clock = new Date('2026-10-27T15:01:00Z'); tick(); assert.equal(requests.length, 1);
  requests[0].resolve({ ok: true, status: 200, json: async () => ({ status: 'live', tasks: [] }) }); await settle();
  assert.equal(render().taskToday.focus.date, '2026-10-28'); assert.equal(render().taskToday.focus.picked, 0);
  listeners.get('focus')(); assert.equal(requests.length, 2); assert.equal(requests[1].url, '/api/hub/tasks'); assert.ok(requests[1].options.signal);
  requests[1].resolve({ ok: true, status: 200, json: async () => ({ status: 'live', tasks: [] }) }); await settle();
  h.unmount(); assert.equal(listeners.size, 0); assert.equal(tick, null);
});

function overviewHarness() {
  const source = read('./overview.jsx');
  const code = source.slice(source.indexOf('const EMPTY_LEDGER ='), source.indexOf('// 패널 문구 단일 테이블'));
  let h = hooks(); const requests = [];
  const ctx = vm.createContext({ React: h.React, Date, ...overviewTruth, fetch: () => { const d = deferred(); requests.push(d); return d.promise; } });
  const fn = vm.runInContext(`${code}; useOverviewLedger`, ctx);
  return { requests, render: () => h.render(fn), remount() { h.unmount(); h = hooks(); ctx.React = h.React; return h.render(fn); } };
}
const overviewRead = value => ({ ok: true, json: async () => ({ status: 'live', sources: [{ key: 'projects', state: 'live' }], kpis: { updatesThisWeek: value }, activitySeries: [{ work: value }] }) });

test('overview drops cached records after a failed or unauthorized revalidation', async () => {
  for (const status of [401, 503, 200, 'network']) {
    const h = overviewHarness(); h.render(); h.requests[0].resolve(overviewRead(7)); await settle();
    assert.equal(h.render().syncState, 'live'); assert.equal(h.remount().ledger.kpis.updatesThisWeek, 7);
    if (status === 'network') h.requests[1].reject(new Error('isolated network failure'));
    else h.requests[1].resolve({ ok: status === 200, status, json: async () => ({ status: status === 401 ? 'unauthorized' : 'error' }) });
    await settle();
    const failed = h.render(); assert.equal(failed.syncState, 'error'); assert.equal(failed.ledger.kpis.updatesThisWeek, null);
    const panel = overviewTruth.overviewPanelAvailability({ sources: failed.ledger.sources, status: failed.ledger.status, sourceKey: 'projects', hasData: false });
    assert.notEqual(panel.state, 'live');
  }
});

test('overview ignores a superseded read and accepts the latest successful refresh', async () => {
  const h = overviewHarness(); const initial = h.render(); initial.reload(); h.render();
  h.requests[1].resolve(overviewRead(9)); await settle(); assert.equal(h.render().ledger.kpis.updatesThisWeek, 9);
  h.requests[0].resolve(overviewRead(2)); await settle(); assert.equal(h.render().ledger.kpis.updatesThisWeek, 9);
});

function reviewHarness() {
  const source = read('./use-daily-review.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const h = hooks(), requests = [], drafts = new Map();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ctx = vm.createContext({ React: h.React, ...reviewState, ...reviewContract, ...reviewRhythm, Intl, Date, AbortController,
    window: { setTimeout: () => 1, clearTimeout() {} }, dailyReviewDraftStore: { read: d => drafts.get(d), write: (d, v) => drafts.set(d, v) },
    fetch: url => { const d = deferred(); requests.push({ ...d, url }); return d.promise; },
  });
  const fn = vm.runInContext(`${source}; useDailyReview`, ctx);
  const reply = (index, completed, day = date) => requests[index].resolve({ ok: true, json: async () => ({ status: 'live', reviewDate: day, todayKey: date, timezone: 'Asia/Seoul', review: null, entries: [], recent: [], today: { date, focusPicked: 1, focusDone: completed } }) });
  return { date, requests, reply, render: () => h.render(fn) };
}

test('same-day review reopening refreshes execution facts while retaining unsaved answers', async () => {
  const h = reviewHarness(); h.render(); h.reply(0, 0); await settle();
  h.render().edit('note', 'keep my unsaved answer');
  h.render().chooseDate(h.date); h.render(); assert.equal(h.requests.length, 2);
  h.reply(1, 1); await settle(); const updated = h.render();
  assert.equal(updated.today.focusDone, 1); assert.equal(updated.draft.note, 'keep my unsaved answer'); assert.equal(updated.dirty, true);
});

test('failed review refresh clears old execution facts while retaining unsaved answers', async () => {
  const h = reviewHarness(); h.render(); h.reply(0, 1); await settle();
  h.render().edit('note', 'keep this draft offline'); h.render().chooseDate(h.date); h.render();
  h.requests[1].reject(new Error('isolated offline')); await settle();
  const failed = h.render(); assert.equal(failed.source, 'error');
  assert.equal(failed.draft.note, 'keep this draft offline'); assert.equal(failed.today, null);
});

test('review date ownership rejects a slow previous-day read', async () => {
  const h = reviewHarness(); h.render(); h.reply(0, 0); await settle();
  const yesterday = reviewRhythm.zonedClock(new Date(Date.now() - 86400000), 'Asia/Seoul').dateKey;
  h.render().chooseDate(yesterday); h.render(); h.render().chooseDate(h.date); h.render();
  h.reply(2, 1); await settle(); assert.equal(h.render().draft.reviewDate, h.date);
  h.reply(1, 0, yesterday); await settle(); assert.equal(h.render().draft.reviewDate, h.date); assert.equal(h.render().today.focusDone, 1);
});
