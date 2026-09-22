import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommandPaletteRecordLoader, matchingPaletteRecords, paletteItemKey } from './command-palette-records.js';

const tick = () => new Promise(setImmediate);
const revenue = (values = {}) => ({ status: 'live', leads: [], deals: [], ...values });
const tasks = (values = {}) => ({ status: 'live', tasks: [], ...values });

function harness(options = {}) {
  const requests = [];
  let time = 1_000;
  const load = createCommandPaletteRecordLoader({
    readShared: () => null, now: () => time,
    fetcher: (url, options) => new Promise((resolve, reject) => requests.push({
      url, signal: options.signal,
      resolve: (data, ok = true) => resolve({ ok, json: async () => data }), reject,
    })),
    ...options,
  });
  function open() {
    const updates = [];
    const close = load((state) => updates.push(state));
    return { updates, close, latest: () => updates.at(-1) };
  }
  return { open, requests, advance: (ms) => { time += ms; } };
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

test('HTTP 200 error envelopes preserve the other source and retry without a 60 second empty cache', async () => {
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve({ status: 'error', leads: [], deals: [] });
  h.requests[1].resolve(tasks({ tasks: [{ id: 'a', title: 'Ready' }] }));
  await tick();
  assert.deepEqual(first.latest().sources, { revenue: 'error', tasks: 'live' });
  assert.equal(first.latest().items[0].label, 'Ready');
  const retry = h.open();
  await tick();
  assert.equal(h.requests.length, 3, 'only the failed source is fetched again');
  assert.equal(retry.latest().items[0].label, 'Ready');
  h.requests[2].resolve(revenue());
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
  h.requests[0].resolve(revenue({ status: 'preview', leads: [{ id: 'hidden', name: 'Hidden' }] }));
  h.requests[1].resolve({ status: 'preview' });
  await tick();
  assert.deepEqual(first.latest(), { items: [], sources: { revenue: 'preview', tasks: 'preview' } });
  h.open(); await tick();
  assert.equal(h.requests.length, 2);
});

test('a fresh Revenue page cache supplies customer and deal results before tasks settle', async () => {
  const h = harness({ readShared: () => ({
    syncState: 'live', ledger: revenue({ deals: [{ id: 'a/b', name: 'Cached deal' }] }),
  }) });
  const first = h.open();
  assert.equal(first.latest().items[0].path, 'dashboard/revenue/deals?deal=a%2Fb');
  assert.deepEqual(first.latest().sources, { revenue: 'live', tasks: 'loading' });
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/api/hub/tasks');
  h.requests[0].resolve(tasks()); await tick();
});

test('expired caches revalidate and completed tasks stay out of the search index', async () => {
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve(revenue());
  h.requests[1].resolve(tasks({ tasks: [{ id: 'done', title: 'Done', done: true }, { id: 'open', title: 'Open' }] }));
  await tick();
  assert.deepEqual(first.latest().items.map((item) => item.label), ['Open']);
  h.advance(60_000); h.open(); await tick();
  assert.equal(h.requests.length, 4);
  h.requests[2].resolve(revenue()); h.requests[3].resolve(tasks()); await tick();
});

test('invalid payloads and HTTP failures cannot masquerade as empty live results', async () => {
  const h = harness(), first = h.open();
  await tick();
  h.requests[0].resolve({ status: 'live' });
  h.requests[1].resolve(tasks(), false);
  await tick();
  assert.deepEqual(first.latest().sources, { revenue: 'error', tasks: 'error' });
});

test('a synchronous transport failure does not leave an in-flight entry that blocks retry', async () => {
  let calls = 0;
  const h = harness({ fetcher: () => { calls++; throw Error('transport unavailable'); } });
  const first = h.open(); await tick();
  assert.deepEqual(first.latest().sources, { revenue: 'error', tasks: 'error' });
  h.open(); await tick();
  assert.equal(calls, 4);
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
