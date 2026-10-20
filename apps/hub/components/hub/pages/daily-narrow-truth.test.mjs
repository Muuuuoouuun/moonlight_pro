import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

// Actual hook and shared read cache. React effects and HTTP are controlled;
// this does not claim browser scheduling, task POST persistence, or DOM coverage.
const root = process.env.MOONLIGHT_TEST_ROOT
  ? pathToFileURL(process.env.MOONLIGHT_TEST_ROOT.replace(/\/$/, '') + '/')
  : new URL('../../../../../', import.meta.url);
const source = readFileSync(new URL('apps/hub/components/hub/pages/daily-brief.jsx', root), 'utf8');
const start = source.indexOf('const EMPTY_DAILY_BRIEF_STATE =');
const end = source.indexOf('function MetricCard(');
assert.ok(start >= 0 && end > start, 'extract the actual daily ledger declarations');
const ledgerBody = source.slice(start, end);
const taskModel = await import(new URL('apps/hub/lib/task-today.js', root));
const tick = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); };
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
function hooks() {
  const slots = [], effects = [], cleanups = new Map(); let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i], deps)) { slots[i] = deps; effects.push(() => { cleanups.get(i)?.(); cleanups.set(i, fn()); }); } },
  };
  return { React, render(fn) { cursor = 0; const value = fn(); effects.splice(0).forEach(fn => fn()); return value; }, unmount() { for (const cleanup of cleanups.values()) cleanup?.(); } };
}
let sequence = 0;
async function harness(t, { prime = true, fullStatus = 'live', sharedPrime = false } = {}) {
  const brief = await import(new URL(`apps/hub/components/hub/daily-brief-signals.js?narrow-truth=${++sequence}`, root));
  const now = new Date();
  const task = { id: 'isolated-narrow-truth', title: 'synthetic task', status: 'todo', dueAt: now.toISOString(), createdAt: now.toISOString() };
  const fullData = (status = fullStatus) => ({ status, generatedAt: 'synthetic-full', taskToday: { ...taskModel.buildTaskToday([task], { now }), state: 'live' } });
  if (sharedPrime) await brief.readDailyBrief({ fetchImpl: async () => reply(fullData()) });
  const requests = [], unexpected = [];
  t.mock.method(globalThis, 'fetch', (url) => {
    if (!['/api/hub/tasks', '/api/hub/daily-brief'].includes(url)) unexpected.push(String(url));
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    requests.push({ url, resolve, reject }); return promise;
  });
  let runtime = hooks();
  const React = Object.fromEntries(Object.keys(runtime.React).map(key => [key, (...args) => runtime.React[key](...args)]));
  const useLedger = new Function('React', 'peekDailyBrief', 'readDailyBrief', 'briefEnvelope', 'getDailyBriefAuthVersion', 'invalidateDailyBriefAuth', 'buildTaskToday', `${ledgerBody}\nreturn useDailyBriefLedger;`)(React, brief.peekDailyBrief, brief.readDailyBrief, brief.briefEnvelope, brief.getDailyBriefAuthVersion, brief.invalidateDailyBriefAuth, taskModel.buildTaskToday);
  let key = 0;
  const render = () => runtime.render(() => useLedger(key));
  const full = () => requests.filter(r => r.url === '/api/hub/daily-brief');
  const narrow = () => requests.filter(r => r.url === '/api/hub/tasks');
  render();
  if (prime) { full()[0].resolve(reply(fullData())); await tick(); }
  const h = { render, full, narrow, task, fullData, brief,
    reload() { key++; return render(); },
    remount() { runtime.unmount(); runtime = hooks(); return render(); },
    unmount() { runtime.unmount(); },
    async refresh(data, status = 200) { const p = render().refreshTasks(); narrow().at(-1).resolve(reply(data, status)); return await p; },
    async fail(mode) { const p = render().refreshTasks(); const r = narrow().at(-1); if (mode === 'network') r.reject(new Error('synthetic offline')); else r.resolve(reply({ status: mode, tasks: [] })); return await p; },
  };
  t.after(async () => { h.unmount(); for (const r of requests) r.reject(new Error('synthetic cleanup')); await tick(); assert.deepEqual(unexpected, [], 'no external network paths'); });
  return h;
}
const retainedPartial = (state, id) => {
  assert.equal(state.taskToday.state, 'partial', 'retained task rows must disclose failed revalidation');
  assert.equal(state.syncState, 'partial', 'overall truth must disclose the degraded task slice');
  assert.deepEqual(state.taskToday.items.map(row => row.id), [id]);
};

for (const mode of ['error', 'network']) test(`narrow ${mode} retains verified rows as partial, including on cache remount`, async t => {
  const h = await harness(t); assert.equal(await h.fail(mode), false);
  retainedPartial(h.render(), h.task.id);
  retainedPartial(h.remount(), h.task.id);
});

test('narrow preview cannot establish a live empty observation and survives cache remount', async t => {
  const h = await harness(t); await h.fail('preview');
  const state = h.render();
  retainedPartial(state, h.task.id);
  assert.deepEqual(h.remount().taskToday, state.taskToday);
});

for (const data of [null, {}, { status: 'live', tasks: null }, { status: 'live', source: 'error', tasks: [] }]) test(`invalid narrow observation ${JSON.stringify(data)} cannot report confirmed empty`, async t => {
  const h = await harness(t); assert.equal(await h.refresh(data), false);
  retainedPartial(h.render(), h.task.id);
});

test('initial narrow failure without a verified task observation is error, not live empty', async t => {
  const h = await harness(t, { prime: false });
  assert.equal(await h.fail('error'), false);
  assert.equal(h.render().taskToday.state, 'error');
  assert.deepEqual(h.render().taskToday.items, []);
});

