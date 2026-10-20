import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { listContentSchedules, setContentSchedule, cancelContentSchedule } from './content-schedules-ledger.js';
import { GET } from '../../app/api/hub/content/schedule/route.js';

const workspace = '11111111-1111-4111-8111-111111111111';
const contentId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-000000000000';
const otherId = '44444444-4444-4444-8444-444444444444';
const now = Date.parse('2026-10-19T00:00:00Z');
const originalFetch = globalThis.fetch;
const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID'];
const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let rows, calls, scheduleReply, variantFailure, variantReply;
const row = index => ({ workspace_id: workspace, content_id: contentId,
  variant_id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
  title: '', channel: 'threads', status: 'scheduled', revision: 1,
  scheduled_at: new Date(now + (index + 1) * 60000).toISOString() });
beforeEach(() => {
  Object.assign(process.env, { SUPABASE_URL: 'https://schedule-selection.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only', COM_MOON_DEFAULT_WORKSPACE_ID: workspace });
  rows = []; calls = []; scheduleReply = null; variantFailure = false; variantReply = null;
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    assert.equal(url.hostname, 'schedule-selection.invalid');
    const table = url.pathname.split('/').at(-1), method = options.method || 'GET';
    calls.push({ table, method, query: Object.fromEntries(url.searchParams) });
    if (table === 'content_variants') return variantFailure ? new Response('down', { status: 503 }) : Response.json(variantReply ?? []);
    assert.equal(table, 'content_schedules');
    if (scheduleReply && method === 'GET') return scheduleReply();
    const matches = record => [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'limit'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(record[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(record[key]));
      throw Error('unexpected filter');
    });
    const body = options.body ? JSON.parse(options.body) : null;
    if (method === 'POST') {
      if (rows.some(record => record.workspace_id === body.workspace_id && record.variant_id === body.variant_id)) return Response.json({ code: '23505' }, { status: 409 });
      rows.push(body); return Response.json([body], { status: 201 });
    }
    if (method === 'PATCH') { const hits = rows.filter(matches); hits.forEach(record => Object.assign(record, body)); return Response.json(hits); }
    assert.equal(method, 'GET');
    const selected = rows.filter(matches);
    if (url.searchParams.get('order') === 'scheduled_at.desc') selected.sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at));
    const limit = Number(url.searchParams.get('limit')); assert.ok(limit > 0 && limit <= 100, 'every read is bounded');
    return Response.json(selected.slice(0, limit));
  };
});
after(() => { globalThis.fetch = originalFetch; keys.forEach(key => env[key] === undefined ? delete process.env[key] : process.env[key] = env[key]); });
const read = (patch = {}) => listContentSchedules({ variantId, contentId, now, ...patch });

for (const count of [100, 101, 1000]) test(`selected reservation can be retimed and cancelled among ${count} rows`, async () => {
  rows = Array.from({ length: count }, (_, index) => row(index));
  const all = await listContentSchedules({ now });
  assert.equal(all.schedules.length, 100);
  assert.equal(all.schedules.some(record => record.variantId === variantId), count === 100);
  const exact = await read();
  assert.equal(exact.status, 'live');
  const selected = exact.schedules.find(record => record.variantId === variantId);
  assert.ok(selected, 'selected reservation must be available beyond the global list boundary');
  const moved = await setContentSchedule({ variantId, contentId, title: '', channel: 'threads', scheduledAt: new Date(now + 3600000).toISOString(), expectedRevision: selected.revision }, { now });
  assert.equal(moved.status, 'saved'); assert.equal(moved.schedule.revision, 2);
  const cancelled = await cancelContentSchedule({ variantId, expectedRevision: moved.schedule.revision }, { now });
  assert.equal(cancelled.status, 'saved'); assert.equal(cancelled.schedule.status, 'cancelled');
  assert.equal(rows.length, count);
});

test('exact query is bounded by server workspace and variant identity', async () => {
  rows = Array.from({ length: 101 }, (_, index) => row(index));
  const result = await read(); assert.equal(result.schedules.length, 1);
  const query = calls.filter(call => call.table === 'content_schedules').at(-1).query;
  assert.equal(query.variant_id, `eq.${variantId}`); assert.equal(query.workspace_id, `eq.${workspace}`); assert.equal(query.limit, '2');
});

for (const status of ['scheduled', 'missed', 'cancelled', 'published']) test(`exact selection retains ${status} history revision`, async () => {
  rows = [{ ...row(0), status, revision: 7 }];
  const result = await read({ scope: 'action' });
  assert.equal(result.status, 'live'); assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].revision, 7); assert.equal(result.schedules[0].status, status);
});

test('only a valid zero-row response means no reservation', async () => {
  assert.deepEqual(await read(), { status: 'live', schedules: [] });
  for (const malformed of [[{ ...row(0), revision: 0 }], [{ ...row(0), workspace_id: otherId }], [{ ...row(0), variant_id: otherId }], [{ ...row(0), content_id: otherId }], [row(0), row(0)], {}, null]) {
    scheduleReply = () => Response.json(malformed);
    const result = await read(); assert.equal(result.status, 'error', JSON.stringify(malformed)); assert.deepEqual(result.schedules, []);
  }
  scheduleReply = () => new Response('down', { status: 503 });
  assert.equal((await read()).status, 'error');
});

test('exact selection keeps publication verification and preview semantics', async () => {
  rows = [row(0)]; variantFailure = true;
  assert.equal((await read()).status, 'error');
  variantFailure = false; variantReply = {};
  assert.equal((await read()).status, 'error', 'malformed publication verification is not an empty success');
  variantReply = [{ id: variantId, status: 'published' }];
  assert.equal((await read()).schedules[0].state, 'published');
  scheduleReply = () => Response.json({ code: 'PGRST205' }, { status: 404 });
  assert.equal((await read()).status, 'preview');
  delete process.env.SUPABASE_URL;
  assert.equal((await read()).status, 'preview');
});

test('invalid or partial identity never falls back to the global list', async () => {
  for (const patch of [{ variantId: '' }, { variantId: 'nope' }, { contentId: '' }, { contentId: 'nope' }, { variantId: undefined }, { contentId: undefined }]) {
    assert.equal((await read(patch)).status, 'error');
  }
  assert.equal(calls.length, 0);
});

test('GET forwards exact selection and keeps HTTP200 error envelopes', async () => {
  rows = Array.from({ length: 101 }, (_, index) => row(index));
  const response = await GET(new Request(`https://hub.invalid/api/hub/content/schedule?variantId=${variantId}&contentId=${contentId}&workspaceId=${otherId}`));
  assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.schedules.length, 1); assert.equal(data.schedules[0].variantId, variantId);
  for (const suffix of ['?variantId=', `?variantId=${variantId}`, `?contentId=${contentId}`]) {
    const failed = await GET(new Request(`https://hub.invalid/api/hub/content/schedule${suffix}`));
    assert.equal(failed.status, 200); assert.equal((await failed.json()).status, 'error');
  }
});

test('concurrent change remains a conflict rather than an automatic overwrite', async () => {
  rows = [row(0)];
  const observed = await read(); rows[0].revision = 4;
  const result = await setContentSchedule({ variantId, contentId, channel: 'threads', scheduledAt: new Date(now + 3600000).toISOString(), expectedRevision: observed.schedules[0].revision }, { now });
  assert.equal(result.status, 'conflict'); assert.equal(rows[0].revision, 4);
  assert.equal((await read()).schedules[0].revision, 4);
});
