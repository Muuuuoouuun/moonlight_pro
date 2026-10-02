import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/hub/pages/use-content-schedule.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const run = new Function('React', 'fetch', `${source}\nreturn useContentSchedule;`);
const tick = () => new Promise(setImmediate);
const variantId = '11111111-1111-4111-8111-111111111111';
const row = (revision) => ({ variantId, revision, state: 'scheduled', status: 'scheduled', scheduledAt: '2026-10-03T10:00:00Z' });
const live = (revision) => ({ status: 'live', schedules: [row(revision)] });

// Run the actual hook with explicit render/effect phases and deferred transport.
// This isolates races from the Studio UI and exercises the hook's own callbacks and cleanup.
function harness() {
  const slots = [], effects = new Set(), requests = [];
  let cursor = 0, currentScope = 'all', writes = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const React = {
    useState(initial) {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => {
        writes++;
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) { const index = cursor++; return (slots[index] ||= { current: initial }); },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(setup, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) {
        slots[index] = { ...slots[index], setup, deps };
        effects.add(index);
      }
    },
  };
  const hook = run(React, (url, options = {}) => new Promise((resolve, reject) => requests.push({
    url, options, reject,
    resolve: (data, ok = true) => resolve({ ok, json: async () => data }),
    response: resolve,
  })));
  const render = (scope = currentScope) => { currentScope = scope; cursor = 0; return hook(scope); };
  return {
    requests, render, writes: () => writes,
    start() {
      for (const index of effects) { slots[index].cleanup?.(); slots[index].cleanup = slots[index].setup(); }
      effects.clear();
    },
    replay() { for (const slot of slots) if (slot.setup) { slot.cleanup?.(); slot.cleanup = slot.setup(); } },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}

async function primed() {
  const h = harness(); h.render(); h.start(); await tick();
  h.requests[0].resolve(live(1)); await tick();
  return h;
}

test('overlapping reloads share a single schedule request', async () => {
  const h = harness(), view = h.render();
  assert.equal(view.status, 'loading');
  h.start();
  const first = view.reload(), second = view.reload();
  await tick();
  const count = h.requests.length;
  h.requests.forEach((request) => request.resolve(live(1)));
  await Promise.all([first, second]);
  h.unmount();
  assert.equal(count, 1);
});

test('a pre-save response cannot roll back a confirmed schedule revision', async () => {
  const h = await primed();
  const oldRead = h.render().reload(); await tick();
  const writing = h.render().set({ variantId, expectedRevision: 1 }); await tick();
  h.requests[2].resolve({ status: 'saved', schedule: row(2) }); await writing;
  assert.equal(h.render().schedules[0].revision, 2);
  h.requests[1].resolve(live(1)); await oldRead;
  const displayed = h.render().schedules[0]?.revision;
  await tick();
  h.requests.slice(3).forEach((request) => request.resolve(live(2)));
  await tick(); h.unmount();
  assert.equal(displayed, 2);
  assert.equal(h.requests[1].options.signal.aborted, true);
});

test('unmount cancels a read and prevents its late completion from updating state', async () => {
  const h = harness(); h.render(); h.start(); await tick(); h.unmount();
  const before = h.writes();
  h.requests[0].resolve(live(1)); await tick();
  assert.equal(h.writes(), before);
  assert.equal(h.requests[0].options.signal.aborted, true);
});

test('scope changes clear old rows and reject the previous scope response', async () => {
  const h = await primed();
  const oldRead = h.render().reload(); await tick();
  h.render('action'); h.start(); await tick();
  assert.equal(h.render().status, 'loading');
  h.requests[2].resolve(live(3)); await tick();
  h.requests[1].resolve(live(1)); await oldRead;
  assert.equal(h.render().schedules[0].revision, 3);
  assert.match(h.requests[2].url, /scope=action$/);
  h.unmount();
});

test('Strict Mode effect replay sends only the surviving read', async () => {
  const h = harness(); h.render(); h.start(); h.replay(); await tick();
  const count = h.requests.length;
  h.requests.forEach((request) => request.resolve(live(1))); await tick(); h.unmount();
  assert.equal(count, 1);
});

test('failed or malformed reads cannot appear as live schedules', async () => {
  for (const [data, ok] of [[live(1), false], [{ status: 'live' }, true], [{ status: 'live', schedules: {} }, true], [{ ...live(1), source: 'error' }, true]]) {
    const h = harness(); h.render(); h.start(); await tick();
    h.requests[0].resolve(data, ok); await tick();
    assert.equal(h.render().status, 'error', JSON.stringify(data));
    assert.deepEqual(h.render().schedules, []);
    h.unmount();
  }
});

test('preview and error envelopes do not expose attached rows', async () => {
  for (const status of ['preview', 'error']) {
    const h = harness(); h.render(); h.start(); await tick();
    h.requests[0].resolve({ status, schedules: [row(1)], message: 'Unavailable' }); await tick();
    assert.equal(h.render().status, status);
    assert.deepEqual(h.render().schedules, []);
    h.unmount();
  }
});

test('response body deadline releases the read so the operator can retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); h.render(); h.start(); await tick();
  const signal = h.requests[0].options.signal;
  let resolveBody;
  // A stalled body reader may ignore abort. The lifecycle still has to release the read.
  h.requests[0].response({ ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) });
  await tick(); t.mock.timers.tick(15_000); await tick();
  const bounded = signal.aborted;
  assert.equal(h.render().status, 'error');
  const retry = h.render().reload(); await tick();
  h.requests[1].resolve(live(2)); await retry;
  resolveBody(live(1)); await tick();
  assert.equal(h.render().schedules[0].revision, 2);
  assert.equal(h.render().status, 'live'); h.unmount();
  assert.equal(bounded, true);
});

