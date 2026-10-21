import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { syncProjectPullRequestTasks, pullRequestMeta } from './github-project-tasks.ts';
import { fetchSupabaseRows, insertSupabaseRecord, updateSupabaseRecord, inFilterQuoted } from '../../../packages/supabase-rest/index.js';

const workspaceId = 'abcdefab-1234-4234-8234-abcdefabcdef';
const projectId = '11111111-1111-4111-8111-111111111111';
const now = '2026-10-19T15:00:00.000Z';
const repo = 'audit/identity';
const pull = { number: 7, title: 'Import concurrency', state: 'open' };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });

// The actual shared REST client runs against an intercepted transport. Only the
// existing tasks.id primary key and project revision CAS are enforced here;
// there is deliberately no artificial PR-key uniqueness or process mutex.
function store(t, { ws = workspaceId, repository = repo, project = projectId, number = 7,
  barrierReaders = 0, staleReads = 0, loseInsertReply = false, failReceipts = false, rows = [] } = {}) {
  const originalFetch = globalThis.fetch;
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://github-import.unit.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  });
  let revision = 1, reads = 0, release;
  let meta = { github: { repo: repository }, keep: 'operator-project-meta' };
  const tasks = new Map(rows.map(row => [row.id, structuredClone(row)]));
  const inserts = [], patches = [];
  const allRead = new Promise(resolve => { release = resolve; });
  const state = { tasks, inserts, patches, failReceipts,
    get history() { return meta.github_imports?.[repository.trim().toLowerCase()]; },
  };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://github-import.unit.invalid', 'never use an external transport');
    const table = url.pathname.split('/').at(-1);
    const method = options.method || 'GET';
    if (method === 'GET') {
      assert.equal(url.searchParams.get('workspace_id').toLowerCase(), `eq.${ws.toLowerCase()}`);
      if (table === 'projects') return response([{ id: project, workspace_id: ws, status: 'active', updated_at: String(revision), meta: structuredClone(meta) }]);
      assert.equal(table, 'tasks');
      const keys = JSON.parse(`[${url.searchParams.get('meta->github_pr->>key').slice(4, -1)}]`);
      const snapshot = ++reads <= staleReads ? [] : [...tasks.values()].filter(row => keys.includes(row.meta.github_pr.key));
      const result = structuredClone(snapshot);
      if (reads <= barrierReaders) {
        if (reads === barrierReaders) release();
        await allRead;
      }
      return response(result);
    }
    if (method === 'POST') {
      assert.equal(table, 'tasks');
      assert.equal(url.searchParams.has('on_conflict'), false);
      assert.doesNotMatch(options.headers.prefer, /merge-duplicates/);
      const record = JSON.parse(options.body);
      inserts.push(structuredClone(record));
      if (tasks.has(record.id)) return response({ code: '23505' }, 409);
      tasks.set(record.id, { ...record, updated_at: 'task-version-1' });
      if (loseInsertReply) { loseInsertReply = false; throw new Error('synthetic lost insert reply'); }
      return new Response(null, { status: 201 });
    }
    assert.equal(method, 'PATCH');
    const patch = JSON.parse(options.body);
    patches.push({ table, patch, filters: Object.fromEntries(url.searchParams) });
    if (table === 'tasks') {
      const row = tasks.get(url.searchParams.get('id').slice(3));
      if (!row || url.searchParams.get('updated_at') !== `eq.${row.updated_at}`) return response([]);
      Object.assign(row, patch);
      return response([{ id: row.id }]);
    }
    assert.equal(table, 'projects');
    if (state.failReceipts || url.searchParams.get('updated_at') !== `eq.${revision}`) return response([]);
    meta = structuredClone(patch.meta);
    revision++;
    return response([{ id: project }]);
  };
  state.sync = () => syncProjectPullRequestTasks({ workspaceId: ws, now, deps: {
    // Separate callers must not depend on a single process's GET dedup cache.
    fetchRows: (table, options) => fetchSupabaseRows(table, { ...options, dedupe: false }),
    fetchPulls: async () => ({ ok: true, status: 200, data: [{ ...pull, number }] }),
    insert: insertSupabaseRecord,
    update: (table, filters, patch) => updateSupabaseRecord(table, filters, patch, { returnRepresentation: true, select: 'id' }),
    newId: randomUUID,
    quotedIn: inFilterQuoted,
  } });
  return state;
}

