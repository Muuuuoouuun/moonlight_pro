import assert from 'node:assert/strict';
import test from 'node:test';
import * as revenueCache from './revenue-shared-cache.js';

const tick = () => new Promise(setImmediate);
const ledger = (values = {}) => ({ source: 'supabase', status: 'live', leads: [], deals: [], ...values });
const response = (data, ok = true) => ({ ok, json: async () => data });

function harness(options = {}) {
  assert.equal(typeof revenueCache.createRevenueLedgerCache, 'function', 'revenue reads need one shared request owner');
  const requests = [];
  let time = 1_000;
  const cache = revenueCache.createRevenueLedgerCache({
    now: () => time,
    fetcher: (url, options) => new Promise((resolve, reject) => requests.push({
      url, ...options, resolve: (data, ok = true) => resolve(response(data, ok)), respond: resolve, reject,
    })),
    ...options,
  });
  return { cache, requests, advance: (ms) => { time += ms; } };
}

test('cold snapshots are stable loading values and overlapping reads share one request', async () => {
  const h = harness();
  const cold = h.cache.getSnapshot();
  assert.equal(cold.syncState, 'loading');
  assert.equal(h.cache.getSnapshot(), cold);
  assert.equal(h.cache.getServerSnapshot(), cold);
  const first = h.cache.refresh(), second = h.cache.refresh();
  assert.equal(first, second);
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/api/hub/revenue');
  assert.equal(h.requests[0].cache, 'no-store');
  h.requests[0].resolve(ledger({ leads: [{ id: 'saved', name: 'Saved' }] }));
  const result = await first;
  assert.equal(result.syncState, 'live');
  assert.equal(result.ledger.leads[0].id, 'saved');
  assert.equal(h.cache.getSnapshot(), result);
});

test('subscribers share success, unsubscribe independently, and retain a warm read while refreshing', async () => {
  const h = harness(), first = [], second = [];
  const unsubscribe = h.cache.subscribe(() => first.push(h.cache.getSnapshot()));
  h.cache.subscribe(() => second.push(h.cache.getSnapshot()));
  const initial = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger({ deals: [{ id: 'old' }] })); await initial;
  const warm = h.cache.getSnapshot();
  unsubscribe();
  const count = first.length, background = h.cache.refresh(); await tick();
  assert.equal(h.cache.getSnapshot(), warm, 'a warm mount must not flash loading');
  h.requests[1].resolve(ledger({ status: 'partial', deals: [{ id: 'new' }], revenueTargets: null })); await background;
  assert.equal(first.length, count);
  assert.equal(second.at(-1).syncState, 'partial');
  assert.equal(second.at(-1).ledger.deals[0].id, 'new');
  assert.equal(second.at(-1).ledger.revenueTargets, null);
});

test('elapsed time alone never changes a mounted snapshot without starting a read', async () => {
  const h = harness(), read = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger({ leads: [{ id: 'old' }] })); await read;
  const warm = h.cache.getSnapshot();
  h.advance(5 * 60_000 - 1);
  assert.equal(h.cache.getSnapshot().syncState, 'live');
  h.advance(1);
  assert.equal(h.cache.getSnapshot(), warm, 'an unrelated render must not strand the page in loading');
  const current = h.cache.refresh();
  assert.equal(h.cache.getSnapshot().syncState, 'loading');
  assert.deepEqual(h.cache.getSnapshot().ledger.leads, []);
  await tick();
  h.requests[1].resolve(ledger()); await current;
  assert.equal(h.cache.getSnapshot().syncState, 'live');
});

test('subscribers reentering refresh share the already registered pending request', async () => {
  const h = harness(), reentered = [];
  const unsubscribe = h.cache.subscribe(() => reentered.push(h.cache.refresh()));
  const read = h.cache.refresh(); await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(reentered[0], read);
  h.requests[0].resolve(ledger()); await read;
  assert.ok(reentered.every((pending) => pending === read));
  assert.equal(h.requests.length, 1);
  unsubscribe();
});

