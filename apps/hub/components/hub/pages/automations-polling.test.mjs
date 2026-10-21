import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./automations.jsx', import.meta.url), 'utf8');
const hook = source.slice(source.indexOf('const EMPTY_AUTOMATION_SUMMARY'), source.indexOf('export function AutomationsIndex'));
const settle = () => new Promise(resolve => setImmediate(resolve));
const live = n => ({ status: 'live', source: 'supabase', runs: [{ id: `run-${n}` }], summary: { runsToday: n } });

// Evaluate the actual hook with deterministic lifecycle/timers and synthetic
// transport. This is not a React/browser timing or production-network test.
function harness({ obeyAbort = true } = {}) {
  const requests = [], timers = new Map(), intervals = new Map();
  const document = { hidden: false };
  let rendering, sequence = 0;
  const React = {
    useRef(initial) { rendering.reference ??= { current: initial }; return rendering.reference; },
    useState(initial) {
      const owner = rendering; owner.state = initial;
      return [owner.state, update => { owner.state = typeof update === 'function' ? update(owner.state) : update; }];
    },
    useCallback(callback) { return callback; },
    useEffect(effect) { rendering.effects.push(effect); },
  };
  const fetch = (url, options) => new Promise((resolve, reject) => {
    requests.push({ url, options, reject, resolve: data => resolve({ ok: true, json: async () => data }) });
    if (obeyAbort) options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const setTimeout = (callback, ms) => { const id = ++sequence; timers.set(id, { callback, ms }); return id; };
  const clearTimeout = id => timers.delete(id);
  const setInterval = callback => { const id = ++sequence; intervals.set(id, callback); return id; };
  const clearInterval = id => intervals.delete(id);
  const useLedger = new Function('React', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'document',
    `${hook}; return useAutomationsLedger;`)(React, fetch, setTimeout, clearTimeout, setInterval, clearInterval, document);
  function mount(startEffects = true) {
    const owner = { effects: [], state: null, reference: null };
    rendering = owner;
    const value = useLedger({ autoRefresh: true, refreshIntervalMs: 5000 });
    let cleanups = [];
    const start = () => { cleanups = owner.effects.map(effect => effect()).filter(Boolean); };
    if (startEffects) start();
    return { value, state: () => owner.state, stop: () => cleanups.forEach(cleanup => cleanup()), restart: start };
  }
  const first = mount();
  return {
    ...first, requests, timers, document, mount,
    tick: () => { for (const callback of intervals.values()) callback(); },
    deadline: () => { for (const { callback } of [...timers.values()]) callback(); },
    cachedRemount: () => mount(false).state(),
  };
}

test('slow reads stay single-flight across polling and manual refresh; cleanup aborts transport', async () => {
  const h = harness();
  for (let tick = 0; tick < 6; tick++) h.tick();
  await h.value.reload();
  assert.equal(h.requests.length, 1);
  assert.equal(h.state().syncState, 'loading');
  h.stop();
  assert.equal(h.requests[0].options.signal.aborted, true);
  await settle();
  assert.equal(h.timers.size, 0);
});

test('failure releases the pending slot and a later read can recover', async () => {
  const h = harness();
  h.requests[0].reject(new Error('offline'));
  await settle();
  assert.equal(h.state().syncState, 'error');
  h.tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(live(2));
  await settle();
  assert.equal(h.state().syncState, 'live');
  assert.equal(h.state().summary.runsToday, 2);
  h.stop();
});

test('a bounded transport timeout publishes error and permits another request', async () => {
  const h = harness();
  assert.deepEqual([...h.timers.values()].map(timer => timer.ms), [15000]);
  h.deadline();
  await settle();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.state().syncState, 'error');
  h.tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ status: 'preview', source: 'preview' });
  await settle();
  assert.equal(h.state().syncState, 'preview');
  h.stop();
});

test('an obsolete response cannot update state/cache after cleanup and Strict Mode restart', async () => {
  const h = harness({ obeyAbort: false });
  h.stop();
  h.restart();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(live(9));
  await settle();
  h.requests[0].resolve(live(1));
  await settle();
  assert.equal(h.state().summary.runsToday, 9);
  h.tick();
  h.requests[2].reject(new Error('offline'));
  await settle();
  assert.equal(h.state().syncState, 'partial');
  assert.equal(h.state().summary.runsToday, 9);
  h.stop();
});

test('background polling skips hidden documents and resumes on a later visible tick', async () => {
  const h = harness();
  h.requests[0].resolve(live(1));
  await settle();
  h.document.hidden = true;
  h.tick();
  assert.equal(h.requests.length, 1);
  h.document.hidden = false;
  h.tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ status: 'error', source: 'error' });
  await settle();
  assert.equal(h.state().syncState, 'partial');
  assert.equal(h.state().summary.runsToday, 1);
  h.stop();
  assert.equal(h.cachedRemount().syncState, 'partial');
});

test('a slow failed consumer cannot downgrade another consumer’s newer successful cache', async () => {
  const h = harness();
  h.requests[0].resolve(live(1));
  await settle();
  const slow = h.mount(), fast = h.mount();
  h.requests[2].resolve(live(9));
  await settle();
  h.requests[1].reject(new Error('older read failed'));
  await settle();
  assert.equal(slow.state().syncState, 'partial');
  assert.equal(fast.state().syncState, 'live');
  assert.equal(h.cachedRemount().syncState, 'live');
  assert.equal(h.cachedRemount().summary.runsToday, 9);
  slow.stop(); fast.stop(); h.stop();
});