test('two independent sync snapshots insert one PR task; conflict remains visible and retry recovers', async t => {
  const db = store(t, { barrierReaders: 2 });
  const results = await Promise.all([db.sync(), db.sync()]);
  assert.equal(db.tasks.size, 1, 'concurrent inserts must share the existing primary key');
  assert.equal(db.inserts.length, 2, 'both executions reached the insert boundary');
  assert.equal(results.reduce((sum, result) => sum + result.repositories[0].created, 0), 1);
  assert.ok(results.some(result => result.status === 'error'), 'a rejected write is not called successful');
  const row = [...db.tasks.values()][0];
  row.status = 'done';
  row.meta.checklist = [{ id: 'operator-item', done: true }];
  const retry = await db.sync();
  assert.equal(retry.status, 'synced');
  assert.equal(retry.repositories[0].created, 0);
  assert.equal(db.inserts.length, 2);
  assert.deepEqual(db.history.numbers, [7]);
  assert.equal(row.status, 'done');
  assert.deepEqual(row.meta.checklist, [{ id: 'operator-item', done: true }]);
});

test('lost insert reply plus a stale retry cannot duplicate; only a later observed row repairs the receipt', async t => {
  const db = store(t, { staleReads: 2, loseInsertReply: true, failReceipts: true });
  const first = await db.sync();
  const second = await db.sync();
  assert.equal(db.tasks.size, 1, 'retry after an uncertain create must reuse the creation identity');
  assert.equal(first.status, 'error');
  assert.equal(second.status, 'error');
  assert.equal(second.repositories[0].created, 0);
  assert.equal(db.history, undefined);
  db.failReceipts = false;
  const observed = await db.sync();
  assert.equal(observed.status, 'synced');
  assert.equal(observed.repositories[0].created, 0);
  assert.deepEqual(db.history.numbers, [7]);
  assert.equal(db.inserts.length, 2);
});

test('creation identity is stable across repo/workspace case and project remapping, but isolated by workspace, repo, and PR', async t => {
  const ids = [];
  for (const settings of [{}, { ws: workspaceId.toUpperCase(), repository: 'AUDIT/IDENTITY', project: '22222222-2222-4222-8222-222222222222' },
    { ws: 'abcdefab-1234-4234-8234-abcdefabcdee' }, { repository: 'audit/another' }, { number: 8 }]) {
    await t.test(JSON.stringify(settings), async child => {
      const db = store(child, settings);
      assert.equal((await db.sync()).status, 'synced');
      ids.push(db.inserts[0].id);
    });
  }
  assert.equal(ids[0], ids[1], 'mapping/case changes do not define a new PR');
  assert.equal(new Set([ids[0], ...ids.slice(2)]).size, 4);
  assert.match(ids[0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('legacy random-ID tasks remain canonical and their confirmed deletion receipts suppress reimport', async t => {
  const legacy = { id: randomUUID(), workspace_id: workspaceId, project_id: projectId, status: 'done', updated_at: 'task-version-1',
    meta: { source: 'github', keep: 'operator-task-meta', github_pr: pullRequestMeta(repo, pull, now) } };
  const db = store(t, { rows: [legacy] });
  assert.equal((await db.sync()).status, 'synced');
  assert.equal(db.inserts.length, 0);
  assert.deepEqual(db.tasks.get(legacy.id), legacy);
  assert.deepEqual(db.history.numbers, [7]);
  db.tasks.delete(legacy.id);
  assert.equal((await db.sync()).status, 'synced');
  assert.equal(db.tasks.size, 0);
  assert.equal(db.inserts.length, 0);
});

test('a primary-key conflict alone neither overwrites a row nor proves this PR was imported', async t => {
  const db = store(t);
  assert.equal((await db.sync()).status, 'synced');
  const id = db.inserts[0].id;
  // A separate database snapshot has an unrelated record occupying that ID.
  await t.test('unrelated collision', async child => {
    const row = { id, workspace_id: workspaceId, project_id: projectId, status: 'done',
      meta: { source: 'manual', github_pr: { key: 'audit/unrelated#1' }, keep: 'operator-text' } };
    const collision = store(child, { rows: [row] });
    const result = await collision.sync();
    assert.equal(result.status, 'error');
    assert.equal(result.repositories[0].created, 0);
    assert.deepEqual(collision.tasks.get(id), row);
    assert.deepEqual(collision.history.numbers, []);
  });
});
