import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncProjectPullRequestTasks } from './github-project-tasks.ts';

const workspaceId = '33333333-3333-4333-8333-333333333333';
const projectId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const repos = ['audit/first', 'audit/second', 'audit/third'];
const now = '2026-10-19T10:00:00.000Z';

function sharedProjectStore({ repositoryCount = 2, refreshResult, loseFirstReceiptResponse = false } = {}) {
  let revision = 1, nextId = 0;
  let meta = { keep: 'unrelated-project-metadata' };
  const tasks = new Map();
  const calls = { inserts: [], receipts: [], refreshes: [], pulls: [] };
  const project = () => ({
    id: projectId, workspace_id: workspaceId, product_id: productId,
    status: 'active', updated_at: String(revision), meta: structuredClone(meta),
  });
  const deps = {
    fetchRows: async (table, options) => {
      if (table === 'projects') {
        if (options.filters.some(([column]) => column === 'id')) {
          calls.refreshes.push(options);
          assert.deepEqual(options.filters, [['workspace_id', `eq.${workspaceId}`], ['id', `eq.${projectId}`]]);
          assert.equal(options.select, '*');
          assert.equal(options.limit, 2);
          return refreshResult ? refreshResult(project()) : [project()];
        }
        return [project()];
      }
      assert.equal(table, 'tasks');
      const keys = JSON.parse(options.filters[1][1]);
      return [...tasks.values()].filter(row => keys.includes(row.meta.github_pr.key));
    },
    fetchPulls: async repo => {
      calls.pulls.push(repo);
      return { ok: true, status: 200, data: [{ number: 1, title: 'Receipt regression', state: 'open' }] };
    },
    quotedIn: values => JSON.stringify(values),
    newId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++nextId).padStart(12, '0')}`,
    insert: async (table, record) => {
      assert.equal(table, 'tasks');
      const key = record.meta.github_pr.key;
      calls.inserts.push(key);
      tasks.set(key, { ...record, updated_at: 'task-revision' });
      return { persisted: true };
    },
    update: async (table, filters, patch) => {
      assert.equal(table, 'projects');
      const expected = filters.find(([column]) => column === 'updated_at')[1];
      calls.receipts.push({ expected, actual: `eq.${revision}`, patch: structuredClone(patch) });
      // Match the DB's updated_at trigger and the real REST client's empty PATCH result.
      if (expected !== `eq.${revision}`) return { persisted: false, reason: 'no-matching-row' };
      meta = structuredClone(patch.meta);
      revision++;
      if (loseFirstReceiptResponse && calls.receipts.length === 1) {
        return { persisted: false, reason: 'network-error' };
      }
      return { persisted: true };
    },
  };
  return {
    calls, tasks,
    get meta() { return structuredClone(meta); },
    sync: () => syncProjectPullRequestTasks({
      workspaceId, now, deps,
      productRepositories: repos.slice(0, repositoryCount).map(full_name => ({ full_name, product_id: productId, status: 'connected' })),
    }),
  };
}

test('repositories sharing one project store both receipts and preserve later task deletion', async () => {
  const db = sharedProjectStore();
  const first = await db.sync();
  assert.equal(first.status, 'synced');
  assert.deepEqual(first.repositories.map(row => row.created), [1, 1]);
  assert.deepEqual(db.meta, {
    keep: 'unrelated-project-metadata',
    github_imports: {
      [repos[0]]: { version: 2, numbers: [1] },
      [repos[1]]: { version: 2, numbers: [1] },
    },
  });
  assert.deepEqual(db.calls.receipts.map(row => row.expected), ['eq.1', 'eq.2']);
  assert.equal(db.calls.refreshes.length, 1);

  db.tasks.delete(`${repos[1]}#1`);
  const second = await db.sync();
  assert.equal(second.status, 'synced');
  assert.deepEqual(second.repositories.map(row => row.created), [0, 0]);
  assert.equal(db.tasks.has(`${repos[1]}#1`), false);
  assert.deepEqual(db.calls.inserts, [`${repos[0]}#1`, `${repos[1]}#1`]);
  assert.equal(db.calls.refreshes.length, 1, 'unchanged histories need no extra refresh');
});

for (const [label, refreshResult] of [
  ['failed', () => null],
  ['missing', () => []],
  ['ambiguous', row => [row, structuredClone(row)]],
  ['unversioned', row => [{ ...row, updated_at: '' }]],
  ['wrong project', row => [{ ...row, id: 'different-project' }]],
]) {
  test(`${label} project refresh blocks every remaining shared-project target before writes`, async () => {
    const db = sharedProjectStore({ repositoryCount: 3, refreshResult });
    const result = await db.sync();
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.repositories.slice(1).map(row => row.error), ['project-refresh-failed', 'project-refresh-failed']);
    assert.deepEqual(result.repositories.slice(1).map(row => [row.created, row.updated]), [[0, 0], [0, 0]]);
    assert.deepEqual(db.calls.inserts, [`${repos[0]}#1`]);
    assert.equal(db.calls.receipts.length, 1);
    assert.equal(db.calls.refreshes.length, 2, 'a failed refresh must not make the stale snapshot reusable');
    assert.deepEqual(db.calls.pulls, [repos[0]]);
    assert.deepEqual(Object.keys(db.meta.github_imports), [repos[0]]);
  });
}

test('a lost receipt response also refreshes before the next repo while retaining the earlier failure', async () => {
  const db = sharedProjectStore({ loseFirstReceiptResponse: true });
  const result = await db.sync();
  assert.equal(result.status, 'partial');
  assert.equal(result.repositories[0].error, 'import-receipt-write-failed');
  assert.equal(result.repositories[1].status, 'synced');
  assert.equal(db.calls.refreshes.length, 1);
  assert.deepEqual(Object.keys(db.meta.github_imports), repos.slice(0, 2));
  assert.deepEqual(db.calls.receipts.map(row => row.expected), ['eq.1', 'eq.2']);
});
