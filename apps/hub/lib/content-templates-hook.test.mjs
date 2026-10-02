import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/hub/pages/use-content-templates.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const run = new Function('React', 'fetch', `${source}\nreturn useContentTemplates;`);
const tick = () => new Promise(setImmediate);
const id = '11111111-1111-4111-8111-111111111111';
const row = (revision) => ({ id, revision, name: '회귀 검증용', request: '검증용 요청', skeleton: '', updatedAt: null });
const live = (revision) => ({ status: 'live', templates: [row(revision)] });

// Execute the actual hook with explicit React render/effect phases. Deferred
// transport can complete even after abort, exposing stale-response races.
function harness() {
  const slots = [], effects = new Set(), requests = [];
  let cursor = 0, writes = 0;
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
  return {
    requests, render: () => { cursor = 0; return hook(); }, writes: () => writes,
    start() {
      for (const index of effects) { slots[index].cleanup?.(); slots[index].cleanup = slots[index].setup(); }
      effects.clear();
    },
    replay() { for (const slot of slots) if (slot.setup) { slot.cleanup?.(); slot.cleanup = slot.setup(); } },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}

async function mounted(t) {
  const h = harness(); t.after(() => h.unmount());
  h.render(); h.start(); await tick();
  return h;
}

async function primed(t) {
  const h = await mounted(t);
  h.requests[0].resolve(live(1)); await tick();
  return h;
}

test('overlapping reloads share one template read per hook', async (t) => {
  const h = await mounted(t);
  const first = h.render().reload(), second = h.render().reload(); await tick();
  const count = h.requests.length;
  h.requests.forEach((request) => request.resolve(live(1)));
  await Promise.all([first, second]);
  assert.equal(count, 1);
  assert.equal(first, second);
  const other = await mounted(t);
  assert.equal(other.requests.length, 1);
  other.requests[0].resolve(live(2)); await tick();
  assert.equal(h.render().templates[0].revision, 1);
});

test('a pending initial read cannot roll back a confirmed template save', async (t) => {
  const h = await mounted(t);
  const writing = h.render().save(row(1)); await tick();
  h.requests[1].resolve({ status: 'saved', template: row(2) }); await writing;
  assert.equal(h.render().templates[0].revision, 2);
  h.requests[0].resolve(live(1)); await tick();
  assert.equal(h.render().templates[0].revision, 2);
  assert.equal(h.requests[0].options.signal.aborted, true);
  // The replaced initial read must still recover the full list.
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve({ status: 'live', templates: [row(2), { ...row(1), id: 'other', name: '나머지' }] }); await tick();
  assert.equal(h.render().status, 'live');
  assert.equal(h.render().templates.length, 2);
});

test('a pre-delete read cannot restore a deleted template', async (t) => {
  const h = await primed(t);
  const oldRead = h.render().reload(); await tick();
  const deleting = h.render().remove(id); await tick();
  h.requests[2].resolve({ status: 'deleted', id }); await deleting;
  h.requests[1].resolve(live(1)); await oldRead; await tick();
  assert.deepEqual(h.render().templates, []);
  assert.equal(h.requests[1].options.signal.aborted, true);
  h.requests.slice(3).forEach((request) => request.resolve({ status: 'live', templates: [] })); await tick();
});

test('an old duplicate acknowledgement cannot downgrade a newer template', async (t) => {
  const h = await primed(t);
  const older = h.render().save(row(1));
  const newer = h.render().save(row(2)); await tick();
  h.requests[2].resolve({ status: 'saved', template: row(3) }); await newer;
  h.requests[1].resolve({ status: 'duplicate', template: row(2) }); await older; await tick();
  assert.equal(h.render().templates[0].revision, 3);
  h.requests.slice(3).forEach((request) => request.resolve(live(3))); await tick();
});

test('unmount cancels pending reads without late state updates', async (t) => {
  const h = await mounted(t); h.unmount();
  const before = h.writes();
  h.requests[0].resolve(live(1)); await tick();
  assert.equal(h.writes(), before);
  assert.equal(h.requests[0].options.signal.aborted, true);
});

test('Strict Mode replay sends only the surviving initial request', async (t) => {
  const h = harness(); t.after(() => h.unmount());
  h.render(); h.start(); h.replay(); await tick();
  const count = h.requests.length;
  h.requests.forEach((request) => request.resolve(live(1))); await tick();
  assert.equal(count, 1);
});

test('Strict Mode replay rejects completion from the departed effect', async (t) => {
  const h = await mounted(t); h.replay(); await tick();
  h.requests[1].resolve(live(2)); await tick();
  h.requests[0].resolve(live(1)); await tick();
  assert.equal(h.render().templates[0].revision, 2);
  assert.equal(h.requests[0].options.signal.aborted, true);
});

test('failed HTTP, error sources, and malformed live arrays clear rows', async (t) => {
  for (const [data, ok] of [[live(1), false], [{ status: 'live' }, true], [{ status: 'live', templates: {} }, true], [{ ...live(1), source: 'error' }, true], [null, true], [{ status: 'unknown' }, true]]) {
    const h = await primed(t);
    const reading = h.render().reload(); await tick();
    h.requests[1].resolve(data, ok); await reading;
    assert.equal(h.render().status, 'error', JSON.stringify(data));
    assert.deepEqual(h.render().templates, []);
  }
});

test('preview and error envelopes never expose attached template rows', async (t) => {
  for (const status of ['preview', 'error']) {
    const h = await mounted(t);
    h.requests[0].resolve({ status, templates: [row(1)], message: 'Unavailable' }); await tick();
    assert.equal(h.render().status, status);
    assert.equal(h.render().message, 'Unavailable');
    assert.deepEqual(h.render().templates, []);
  }
});

test('fetch and body deadlines release the read for a fresh retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stalledBody of [false, true]) {
    const h = await mounted(t);
    let resolveBody;
    if (stalledBody) h.requests[0].response({ ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) });
    await tick(); t.mock.timers.tick(15_000); await tick();
    assert.equal(h.render().status, 'error');
    assert.equal(h.requests[0].options.signal.aborted, true);
    const retry = h.render().reload(); await tick();
    h.requests[1].resolve(live(2)); await retry;
    if (stalledBody) resolveBody(live(1)); else h.requests[0].resolve(live(1));
    await tick();
    assert.equal(h.render().templates[0].revision, 2);
    assert.equal(h.render().status, 'live');
  }
});

