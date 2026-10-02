import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentLedgerCache, EMPTY_CONTENT_LEDGER } from './content-ledger-cache.js';

const tick = () => new Promise(setImmediate);
const dataResponse = (data) => ({ ok: true, json: async () => data });
const live = (items = []) => ({ ...EMPTY_CONTENT_LEDGER, source: 'supabase', status: 'live', items });

function deferredReads() {
  const requests = [];
  const cache = createContentLedgerCache((url, options) => new Promise((resolve, reject) => {
    requests.push({ url, signal: options.signal, resolve: (data) => resolve(dataResponse(data)), reject });
  }));
  return { cache, requests };
}

test('source errors and unrecognized envelopes never turn into preview or empty live data', async () => {
  for (const data of [
    { source: 'error' }, { source: 'error', status: 'live' },
    { source: 'supabase', status: 'error' }, { source: 'supabase' },
    { source: 'supabase', status: 'unknown' }, { source: 'supabase', status: 'preview' },
    { source: 'supabase', status: 'live' }, { ...live(), variants: null },
    { ...live(), items: {} }, { status: 'live' }, {}, null,
  ]) {
    const cache = createContentLedgerCache(async () => dataResponse(data));
    await cache.refresh();
    assert.equal(cache.getSnapshot().syncState, 'error', JSON.stringify(data));
    assert.deepEqual(cache.getSnapshot().items, []);
  }
});

test('a synchronous transport failure releases the read so a retry reaches the server', async () => {
  let attempts = 0;
  const cache = createContentLedgerCache(() => {
    if (++attempts === 1) throw Error('offline');
    return dataResponse(live([{ id: 'saved' }]));
  });
  await cache.refresh();
  assert.equal(cache.getSnapshot().syncState, 'error');
  await cache.refresh();
  assert.equal(attempts, 2);
  assert.equal(cache.getSnapshot().syncState, 'live');
  assert.equal(cache.getSnapshot().items[0].id, 'saved');
});

test('a listener joining a loading read shares the same pending request', async () => {
  const { cache, requests } = deferredReads();
  let joined;
  let reentered = false;
  const unsubscribe = cache.subscribe(() => {
    if (cache.getSnapshot().syncState === 'loading' && !reentered) {
      reentered = true;
      joined = cache.refresh();
    }
  });
  const first = cache.refresh();
  await tick();
  unsubscribe();
  requests.forEach((request) => request.resolve(live()));
  await Promise.all([first, joined]);
  assert.equal(joined, first);
  assert.equal(requests.length, 1);
});

test('post-save invalidation aborts obsolete transport and late completion cannot release a newer read', async () => {
  const { cache, requests } = deferredReads();
  const first = cache.refresh();
  await tick();
  const afterSave = cache.invalidate();
  await tick();
  requests[0].resolve(live([{ id: 'old' }]));
  await first;
  const joined = cache.refresh();
  requests[1].resolve(live([{ id: 'new' }]));
  await afterSave;
  assert.equal(requests[0].signal?.aborted, true);
  assert.equal(joined, afterSave);
  assert.equal(requests.length, 2);
  assert.equal(cache.getSnapshot().items[0].id, 'new');
});

test('a stalled response body times out and remains retryable', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let rejectBody;
  let attempts = 0;
  const cache = createContentLedgerCache(async (_url, options) => {
    attempts++;
    if (attempts > 1) return dataResponse(live());
    signal = options.signal;
    return { ok: true, json: () => new Promise((_resolve, reject) => {
      rejectBody = reject;
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) };
  });
  const reading = cache.refresh();
  await tick();
  t.mock.timers.tick(15_000);
  await tick();
  const abortedAtDeadline = signal?.aborted;
  // Settle the baseline's unbounded transport so a red test never hangs.
  if (!abortedAtDeadline) rejectBody(Error('test cleanup'));
  await reading;
  assert.equal(abortedAtDeadline, true);
  assert.equal(cache.getSnapshot().syncState, 'error');
  await cache.refresh();
  assert.equal(attempts, 2);
  assert.equal(cache.getSnapshot().syncState, 'live');
});

test('a successful read clears its deadline instead of aborting completed work later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const cache = createContentLedgerCache(async (_url, options) => {
    signal = options.signal;
    return dataResponse(live());
  });
  await cache.refresh();
  assert.ok(signal, 'reads carry a bounded lifecycle');
  t.mock.timers.tick(15_000);
  assert.equal(signal.aborted, false);
  assert.equal(cache.getSnapshot().syncState, 'live');
});

test('source errors preserve a recent live snapshot only as partial', async () => {
  let data = live([{ id: 'known' }]);
  const cache = createContentLedgerCache(async () => dataResponse(data));
  await cache.refresh();
  data = { source: 'error', status: 'partial' };
  await cache.refresh();
  assert.equal(cache.getSnapshot().syncState, 'partial');
  assert.equal(cache.getSnapshot().items[0]?.id, 'known');
  data = { source: 'preview', status: 'preview' };
  await cache.refresh();
  assert.equal(cache.getSnapshot(), EMPTY_CONTENT_LEDGER);
});

test('a snapshot expiring during a failed refresh cannot remain visible as recent data', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let rejectRead;
  let reads = 0;
  const cache = createContentLedgerCache(() => ++reads === 1
    ? dataResponse(live([{ id: 'expired' }]))
    : new Promise((_resolve, reject) => { rejectRead = reject; }));
  await cache.refresh();
  now += 5 * 60_000 - 1;
  const refresh = cache.refresh();
  await tick();
  now += 2;
  rejectRead(Error('offline'));
  await refresh;
  assert.equal(cache.getSnapshot().syncState, 'error');
  assert.deepEqual(cache.getSnapshot().items, []);
});

test('the Studio catalog uses the lightweight endpoint and accepts brands without full ledgers', async () => {
  const urls = [];
  const cache = createContentLedgerCache(async (url) => {
    urls.push(url);
    return dataResponse({ source: 'supabase', status: 'live', brands: [{ id: 'brand', name: 'Brand' }] });
  }, { catalogOnly: true });
  await cache.refresh();
  assert.deepEqual(urls, ['/api/hub/content/catalog']);
  assert.equal(cache.getSnapshot().syncState, 'live');
  assert.equal(cache.getSnapshot().brands[0].id, 'brand');
  assert.deepEqual(cache.getSnapshot().items, []);
});

test('the full content snapshot preserves tag trends for Queue and Campaign consumers', async () => {
  const tagTrends = [{ tag: 'writing', count: 3, trend: 'up' }];
  const cache = createContentLedgerCache(async () => dataResponse({ ...live(), tagTrends }));
  await cache.refresh();
  assert.deepEqual(cache.getSnapshot().tagTrends, tagTrends);
});
