import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { buildDealWrite, persistRevenueRecord } from './revenue-write.js';

const id = '00000000-0000-0000-0000-000000000002';
const workspace = '00000000-0000-0000-0000-000000000001';
const payments = [{ id: 'synthetic-payment', expectedAmount: 100000, expectedAt: '2026-10-20' }];
const recurring = { amount: 200000, day: 25, startMonth: '2026-10', endMonth: null };
const save = payload => persistRevenueRecord({ table: 'deals', op: 'update', id, payload, build: buildDealWrite });
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
const { POST } = await import('../../app/api/hub/revenue/deal/route.js');

// Only the REST/database boundary is simulated. The real persistence helper and
// shared URL/response adapter run unchanged. Predicates are checked atomically
// against the current synthetic row, just before applying each PATCH.
function transport(t, { meta = { stage_detail: 'quote', payments: [] }, stage = 'proposal', holdReads = false, beforePatch, readRows, readFails = false } = {}) {
  const originalFetch = globalThis.fetch;
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID', 'COM_MOON_HUB_WRITE_SECRET'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SUPABASE_URL = 'https://synthetic.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspace;
  process.env.COM_MOON_HUB_WRITE_SECRET = 'synthetic-route-secret';
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  t.after(() => {
    release();
    globalThis.fetch = originalFetch;
    for (const key of keys) old[key] === undefined ? delete process.env[key] : process.env[key] = old[key];
  });
  let row = { id, workspace_id: workspace, stage, meta };
  const calls = [];
  let changed = false;
  const response = (value, status = 200) => ({ ok: status === 200, status, json: async () => structuredClone(value), text: async () => JSON.stringify(value), headers: { get: () => null } });
  const matches = (value, filter) => {
    if (filter === null) return true; // exposes the old unguarded write
    if (filter === 'is.null') return value === null;
    assert.ok(filter.startsWith('eq.'));
    const literal = filter.slice(3);
    return isDeepStrictEqual(value, JSON.parse(literal));
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://synthetic.invalid');
    assert.equal(url.pathname, '/rest/v1/deals');
    assert.equal(url.searchParams.get('id'), `eq.${id}`);
    assert.equal(url.searchParams.get('workspace_id'), `eq.${workspace}`);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url: url.href, body });
    if (method === 'GET') {
      const snapshot = structuredClone(readRows === undefined ? [row] : readRows);
      if (holdReads) await barrier;
      return response(snapshot, readFails ? 503 : 200);
    }
    assert.equal(method, 'PATCH');
    if (beforePatch && !changed) { changed = true; row = beforePatch(row); }
    const stageFilter = url.searchParams.get('stage');
    const stageMatches = stageFilter === null || (stageFilter === 'is.null' ? row?.stage === null : row?.stage === stageFilter.slice(3));
    if (!row || !matches(row.meta, url.searchParams.get('meta')) || !stageMatches) return response([]);
    row = { ...row, ...structuredClone(body) };
    return response([row]);
  };
  return { row: () => row, calls, release };
}

test('sequential deal changes preserve payment and recurring siblings', async t => {
  const io = transport(t);
  assert.equal((await save({ payments })).status, 'saved');
  assert.equal((await save({ recurring })).status, 'saved');
  assert.equal(io.row().meta.payments.length, 1);
  assert.equal(io.row().meta.recurring.amount, 200000);
});

