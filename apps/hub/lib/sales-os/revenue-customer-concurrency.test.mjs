import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { buildLeadWrite, buildAccountWrite, buildCaseWrite, persistRevenueRecord } from './revenue-write.js';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
const routes = {
  leads: (await import('../../app/api/hub/revenue/lead/route.js')).POST,
  customer_accounts: (await import('../../app/api/hub/revenue/account/route.js')).POST,
  operation_cases: (await import('../../app/api/hub/revenue/case/route.js')).POST,
};
const id = '00000000-0000-4000-8000-000000000002';
const workspace = '00000000-0000-4000-8000-000000000001';
const cases = [
  ['leads', buildLeadWrite, { region: 'Seoul' }, { situation: 'Follow up tomorrow' }, 'region', 'situation'],
  ['customer_accounts', buildAccountWrite, { region: 'Seoul' }, { note: 'Conversation note' }, 'region', 'note'],
  ['operation_cases', buildCaseWrite, { account: 'Linked account' }, { workspace: 'classin' }, 'account_label', 'workspace'],
];

// Only REST is simulated. Both requests read the same snapshot; compare filters
// are checked atomically immediately before each PATCH changes the current row.
function transport(t, table, { meta = { original: 'retained' }, readRows, holdReads = false, beforePatch } = {}) {
  const originalFetch = globalThis.fetch;
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID', 'COM_MOON_HUB_WRITE_SECRET'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SUPABASE_URL = 'https://synthetic.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspace;
  process.env.COM_MOON_HUB_WRITE_SECRET = 'synthetic-route-secret';
  let row = { id, workspace_id: workspace, meta };
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const calls = [];
  const response = value => ({ ok: true, status: 200, json: async () => structuredClone(value), text: async () => JSON.stringify(value), headers: { get: () => null } });
  t.after(() => {
    release(); globalThis.fetch = originalFetch;
    for (const key of keys) old[key] === undefined ? delete process.env[key] : process.env[key] = old[key];
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)), method = init.method || 'GET';
    assert.equal(url.origin, 'https://synthetic.invalid');
    assert.equal(url.pathname, `/rest/v1/${table}`);
    assert.equal(url.searchParams.get('id'), `eq.${id}`);
    assert.equal(url.searchParams.get('workspace_id'), `eq.${workspace}`);
    calls.push({ method, url });
    if (method === 'GET') {
      const snapshot = structuredClone(readRows === undefined ? [row] : readRows);
      if (holdReads) await barrier;
      return response(snapshot);
    }
    assert.equal(method, 'PATCH');
    if (beforePatch) { row = beforePatch(row); beforePatch = null; }
    const filter = url.searchParams.get('meta');
    assert.ok(filter, 'all merged metadata must carry a CAS predicate');
    if (!row || (filter === 'is.null' ? row.meta !== null : !isDeepStrictEqual(row.meta, JSON.parse(filter.slice(3))))) return response([]);
    row = { ...row, ...JSON.parse(init.body) };
    return response([row]);
  };
  return { calls, release, row: () => row };
}

for (const [table, build, left, right, leftKey, rightKey] of cases) {
  const save = payload => persistRevenueRecord({ table, op: 'update', id, payload, build });
  test(`${table}: overlapping metadata writes conflict and explicit retry preserves both edits`, async t => {
    const io = transport(t, table, { holdReads: true });
    const pending = [save(left), save(right)];
    await new Promise(setImmediate);
    assert.equal(io.calls.filter(call => call.method === 'PATCH').length, 0);
    io.release();
    const results = await Promise.all(pending);
    assert.deepEqual(results.map(result => result.status).sort(), ['conflict', 'saved']);
    assert.equal(results.find(result => result.status === 'conflict').reason, 'concurrent-record-change');
    const loser = results[0].status === 'conflict' ? left : right;
    assert.equal((await save(loser)).status, 'saved');
    assert.ok(io.row().meta[leftKey]); assert.ok(io.row().meta[rightKey]);
    assert.equal(io.row().meta.original, 'retained');
    assert.equal(io.calls.filter(call => call.method === 'PATCH').length, 3, 'no automatic hidden retries');
  });
  for (const meta of [null, {}, { punctuation: '합성 ,.:*() " \\ & + %', nested: { empty: null } }]) test(`${table}: CAS compares actual ${JSON.stringify(meta)} snapshot`, async t => {
    const io = transport(t, table, { meta });
    assert.equal((await save(left)).status, 'saved');
    const filter = io.calls.find(call => call.method === 'PATCH').url.searchParams.get('meta');
    assert.equal(filter, meta === null ? 'is.null' : `eq.${JSON.stringify(meta)}`);
  });
  for (const readRows of [[], [{}], [{ meta: [] }], [{ meta: 'invalid' }]]) test(`${table}: malformed metadata read blocks mutation ${JSON.stringify(readRows)}`, async t => {
    const io = transport(t, table, { readRows });
    assert.equal((await save(left)).status, 'failed');
    assert.equal(io.calls.filter(call => call.method === 'PATCH').length, 0);
  });
  test(`${table}: HTTP route exposes conflict as 409 and keeps unauthorized writes blocked`, async t => {
    const io = transport(t, table, { beforePatch: row => ({ ...row, meta: { ...row.meta, concurrent: true } }) });
    const request = authorized => new Request('https://synthetic.invalid/api/hub/revenue/test', { method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorized ? { 'x-com-moon-hub-write-secret': 'synthetic-route-secret' } : {}) },
      body: JSON.stringify({ op: 'update', id, ...left }) });
    assert.equal((await routes[table](request(false))).status, 401); assert.equal(io.calls.length, 0);
    const result = await routes[table](request(true));
    assert.equal(result.status, 409); assert.equal((await result.json()).status, 'conflict');
    assert.equal(io.row().meta.concurrent, true); assert.equal(io.row().meta[leftKey], undefined);
  });
}
