import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRevenueLedgerCache } from '../components/hub/revenue-shared-cache.js';

const file = fs.readFileSync(new URL('../components/hub/pages/revenue-core.jsx', import.meta.url), 'utf8');
const start = file.indexOf('export function useRevenueLedger()');
const source = file.slice(start, file.indexOf('\n}\n', start) + 3).replace('export ', '');
const run = new Function('React', 'revenueLedgerCache', source + '\nreturn useRevenueLedger();');
const tick = () => new Promise(setImmediate);
const ledger = (id) => ({ source: 'supabase', status: 'live', leads: [{ id }], deals: [] });

function harness() {
  const requests = [];
  let time = 1_000;
  const cache = createRevenueLedgerCache({
    now: () => time,
    fetcher: (_url, options) => new Promise((resolve) => requests.push({
      signal: options.signal, resolve: (data) => resolve({ ok: true, json: async () => data }),
    })),
  });
  function mount() {
    let unsubscribe, effect, output, memo, updates = 0;
    // Exercise the actual hook's store wiring without loading the unrelated JSX
    // page. The cache is real; this adapter controls the effect/subscription phases.
    const React = {
      useSyncExternalStore: (subscribe, getSnapshot) => {
        unsubscribe ||= subscribe(() => { updates++; output = run(React, cache); });
        return getSnapshot();
      },
      useEffect: (fn) => { effect ||= fn; },
      useMemo: (fn) => memo ||= fn(),
      useCallback: (fn) => fn,
    };
    output = run(React, cache);
    return {
      latest: () => output, updates: () => updates,
      start: () => effect(), unmount: () => unsubscribe?.(),
      render: () => { output = run(React, cache); return output; },
    };
  }
  return { cache, requests, mount, advance: (ms) => { time += ms; } };
}

test('cold revenue read is loading before effects, so customer deep links wait for the ledger', () => {
  const h = harness(), page = h.mount();
  assert.equal(page.latest().syncState, 'loading');
  assert.deepEqual(page.latest().ledger.leads, []);
  assert.equal(h.requests.length, 0);
  page.unmount();
});

test('a servable revenue cache retains its known state and revalidates on mount', async () => {
  const h = harness(), read = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger('cached')); await read;
  const page = h.mount();
  assert.equal(page.latest().syncState, 'live');
  assert.equal(page.latest().ledger.leads[0].id, 'cached');
  page.start(); await tick();
  assert.equal(h.requests.length, 2, 'a warm page still revalidates in the background');
  assert.equal(page.latest().syncState, 'live');
  h.requests[1].resolve(ledger('current')); await tick();
  assert.equal(page.latest().ledger.leads[0].id, 'current');
  page.unmount();
});

test('overlapping revenue consumers share one browser read and unsubscribe independently', async () => {
  const h = harness(), first = h.mount(), second = h.mount();
  first.start(); second.start(); await tick();
  assert.equal(h.requests.length, 1);
  first.unmount();
  const before = first.updates();
  h.requests[0].resolve(ledger('saved')); await tick();
  assert.equal(first.updates(), before, 'unmounted consumers receive no further updates');
  assert.equal(h.requests[0].signal.aborted, false, 'the other consumer still owns this bounded shared read');
  assert.equal(second.latest().ledger.leads[0].id, 'saved');
  second.unmount();
});

test('reload cancels the previous read and publishes the post-save ledger to every mounted consumer', async () => {
  const h = harness(), first = h.mount(), second = h.mount();
  first.start(); second.start(); await tick();
  const reload = first.latest().reload(); await tick();
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[1].resolve(ledger('after-save')); await reload;
  h.requests[0].resolve(ledger('before-save')); await tick();
  for (const page of [first, second]) {
    assert.equal(page.latest().ledger.leads[0].id, 'after-save');
    assert.equal(page.latest().syncState, 'live');
    page.unmount();
  }
});

test('a new mount with an expired cache is loading before deep-link effects run', async () => {
  const h = harness(), read = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger('expired')); await read;
  h.advance(5 * 60_000);
  const page = h.mount();
  assert.equal(page.latest().syncState, 'loading');
  assert.deepEqual(page.latest().ledger.leads, []);
  page.start(); await tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(ledger('new-deep-link-target')); await tick();
  assert.equal(page.latest().syncState, 'live');
  assert.equal(page.latest().ledger.leads[0].id, 'new-deep-link-target');
  page.unmount();
});

test('a new mount after a previous read failed waits for its retry before consuming deep links', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), read = h.cache.refresh(); await tick();
  h.requests[0].resolve({ status: 'error' }); await tick();
  t.mock.timers.tick(1200); await tick();
  h.requests[1].resolve({ status: 'error' }); await read;
  assert.equal(h.cache.getSnapshot().syncState, 'error');
  const page = h.mount();
  assert.equal(page.latest().syncState, 'loading');
  page.start(); await tick();
  h.requests[2].resolve(ledger('recovered')); await tick();
  assert.equal(page.latest().syncState, 'live');
  page.unmount();
});

test('a mounted consumer stays live on a later render even when the cache age passes five minutes', async () => {
  const h = harness(), page = h.mount();
  page.start(); await tick();
  h.requests[0].resolve(ledger('mounted')); await tick();
  h.advance(5 * 60_000);
  assert.equal(page.render().syncState, 'live');
  assert.equal(h.requests.length, 1, 'time passing is not a request or a loading transition');
  page.unmount();
});