test('overlapping deal meta writes conflict without loss; explicit retry reads and preserves the winner', { timeout: 3000 }, async t => {
  const io = transport(t, { holdReads: true });
  const pending = [save({ payments }), save({ recurring })];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(io.calls.filter(call => call.method === 'PATCH').length, 0);
  io.release();
  const results = await Promise.all(pending);
  assert.deepEqual(results.map(result => result.status).sort(), ['conflict', 'saved']);
  assert.equal(results.find(result => result.status === 'conflict').reason, 'concurrent-deal-change');
  const loser = results[0].status === 'conflict' ? { payments } : { recurring };
  const readsBeforeRetry = io.calls.filter(call => call.method === 'GET').length;
  assert.equal((await save(loser)).status, 'saved');
  assert.ok(io.calls.filter(call => call.method === 'GET').length > readsBeforeRetry);
  assert.equal(io.row().meta.payments.length, 1);
  assert.equal(io.row().meta.recurring.amount, 200000);
  assert.equal(io.calls.filter(call => call.method === 'PATCH').length, 3, 'no hidden automatic retry');
});

test('deal CAS preserves encoded JSON punctuation, quotes, backslashes and nested null', async t => {
  const meta = { text: '합성 ,.:*() " \\ & + %', nested: { empty: null }, payments: [] };
  const io = transport(t, { meta });
  assert.equal((await save({ recurring })).status, 'saved');
  const patch = io.calls.find(call => call.method === 'PATCH');
  const literal = new URL(patch.url).searchParams.get('meta').slice(3);
  assert.deepEqual(JSON.parse(literal), meta);
  assert.equal(new URL(patch.url).searchParams.get('stage'), 'eq.proposal');
  assert.equal(io.row().meta.text, meta.text);
  assert.equal(io.row().meta.nested.empty, null);
});

for (const meta of [null, {}]) test(`deal CAS distinguishes ${meta === null ? 'SQL NULL' : 'empty object'}`, async t => {
  const io = transport(t, { meta, stage: null });
  assert.equal((await save({ recurring })).status, 'saved');
  const url = new URL(io.calls.find(call => call.method === 'PATCH').url);
  assert.equal(url.searchParams.get('meta'), meta === null ? 'is.null' : 'eq.{}');
  assert.equal(url.searchParams.get('stage'), 'is.null');
});

test('stage-only concurrent changes prevent a stale won_at calculation', async t => {
  const io = transport(t, { meta: {}, beforePatch: row => ({ ...row, stage: 'won', won_at: '2026-10-01T00:00:00Z' }) });
  const result = await save({ stage: 'closing' });
  assert.equal(result.status, 'conflict');
  assert.equal(io.row().won_at, '2026-10-01T00:00:00Z');
});

for (const [label, options] of [
  ['missing row', { readRows: [] }],
  ['missing meta', { readRows: [{ stage: 'proposal' }] }],
  ['missing stage', { readRows: [{ meta: {} }] }],
  ['array meta', { readRows: [{ meta: [], stage: 'proposal' }] }],
  ['read failure', { readFails: true }],
]) test(`deal CAS refuses ${label} before mutation`, async t => {
  const io = transport(t, options);
  assert.equal((await save({ recurring })).status, 'failed');
  assert.equal(io.calls.filter(call => call.method === 'PATCH').length, 0);
});

test('zero-row PATCH after concurrent deletion never reports saved', async t => {
  const io = transport(t, { beforePatch: () => null });
  assert.equal((await save({ recurring })).status, 'conflict');
  assert.equal(io.row(), null);
});

test('the actual deal route returns 409 for CAS conflict and still rejects unauthorized writes', async t => {
  const io = transport(t, { beforePatch: row => ({ ...row, meta: { ...row.meta, sibling: 'concurrent' } }) });
  const request = authorized => new Request('https://synthetic.invalid/api/hub/revenue/deal', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { 'x-com-moon-hub-write-secret': 'synthetic-route-secret' } : {}) },
    body: JSON.stringify({ id, op: 'update', recurring }),
  });
  const denied = await POST(request(false));
  assert.equal(denied.status, 401);
  assert.equal(io.calls.length, 0);
  const result = await POST(request(true));
  assert.equal(result.status, 409);
  assert.equal((await result.json()).status, 'conflict');
  assert.equal(io.row().meta.sibling, 'concurrent');
  assert.equal(io.row().meta.recurring, undefined);
});