test('a completed read clears its deadline instead of later aborting a successful response', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), read = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger()); await read;
  const completed = h.cache.getSnapshot();
  t.mock.timers.tick(15_000); await tick();
  assert.equal(h.requests[0].signal.aborted, false);
  assert.equal(h.cache.getSnapshot(), completed);
  assert.equal(h.requests.length, 1);
});

test('a cached ledger that expires during a failed refresh is discarded at failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), initial = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger({ leads: [{ id: 'old' }] })); await initial;
  h.advance(5 * 60_000 - 1);
  const read = h.cache.refresh(); await tick();
  assert.equal(h.cache.getSnapshot().syncState, 'live');
  h.requests[1].reject(Error('offline')); await tick();
  h.advance(1);
  t.mock.timers.tick(1200); await tick();
  h.requests[2].reject(Error('offline')); await read;
  assert.equal(h.cache.getSnapshot().syncState, 'error');
  assert.deepEqual(h.cache.getSnapshot().ledger.leads, []);
});

test('preview discards all live rows even if a preview payload incorrectly contains records', async () => {
  const h = harness(), live = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger({ leads: [{ id: 'old' }] })); await live;
  const preview = h.cache.refresh(); await tick();
  h.requests[1].resolve(ledger({ source: 'preview', status: 'preview', leads: [{ id: 'hidden' }] })); await preview;
  assert.equal(h.cache.getSnapshot().syncState, 'preview');
  assert.equal(h.cache.getSnapshot().ledger.source, 'preview');
  assert.deepEqual(h.cache.getSnapshot().ledger.leads, []);
  assert.equal(h.cache.getSnapshot().ledger.revenueTargets, null);
});

test('a failed read retries once after 1200ms while concurrent consumers still share it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), read = h.cache.refresh(); await tick();
  h.requests[0].reject(Error('transient')); await tick();
  assert.equal(h.cache.refresh(), read);
  t.mock.timers.tick(1199); await tick();
  assert.equal(h.requests.length, 1);
  t.mock.timers.tick(1); await tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(ledger()); await read;
  assert.equal(h.cache.getSnapshot().syncState, 'live');
});

test('failed refresh retains recent live rows as partial without extending their age', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), initial = h.cache.refresh(); await tick();
  h.requests[0].resolve(ledger({ leads: [{ id: 'kept' }] })); await initial;
  const at = h.cache.getSnapshot().at;
  h.advance(60_000);
  const read = h.cache.refresh(); await tick();
  h.requests[1].resolve({ status: 'error' }); await tick();
  t.mock.timers.tick(1200); await tick();
  h.requests[2].reject(Error('still offline')); await read;
  assert.equal(h.cache.getSnapshot().syncState, 'partial');
  assert.equal(h.cache.getSnapshot().ledger.leads[0].id, 'kept');
  assert.equal(h.cache.getSnapshot().at, at);
  h.advance(4 * 60_000);
  const expired = h.cache.refresh(); await tick();
  h.requests[3].reject(Error('offline')); await tick();
  t.mock.timers.tick(1200); await tick();
  h.requests[4].reject(Error('offline')); await expired;
  assert.equal(h.cache.getSnapshot().syncState, 'error');
  assert.deepEqual(h.cache.getSnapshot().ledger.leads, []);
});

for (const [name, data] of [
  ['HTTP 200 error', { status: 'error', source: 'supabase', leads: [], deals: [] }],
  ['error source', ledger({ source: 'error' })],
  ['missing body', null],
  ['unknown status', ledger({ status: 'unknown' })],
  ['missing collection', { status: 'live', source: 'supabase', leads: [] }],
  ['invalid source', ledger({ source: 'unrecognized' })],
  ['live source with preview status', ledger({ status: 'preview' })],
  ['unknown preview source', { status: 'preview', source: 'unrecognized' }],
  ['missing preview source', { status: 'preview' }],
]) {
  test(`${name} cannot become an empty live or preview result`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = harness(), read = h.cache.refresh(); await tick();
    h.requests[0].resolve(data); await tick();
    t.mock.timers.tick(1200); await tick();
    assert.equal(h.requests.length, 2, 'a malformed envelope must fail and retry once');
    h.requests[1].resolve(data); await read;
    assert.equal(h.requests.length, 2);
    assert.equal(h.cache.getSnapshot().syncState, 'error');
    assert.deepEqual(h.cache.getSnapshot().ledger.leads, []);
  });
}