test('a successful read clears its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await primed(t);
  t.mock.timers.tick(15_000);
  assert.equal(h.requests[0].options.signal.aborted, false);
  assert.equal(h.render().status, 'live');
});

test('save and delete results remain available after unmount without state updates', async (t) => {
  for (const action of ['save', 'remove']) {
    const h = await primed(t);
    const writing = action === 'save' ? h.render().save(row(1)) : h.render().remove(id); await tick();
    h.unmount(); const before = h.writes();
    const result = action === 'save' ? { status: 'saved', template: row(2) } : { status: 'deleted', id };
    h.requests[1].resolve(result);
    assert.deepEqual(await writing, result);
    assert.equal(h.writes(), before);
    assert.equal(h.requests.length, 2);
  }
});

test('a write from before effect replay cannot publish into the new lifecycle', async (t) => {
  const h = await primed(t);
  const writing = h.render().save(row(1)); await tick();
  h.replay(); await tick();
  h.requests[2].resolve({ status: 'live', templates: [] }); await tick();
  h.requests[1].resolve({ status: 'saved', template: row(2) }); await writing;
  assert.deepEqual(h.render().templates, []);
  assert.equal(h.requests.length, 3);
});

test('failed writes preserve existing rows and return the server conflict', async (t) => {
  const h = await primed(t);
  const writing = h.render().save(row(1)); await tick();
  const result = { status: 'conflict', template: row(3), message: 'Changed elsewhere' };
  h.requests[1].resolve(result, false);
  assert.deepEqual(await writing, result);
  assert.equal(h.render().templates[0].revision, 1);
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { action: 'save', id, name: row(1).name, request: row(1).request, skeleton: '', expectedRevision: 1 });
});

test('a conflict reload cannot join the read started before the conflict', async (t) => {
  const h = await primed(t);
  const oldRead = h.render().reload(); await tick();
  const writing = h.render().save(row(1)); await tick();
  h.requests[2].resolve({ status: 'conflict', template: row(3) }, false); await writing;
  const latest = h.render().reload(); await tick();
  assert.equal(h.requests[1].options.signal.aborted, true);
  assert.equal(h.requests.length, 4);
  h.requests[3].resolve(live(3)); await latest;
  h.requests[1].resolve(live(1)); await oldRead;
  assert.equal(h.render().templates[0].revision, 3);
});

test('reload after unmount cannot dispatch another request or update state', async (t) => {
  const h = await primed(t); h.unmount();
  const before = h.writes();
  const reload = h.render().reload(); await tick();
  const count = h.requests.length;
  h.requests.slice(1).forEach((request) => request.resolve(live(2))); await reload;
  assert.equal(count, 1);
  assert.equal(h.writes(), before);
});