test('a successful read clears its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await primed();
  t.mock.timers.tick(15_000);
  assert.equal(h.requests[0].options.signal.aborted, false);
  assert.equal(h.render().status, 'live'); h.unmount();
});

test('write completion after unmount cannot update a departed screen', async () => {
  const h = await primed();
  const writing = h.render().set({ variantId, expectedRevision: 1 }); await tick();
  h.unmount(); const before = h.writes();
  h.requests[1].resolve({ status: 'saved', schedule: row(2) }); await writing;
  assert.equal(h.writes(), before);
});

test('a write from the previous scope cannot publish into the new scope', async () => {
  const h = await primed();
  const writing = h.render().set({ variantId, expectedRevision: 1 }); await tick();
  h.render('action'); h.start(); await tick();
  h.requests[2].resolve({ status: 'live', schedules: [] }); await tick();
  h.requests[1].resolve({ status: 'saved', schedule: row(2) }); await writing; await tick();
  assert.deepEqual(h.render().schedules, []);
  assert.equal(h.requests.length, 3);
  h.unmount();
});

test('a revision conflict invalidates the pending read before refreshing', async () => {
  const h = await primed();
  const oldRead = h.render().reload(); await tick();
  const writing = h.render().cancel(variantId, 1); await tick();
  h.requests[2].resolve({ status: 'conflict' }); await writing; await tick();
  assert.equal(h.requests[1].options.signal.aborted, true);
  h.requests[3].resolve(live(3)); await tick();
  h.requests[1].resolve(live(1)); await oldRead;
  assert.equal(h.render().schedules[0].revision, 3);
  h.unmount();
});

test('an older duplicate acknowledgment cannot replace a newer confirmed row', async () => {
  const h = await primed();
  const older = h.render().set({ variantId, expectedRevision: 1 });
  const newer = h.render().set({ variantId, expectedRevision: 2 }); await tick();
  h.requests[2].resolve({ status: 'saved', schedule: row(3) }); await newer;
  h.requests[1].resolve({ status: 'duplicate', schedule: row(2) }); await older; await tick();
  assert.equal(h.render().schedules[0].revision, 3);
  h.requests.slice(3).forEach((request) => request.resolve(live(3)));
  await tick(); h.unmount();
});