test('a failed refresh after preview is error, never partial live data', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), initial = h.cache.refresh(); await tick();
  h.requests[0].resolve({ status: 'preview', source: 'preview' }); await initial;
  const read = h.cache.refresh(); await tick();
  h.requests[1].resolve(ledger(), false); await tick();
  t.mock.timers.tick(1200); await tick();
  h.requests[2].resolve(ledger(), false); await read;
  assert.equal(h.cache.getSnapshot().syncState, 'error');
});

test('synchronous fetch throws retry once and leave the next read usable', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const h = harness({ fetcher: () => {
    if (++calls <= 2) throw Error('transport unavailable');
    return response(ledger());
  } });
  const failed = h.cache.refresh(); await tick();
  t.mock.timers.tick(1200); await failed;
  assert.equal(calls, 2);
  assert.equal(h.cache.getSnapshot().syncState, 'error');
  await h.cache.refresh();
  assert.equal(calls, 3);
  assert.equal(h.cache.getSnapshot().syncState, 'live');
});

test('the 15s deadline covers stalled response bodies and ignores their late completion', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), read = h.cache.refresh(); await tick();
  let finishBody;
  h.requests[0].respond({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
  await tick();
  t.mock.timers.tick(14_999); await tick();
  assert.equal(h.requests[0].signal.aborted, false);
  t.mock.timers.tick(1); await tick();
  assert.equal(h.requests[0].signal.aborted, true);
  t.mock.timers.tick(1200); await tick();
  h.requests[1].resolve(ledger({ leads: [{ id: 'current' }] })); await read;
  finishBody(ledger({ leads: [{ id: 'late' }] })); await tick();
  assert.equal(h.cache.getSnapshot().ledger.leads[0].id, 'current');
});

test('two unresponsive attempts finish as error and release the pending slot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), read = h.cache.refresh(); await tick();
  t.mock.timers.tick(15_000); await tick();
  t.mock.timers.tick(1200); await tick();
  t.mock.timers.tick(15_000); await read;
  assert.equal(h.cache.getSnapshot().syncState, 'error');
  assert.equal(h.requests.length, 2);
  assert.ok(h.requests.every((request) => request.signal.aborted));
  const next = h.cache.refresh(); await tick();
  h.requests[2].resolve(ledger()); await next;
  assert.equal(h.cache.getSnapshot().syncState, 'live');
});

test('invalidation cancels old work and its cleanup cannot erase the replacement read', async () => {
  const h = harness(), old = h.cache.refresh(); await tick();
  const current = h.cache.invalidate(); await tick();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests.length, 2);
  await old;
  h.requests[0].resolve(ledger({ leads: [{ id: 'old' }] })); await tick();
  assert.equal(h.cache.getSnapshot().syncState, 'loading');
  assert.equal(h.cache.refresh(), current, 'old finally must not clear the replacement pending promise');
  h.requests[1].resolve(ledger({ leads: [{ id: 'new' }] })); await current;
  assert.equal(h.cache.getSnapshot().ledger.leads[0].id, 'new');
});

test('invalidation cancels a scheduled retry and waits only for the post-save read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), old = h.cache.refresh(); await tick();
  h.requests[0].reject(Error('offline')); await tick();
  const current = h.cache.invalidate(); await tick();
  await old;
  t.mock.timers.tick(1200); await tick();
  assert.equal(h.requests.length, 2, 'the superseded retry must never make another request');
  assert.equal(h.cache.refresh(), current);
  h.requests[1].resolve(ledger()); await current;
  assert.equal(h.cache.getSnapshot().syncState, 'live');
});