test('a later successful narrow read recovers task truth and replaces retained rows', async t => {
  const h = await harness(t); await h.fail('error');
  assert.equal(await h.refresh({ status: 'live', tasks: [] }), true);
  assert.equal(h.render().taskToday.state, 'live'); assert.deepEqual(h.render().taskToday.items, []);
  const recovered = h.render().taskToday;
  assert.deepEqual(h.remount().taskToday, { ...recovered, stale: true, observedState: 'live' });
});

test('narrow recovery cannot promote unrelated partial full-ledger truth to live', async t => {
  const h = await harness(t, { fullStatus: 'partial' }); await h.fail('error');
  assert.equal(await h.refresh({ status: 'live', tasks: [h.task] }), true);
  assert.equal(h.render().taskToday.state, 'live'); assert.equal(h.render().syncState, 'partial');
});

for (const mode of ['error', 'network', 'preview']) test(`late ${mode} cannot degrade a newer successful narrow read`, async t => {
  const h = await harness(t); const old = h.render().refreshTasks();
  await h.refresh({ status: 'live', tasks: [] });
  if (mode === 'network') h.narrow()[0].reject(new Error('late synthetic offline'));
  else h.narrow()[0].resolve(reply({ status: mode, tasks: [h.task] }));
  assert.equal(await old, false); assert.equal(h.render().taskToday.state, 'live');
  assert.equal(h.render().syncState, 'live'); assert.deepEqual(h.render().taskToday.items, []);
});

test('an older full success cannot hide the newer narrow failure', async t => {
  const h = await harness(t); h.reload(); await h.fail('error');
  h.full()[1].resolve(reply(h.fullData())); await tick();
  retainedPartial(h.render(), h.task.id);
});

test('a later full success may recover a failed narrow observation', async t => {
  const h = await harness(t); await h.fail('error'); h.reload();
  h.full()[1].resolve(reply(h.fullData())); await tick();
  assert.equal(h.render().taskToday.state, 'live'); assert.equal(h.render().syncState, 'live');
});

test('a narrow error after unmount cannot degrade the shared page cache', async t => {
  const h = await harness(t); const pending = h.render().refreshTasks(); h.unmount();
  h.narrow()[0].resolve(reply({ status: 'error' })); assert.equal(await pending, false);
  assert.equal(h.remount().taskToday.state, 'live'); assert.equal(h.render().syncState, 'live');
});

test('a 401 clears task/cache data and an older network rejection cannot restore it', async t => {
  const h = await harness(t); const old = h.render().refreshTasks();
  assert.equal(await h.refresh({ status: 'unauthorized' }, 401), false);
  h.narrow()[0].reject(new Error('older synthetic offline')); assert.equal(await old, false);
  const state = h.render(); assert.equal(state.authRequired, true); assert.deepEqual(state.taskToday.items, []);
  assert.equal(h.brief.peekDailyBrief(), null);
});


test('a confirmed empty task observation degrades to partial, not unverified error', async t => {
  const h = await harness(t); await h.refresh({ status: 'live', tasks: [] }); await h.fail('error');
  assert.equal(h.render().taskToday.state, 'partial'); assert.deepEqual(h.render().taskToday.items, []);
  assert.equal(h.remount().taskToday.state, 'partial');
});

test('initial preview ignores attached unverified rows and remains preview', async t => {
  const h = await harness(t, { prime: false });
  await h.refresh({ status: 'preview', tasks: [h.task] });
  assert.equal(h.render().taskToday.state, 'preview'); assert.deepEqual(h.render().taskToday.items, []);
});

test('valid partial task rows stay partial and survive subsequent failure', async t => {
  const h = await harness(t);
  assert.equal(await h.refresh({ status: 'partial', partial: true, tasks: [h.task] }), true);
  retainedPartial(h.render(), h.task.id); await h.fail('network'); retainedPartial(h.render(), h.task.id);
});

test('recovered narrow live restores a previously live full truth after cache remount', async t => {
  const h = await harness(t); await h.fail('error'); h.remount();
  assert.equal(await h.refresh({ status: 'live', tasks: [h.task] }), true);
  assert.equal(h.render().taskToday.state, 'live'); assert.equal(h.render().syncState, 'live');
});

test('an earlier narrow failure cannot degrade a newer full success', async t => {
  const h = await harness(t); const old = h.render().refreshTasks(); h.reload();
  h.full()[1].resolve(reply(h.fullData())); await tick();
  h.narrow()[0].reject(new Error('late synthetic offline')); assert.equal(await old, false);
  assert.equal(h.render().taskToday.state, 'live'); assert.equal(h.render().syncState, 'live');
});

for (const mode of ['error', 'network']) test(`narrow recovery after remount cannot erase a newer full-read ${mode}`, async t => {
  const h = await harness(t); await h.fail('error'); h.reload();
  if (mode === 'network') h.full()[1].reject(new Error('synthetic full offline'));
  else h.full()[1].resolve(reply({ status: 'error' }));
  await tick(); assert.equal(h.render().syncState, 'partial');
  h.remount();
  assert.equal(await h.refresh({ status: 'live', tasks: [h.task] }), true);
  assert.equal(h.render().taskToday.state, 'live');
  assert.equal(h.render().syncState, 'partial', 'task recovery must not conceal the unrelated failed full ledger across remount');
});


test('narrow failure while serving only shared-cache truth remains partial on remount', async t => {
  const h = await harness(t, { prime: false, sharedPrime: true });
  assert.equal(h.render().taskToday.state, 'live');
  assert.equal(await h.fail('error'), false);
  retainedPartial(h.render(), h.task.id);
  retainedPartial(h.remount(), h.task.id);
});
