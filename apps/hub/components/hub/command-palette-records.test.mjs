import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommandPaletteRecordLoader, matchingPaletteRecords, paletteItemKey } from './command-palette-records.js';
import { createRevenueLedgerCache } from './revenue-shared-cache.js';

const tick = () => new Promise(setImmediate);
const revenue = (values = {}) => ({ source: 'supabase', status: 'live', leads: [], deals: [], ...values });
const tasks = (values = {}) => ({ status: 'live', tasks: [], ...values });

function harness(options = {}) {
  const requests = [];
  let time = 1_000;
  const fetcher = options.fetcher || ((url, options) => new Promise((resolve, reject) => requests.push({
      url, signal: options.signal,
      resolve: (data, ok = true) => resolve({ ok, json: async () => data }), respond: resolve, reject,
    })));
  const cache = createRevenueLedgerCache({ fetcher, now: () => time });
  const load = createCommandPaletteRecordLoader({ fetcher, revenueCache: cache, now: () => time });
  function open() {
    const updates = [];
    const close = load((state) => updates.push(state));
    return { updates, close, latest: () => updates.at(-1) };
  }
  return { open, requests, cache, advance: (ms) => { time += ms; } };
}

test('overlapping palette opens issue one request per source and deliver the faster source first', async () => {
  const h = harness(), first = h.open(), second = h.open();
  await tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(tasks({ tasks: [{ id: 'task one', title: 'Task match' }] }));
  await tick();
  for (const opened of [first, second]) {
    assert.deepEqual(opened.latest().sources, { revenue: 'loading', tasks: 'live' });
    assert.equal(opened.latest().items[0].path, 'dashboard/work/my?task=task%20one');
  }
  h.requests[0].resolve(revenue({ leads: [{ id: 'lead one', name: 'Lead match' }] }));
  await tick();
  assert.deepEqual(first.latest().items.map((item) => item.kind), ['고객', '할 일']);
  h.open();
  await tick();
  assert.equal(h.requests.length, 2, 'a completed open reuses both successful caches');
});

test('closing unsubscribes from results while a reopen reuses the in-flight requests', async () => {
  const h = harness(), first = h.open();
  await tick();
  first.close();
  const before = first.updates.length, reopened = h.open();
  await tick();
  assert.equal(h.requests.length, 2);
  h.requests[0].resolve(revenue()); h.requests[1].resolve(tasks());
  await tick();
  assert.equal(first.updates.length, before, 'the closed component receives no updates');
  assert.deepEqual(reopened.latest().sources, { revenue: 'live', tasks: 'live' });
});

test('HTTP 200 error envelopes preserve the other source and retry without a 60 second empty cache', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve({ status: 'error', leads: [], deals: [] });
  h.requests[1].resolve(tasks({ tasks: [{ id: 'a', title: 'Ready' }] }));
  await tick();
  t.mock.timers.tick(1200); await tick();
  h.requests[2].resolve({ status: 'error' }); await tick();
  assert.deepEqual(first.latest().sources, { revenue: 'error', tasks: 'live' });
  assert.equal(first.latest().items[0].label, 'Ready');
  const retry = h.open();
  await tick();
  assert.equal(h.requests.length, 4, 'only the failed source is fetched again');
  assert.equal(retry.latest().items[0].label, 'Ready');
  h.requests[3].resolve(revenue());
  await tick();
  assert.deepEqual(retry.latest().sources, { revenue: 'live', tasks: 'live' });
});

test('partial source results remain searchable while an unrelated source fails', async () => {
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve(revenue({ status: 'partial', deals: [{ id: 'deal', name: 'Available deal' }] }));
  h.requests[1].reject(Error('network'));
  await tick();
  assert.deepEqual(first.latest().sources, { revenue: 'partial', tasks: 'error' });
  assert.equal(first.latest().items[0].label, 'Available deal');
  h.open();
  await tick();
  assert.equal(h.requests.length, 4, 'partial and failed reads remain retryable');
  h.requests[2].resolve(revenue()); h.requests[3].resolve(tasks());
  await tick();
});

test('preview is explicit and cacheable, and never contributes records', async () => {
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve(revenue({ source: 'preview', status: 'preview', leads: [{ id: 'hidden', name: 'Hidden' }] }));
  h.requests[1].resolve({ status: 'preview' });
  await tick();
  assert.deepEqual(first.latest(), { items: [], sources: { revenue: 'preview', tasks: 'preview' } });
  h.open(); await tick();
  assert.equal(h.requests.length, 2);
});

test('a fresh Revenue page cache supplies customer and deal results before tasks settle', async () => {
  const h = harness(), pageRead = h.cache.refresh(); await tick();
  h.requests[0].resolve(revenue({ deals: [{ id: 'a/b', name: 'Cached deal' }] })); await pageRead;
  const first = h.open();
  assert.equal(first.latest().items[0].path, 'dashboard/revenue/deals?deal=a%2Fb');
  assert.deepEqual(first.latest().sources, { revenue: 'live', tasks: 'loading' });
  await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].url, '/api/hub/tasks');
  h.requests[1].resolve(tasks()); await tick();
});

test('tasks expire after one minute and revenue uses the shared five-minute window', async () => {
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve(revenue());
  h.requests[1].resolve(tasks({ tasks: [{ id: 'done', title: 'Done', done: true }, { id: 'open', title: 'Open' }] }));
  await tick();
  assert.deepEqual(first.latest().items.map((item) => item.label), ['Open']);
  h.advance(60_000); h.open(); await tick();
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].url, '/api/hub/tasks');
  h.requests[2].resolve(tasks()); await tick();
  h.advance(4 * 60_000); h.open(); await tick();
  assert.equal(h.requests.length, 5);
  h.requests[3].resolve(revenue()); h.requests[4].resolve(tasks()); await tick();
});

