import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readProjectBrandContentEnvelope } from '../../../lib/project-brand-content.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ ok: true, json: async () => data });
const live = items => response({ status: 'live', source: 'supabase', items });
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { resolve, reject, promise }; };

function mount(fetcher, initial = null) {
  const cells = [];
  let cursor = 0, effects = [], open = initial, updates = 0;
  const React = {
    useRef(value) { return cells[cursor++] ??= { current: value }; },
    useState(initial) { const i = cursor++; const cell = cells[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [cell.value, next => { updates++; cell.value = typeof next === 'function' ? next(cell.value) : next; }]; },
    useCallback(fn, deps) { const i = cursor++; if (!cells[i] || !same(cells[i].deps, deps)) cells[i] = { value: fn, deps }; return cells[i].value; },
    useEffect(effect, deps) { const i = cursor++; if (!cells[i] || !same(cells[i].deps, deps)) effects.push({ i, effect, deps }); },
  };
  const source = readFileSync(new URL('./use-project-brand-content.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const use = new Function('React', 'fetch', 'readProjectBrandContentEnvelope', `${source}\nreturn useProjectBrandContent;`)(React, fetcher, readProjectBrandContentEnvelope);
  function render(next = open) {
    open = next; cursor = 0; effects = [];
    const view = use(open);
    for (const e of effects) { cells[e.i]?.cleanup?.(); cells[e.i] = { deps: e.deps, cleanup: e.effect() }; }
    return view;
  }
  render();
  return { render, updates: () => updates, unmount() { cells.forEach(cell => cell?.cleanup?.()); } };
}

test('no detail means no read; success is reused across project detail changes', async () => {
  const calls = [], items = [{ id: 'video', brandId: 'brand-a' }];
  const hook = mount((path, options) => { calls.push({ path, options }); return Promise.resolve(live(items)); });
  assert.equal(calls.length, 0);
  hook.render('project-a'); assert.equal(hook.render().state, 'loading');
  await settle(); assert.deepEqual(hook.render().items, items);
  hook.render('project-b'); hook.render(null); hook.render('project-a');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/hub/content');
  assert.equal(calls[0].options.cache, 'no-store');
  hook.unmount();
});

test('HTTP 200 error is visible, retry recovers, and failed refresh preserves marked previous content', async () => {
  const items = [{ id: 'synthetic-video', brandId: 'brand-a' }];
  const queue = [response({ status: 'error', error: 'offline' }), live(items), response({ status: 'error' })];
  let calls = 0;
  const hook = mount(async () => { calls++; return queue.shift(); }, 'project-a');
  await settle(); assert.equal(hook.render().state, 'error');
  hook.render().reload(); hook.render(); assert.equal(hook.render().state, 'loading');
  await settle(); assert.deepEqual(hook.render().items, items); assert.equal(hook.render().state, 'live');
  hook.render().reload(); hook.render(); await settle();
  assert.equal(hook.render().state, 'error'); assert.deepEqual(hook.render().items, items);
  assert.equal(calls, 3);
  hook.unmount();
});

test('network and invalid JSON failures are not silently cached as empty content', async () => {
  for (const fetcher of [async () => { throw new Error('network'); }, async () => ({ ok: true, json: async () => { throw new Error('json'); } })]) {
    const hook = mount(fetcher, 'project-a'); await settle();
    assert.equal(hook.render().state, 'error');
    hook.render(null); hook.render('project-a'); assert.equal(hook.render().state, 'loading');
    await settle(); hook.unmount();
  }
});

test('aborted old reads and unmounted reads cannot overwrite a newer detail result', async () => {
  const old = deferred(), current = deferred(), requests = [];
  const hook = mount((_path, options) => { requests.push(options); return requests.length === 1 ? old.promise : current.promise; }, 'project-a');
  hook.render('project-b');
  assert.equal(requests[0].signal.aborted, true);
  current.resolve(live([{ id: 'current' }])); await settle();
  old.resolve(live([{ id: 'late' }])); await settle();
  assert.deepEqual(hook.render().items, [{ id: 'current' }]);
  hook.render().reload(); hook.render(); hook.unmount();
  const count = hook.updates(); await settle(); assert.equal(hook.updates(), count);
});

test('partial and preview remain explicit and can be rechecked', async () => {
  for (const data of [{ status: 'partial', source: 'supabase', items: [] }, { status: 'preview', source: 'preview', items: [] }]) {
    let reads = 0;
    const hook = mount(async () => { reads++; return response(data); }, 'project-a');
    await settle(); assert.equal(hook.render().state, data.status);
    hook.render('project-b'); assert.equal(reads, 1);
    hook.render().reload(); hook.render(); await settle(); assert.equal(reads, 2);
    hook.unmount();
  }
});
