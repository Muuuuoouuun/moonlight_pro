import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchPullRequestPages } from './github-pr-pages.ts';
import { syncProjectPullRequestTasks } from './github-project-tasks.ts';

const repo = 'audit/synthetic';
const projectId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const now = '2026-10-19T08:00:00Z';
const pull = number => ({ number, title: `Boundary ${number}`, state: 'open' });
function pageSource(open, closed = [], failure) {
  const calls = [];
  return { calls, fetch: async path => {
    const query = new URL(`https://unit.test${path}`).searchParams;
    const state = query.get('state'), page = Number(query.get('page'));
    calls.push({ state, page });
    if (failure?.(state, page)) return { ok: false, status: 503, data: null, error: 'unavailable' };
    const rows = state === 'open' ? open : closed;
    return { ok: true, status: 200, data: rows.slice((page - 1) * 50, page * 50) };
  } };
}
function memoryStore() {
  let revision = 1, next = 0;
  let meta = { github: { repo }, keep: 'unrelated' };
  const tasks = new Map();
  const state = { tasks, failedNumbers: new Set(), failedReceipt: false, inserts: [], receipts: [],
    setHistory(value) { meta = { ...meta, github_imports: { [repo]: value } }; },
    get history() { return meta.github_imports?.[repo]; },
  };
  state.deps = {
    fetchRows: async (table, options) => table === 'projects'
      ? [{ id: projectId, status: 'active', updated_at: String(revision), meta: structuredClone(meta) }]
      : [...tasks.values()].filter(row => JSON.parse(options.filters[1][1]).includes(row.meta.github_pr.key)),
    fetchPulls: async () => ({ ok: true, status: 200, data: [] }),
    quotedIn: keys => JSON.stringify(keys),
    newId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++next).padStart(12, '0')}`,
    insert: async (_table, record) => {
      state.inserts.push(record.meta.github_pr.number);
      if (state.failedNumbers.has(record.meta.github_pr.number)) return { persisted: false };
      tasks.set(record.meta.github_pr.number, { ...record, updated_at: 'task-v1' });
      return { persisted: true };
    },
    update: async (table, filters, patch) => {
      if (table !== 'projects') return { persisted: true };
      state.receipts.push(patch);
      if (state.failedReceipt) return { persisted: false, reason: 'no-matching-row' };
      assert.equal(filters.at(-1)[1], `eq.${revision}`);
      assert.equal(patch.meta.keep, 'unrelated');
      meta = structuredClone(patch.meta); revision++;
      return { persisted: true };
    },
  };
  return state;
}
const sync = state => syncProjectPullRequestTasks({ workspaceId, now, deps: state.deps });

for (const count of [0, 49, 50, 51, 150]) {
  test(`all-page enumeration crosses the ${count}-PR boundary without loss`, async () => {
    const input = Array.from({ length: count }, (_, i) => pull(i + 1));
    const source = pageSource(input);
    const result = await fetchPullRequestPages(repo, source.fetch);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.map(row => row.number), input.map(row => row.number));
    assert.equal(source.calls.filter(row => row.state === 'open').length, Math.floor(count / 50) + 1);
  });
}
test('closed pages are also enumerated; a moved PR is deduplicated to the closed state', async () => {
  const closed = Array.from({ length: 51 }, (_, i) => ({ ...pull(i + 1), state: 'closed' }));
  const source = pageSource([pull(1)], closed);
  const result = await fetchPullRequestPages(repo, source.fetch);
  assert.equal(result.data.length, 51);
  assert.equal(result.data[0].state, 'closed');
  assert.ok(source.calls.some(row => row.state === 'closed' && row.page === 2));
});
test('a later page failure causes no writes; retry restarts and imports all 51 once', async () => {
  const rows = Array.from({ length: 51 }, (_, i) => pull(i + 1));
  let fail = true;
  const source = pageSource(rows, [], (state, page) => fail && state === 'open' && page === 2);
  const db = memoryStore();
  db.deps.fetchPulls = () => fetchPullRequestPages(repo, source.fetch);
  const failed = await sync(db);
  assert.equal(failed.status, 'error');
  assert.equal(db.inserts.length, 0);
  assert.equal(db.receipts.length, 0);
  fail = false;
  assert.equal((await sync(db)).repositories[0].created, 51);
  assert.equal(db.tasks.size, 51);
  assert.equal(db.history.numbers.length, 51);
  assert.equal((await sync(db)).repositories[0].created, 0);
});
test('a missed lower number from shifting pages is recovered while deleted imports stay deleted', async () => {
  const db = memoryStore();
  let rows = Array.from({ length: 50 }, (_, i) => pull(1051 - i));
  db.deps.fetchPulls = async () => ({ ok: true, status: 200, data: rows });
  await sync(db);
  db.tasks.delete(1050);
  rows = [pull(1001), ...rows];
  const result = await sync(db);
  assert.equal(result.repositories[0].created, 1);
  assert.ok(db.tasks.has(1001));
  assert.equal(db.tasks.has(1050), false);
});
test('a failed lower-number create retries after higher successes; their deleted task is not recreated', async () => {
  const db = memoryStore();
  db.failedNumbers.add(1);
  db.deps.fetchPulls = async () => ({ ok: true, status: 200, data: [pull(1), pull(100)] });
  assert.equal((await sync(db)).repositories[0].status, 'partial');
  assert.deepEqual(db.history.numbers, [100]);
  db.tasks.delete(100); db.failedNumbers.clear();
  assert.equal((await sync(db)).repositories[0].created, 1);
  assert.deepEqual(db.history.numbers, [1, 100]);
  assert.equal(db.tasks.has(100), false);
});
test('receipt revision/write failure is reported; retry finds the created task and records it without duplicating', async () => {
  const db = memoryStore(); db.failedReceipt = true;
  db.deps.fetchPulls = async () => ({ ok: true, status: 200, data: [pull(1)] });
  const failed = await sync(db);
  assert.equal(failed.repositories[0].error, 'import-receipt-write-failed');
  assert.equal(failed.repositories[0].status, 'partial');
  db.failedReceipt = false;
  assert.equal((await sync(db)).repositories[0].created, 0);
  assert.deepEqual(db.history.numbers, [1]);
  assert.deepEqual(db.inserts, [1]);
});
test('ambiguous numeric legacy history is explicit and makes no task or receipt writes', async () => {
  const db = memoryStore(); db.setHistory(1051);
  db.deps.fetchPulls = async () => ({ ok: true, status: 200, data: [pull(1001)] });
  const result = await sync(db);
  assert.equal(result.repositories[0].error, 'legacy-import-history-needs-review');
  assert.deepEqual(db.inserts, []);
  assert.deepEqual(db.receipts, []);
  assert.equal(db.history, 1051);
});
test('page cap, malformed rows, and network errors cannot masquerade as complete enumeration', async () => {
  const full = Array.from({ length: 50 }, (_, i) => pull(i + 1));
  assert.equal((await fetchPullRequestPages(repo, async () => ({ ok: true, status: 200, data: full }), 1)).error, 'pull-page-limit');
  assert.equal((await fetchPullRequestPages(repo, async () => ({ ok: true, status: 200, data: [{ number: -1 }] }))).error, 'invalid-pull-page');
  assert.equal((await fetchPullRequestPages(repo, async () => { throw new Error('offline'); })).error, 'pull-page-read-failed');
});