test('invalid payloads and HTTP failures cannot masquerade as empty live results', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve({ status: 'live' });
  h.requests[1].resolve(tasks(), false);
  await tick();
  t.mock.timers.tick(1200); await tick();
  h.requests[2].resolve({ status: 'live' }); await tick();
  assert.deepEqual(first.latest().sources, { revenue: 'error', tasks: 'error' });
});

test('a synchronous transport failure does not leave an in-flight entry that blocks retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const h = harness({ fetcher: () => { calls++; throw Error('transport unavailable'); } });
  const first = h.open(); await tick();
  t.mock.timers.tick(1200); await tick();
  assert.deepEqual(first.latest().sources, { revenue: 'error', tasks: 'error' });
  h.open(); await tick();
  t.mock.timers.tick(1200); await tick();
  assert.equal(calls, 6, 'revenue retries once per read; tasks remain independent');
});

test('late customer results cannot evict the selected task from the eight record limit', async () => {
  const h = harness(), opened = h.open();
  await tick();
  h.requests[1].resolve(tasks({ tasks: [{ id: 'selected-task', title: 'Match task' }] }));
  await tick();
  const selectedTask = opened.latest().items[0];
  const selectedKey = paletteItemKey(selectedTask);
  h.requests[0].resolve(revenue({ leads: Array.from({ length: 10 }, (_, i) => ({ id: `lead-${i}`, name: `Match lead ${i}` })) }));
  await tick();
  const matches = (item) => item.label.includes('Match');
  const visible = matchingPaletteRecords(opened.latest().items, matches, selectedKey);
  assert.equal(visible.length, 8);
  const selectedIndex = visible.findIndex((item) => paletteItemKey(item) === selectedKey);
  assert.notEqual(selectedIndex, -1);
  assert.equal(visible[selectedIndex].path, selectedTask.path, 'Enter still opens the explicitly selected task');
  assert.equal(matchingPaletteRecords(opened.latest().items, (item) => item.kind === '고객', selectedKey).some((item) => item.kind === '할 일'), false,
    'a selected item that no longer matches the query is not forced into results');
});

test('an unselected search stops inspecting records after the visible result limit', () => {
  let inspected = 0;
  const records = Array.from({ length: 1000 }, (_, id) => ({ kind: '할 일', path: `task-${id}`, label: 'Match' }));
  assert.equal(matchingPaletteRecords(records, () => { inspected++; return true; }, null).length, 8);
  assert.equal(inspected, 8);
});

test('a newer revenue page read replaces the palette cache after a save', async () => {
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve(revenue({ deals: [{ id: 'deal', name: 'Before save' }] }));
  h.requests[1].resolve(tasks());
  await tick();
  assert.equal(first.latest().items[0].label, 'Before save');
  const saved = h.cache.invalidate(); await tick();
  h.requests[2].resolve(revenue({ deals: [{ id: 'deal', name: 'After save' }] })); await saved;
  assert.equal(first.latest().items[0].label, 'After save', 'an already open palette also follows the page');
  assert.equal(h.open().latest().items[0].label, 'After save');
});

test('page and palette share an in-flight revenue read while tasks settle independently', async () => {
  const h = harness(), pageRead = h.cache.refresh(), palette = h.open();
  await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(h.cache.refresh(), pageRead);
  h.requests[0].resolve(revenue({ leads: [{ id: 'shared', name: 'Shared read' }] })); await pageRead;
  assert.equal(palette.latest().items[0].label, 'Shared read');
  assert.equal(palette.latest().sources.tasks, 'loading');
  h.requests[1].resolve(tasks()); await tick();
});

test('a late task read cannot restore revenue records cleared by post-save invalidation', async () => {
  const h = harness(), first = h.open(); await tick();
  h.requests[0].resolve(revenue({ leads: [{ id: 'old', name: 'Before save' }] })); await tick();
  const saved = h.cache.invalidate(); await tick();
  assert.deepEqual(first.latest().items, []);
  h.requests[2].resolve(revenue({ leads: [{ id: 'new', name: 'After save' }] })); await saved;
  h.requests[1].resolve(tasks({ tasks: [{ id: 'late', title: 'Late task' }] })); await tick();
  assert.deepEqual(first.latest().items.map((item) => item.label), ['After save', 'Late task']);
});

test('a stalled task body times out independently and cannot cache a late result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(), first = h.open(); await tick();
  let finishBody;
  h.requests[0].resolve(revenue({ deals: [{ id: 'ready', name: 'Ready deal' }] }));
  h.requests[1].respond({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
  await tick();
  t.mock.timers.tick(15_000); await tick();
  assert.equal(h.requests[1].signal.aborted, true);
  assert.deepEqual(first.latest().sources, { revenue: 'live', tasks: 'error' });
  assert.equal(first.latest().items[0].label, 'Ready deal');
  const reopened = h.open(); await tick();
  finishBody(tasks({ tasks: [{ id: 'stale', title: 'Stale task' }] })); await tick();
  assert.equal(reopened.latest().sources.tasks, 'loading');
  h.requests[2].resolve(tasks({ tasks: [{ id: 'fresh', title: 'Fresh task' }] })); await tick();
  assert.deepEqual(h.open().latest().items.map((item) => item.label), ['Ready deal', 'Fresh task']);
});
