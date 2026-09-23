import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = globalThis.__workOrdersRouteTest = {};
const stub = (code) => 'data:text/javascript,' + encodeURIComponent(code);
registerHooks({ resolve(specifier, context, next) {
  const stubs = {
    'next/server': `export class NextResponse extends Response { static json(value, init) { return Response.json(value, init); } }`,
    '@/lib/hub-write-guard': `
      export function assertHubWriteAllowed() { return globalThis.__workOrdersRouteTest.guard || null; }
      export async function readHubWriteJson(req) { return { data: await req.json() }; }
    `,
    '@/lib/sales-os/work-orders': `
      export async function getWorkOrders(options) { globalThis.__workOrdersRouteTest.options = options; return globalThis.__workOrdersRouteTest.orders; }
      export async function getQueueSummary() { return globalThis.__workOrdersRouteTest.legacySummary; }
      export async function decideWorkOrder() { return { persisted: true }; }
    `,
    '@/lib/sales-os/work-order-counts': `
      export async function getWorkOrderCounts() { globalThis.__workOrdersRouteTest.counted = true; return globalThis.__workOrdersRouteTest.summary; }
    `,
    '@/lib/server-write': `
      export const resolveDefaultWorkspaceId = () => 'workspace-1';
      export async function deleteSupabaseRecord(table, filters) {
        globalThis.__workOrdersRouteTest.deleted = { table, filters };
        if (globalThis.__workOrdersRouteTest.deleteThrows) throw new Error('private network detail');
        return globalThis.__workOrdersRouteTest.deleteResult;
      }
    `,
    '@/lib/server-read': `
      export const eqFilter = (value) => 'eq.' + value;
      export const inFilter = (values) => 'in.(' + values.join(',') + ')';
    `,
  };
  return stubs[specifier] ? { url: stub(stubs[specifier]), shortCircuit: true } : next(specifier, context);
} });
const { GET, DELETE } = await import('../app/api/hub/work-orders/route.js');

beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key];
  state.orders = { source: 'supabase', orders: [] };
  state.legacySummary = { source: 'supabase', pending: 99, counts: {} };
  state.summary = { source: 'supabase', counts: { proposed: 2, approved: 1, executing: 1, executed: 3, dismissed: 4 } };
  state.deleteResult = { persisted: true, records: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }] };
});

const get = (query = '') => GET(new Request('https://hub.test/api/hub/work-orders' + query));

test('proposal view defaults to pending, combines approved with executing, and all omits the status filter', async () => {
  await get('?scope=proposals');
  assert.deepEqual(state.options, { status: 'proposed', scope: 'proposals', limit: 100 });
  await get('?scope=proposals&status=approved');
  assert.deepEqual(state.options.status, ['approved', 'executing']);
  await get('?scope=proposals&status=all');
  assert.equal(state.options.status, null);
  assert.equal((await get('?status=bogus')).status, 400);
});

test('proposal summary uses exact counts and preserves failed reads', async () => {
  const live = await (await get('?summary=1&scope=proposals')).json();
  assert.equal(state.counted, true);
  assert.equal(live.pending, 2);
  assert.equal(live.counts.executing, 1);
  state.summary = { source: 'error', counts: null };
  const failed = await (await get('?summary=1&scope=proposals')).json();
  assert.equal(failed.status, 'error');
  assert.equal(failed.pending, null);
});

const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const remove = (ids) => DELETE(new Request('https://hub.test/api/hub/work-orders', {
  method: 'DELETE', body: JSON.stringify({ ids }),
}));

test('delete is guarded and validates a bounded UUID list before storage', async () => {
  state.guard = Response.json({ status: 'forbidden' }, { status: 403 });
  assert.equal((await remove([ID])).status, 403);
  assert.equal(state.deleted, undefined);
  state.guard = null;
  for (const ids of [[], ['not-a-uuid'], Array.from({ length: 51 }, () => ID), 'one']) {
    assert.equal((await remove(ids)).status, 400);
    assert.equal(state.deleted, undefined);
  }
});

test('delete affects only matching proposal rows in this workspace and reports actual IDs', async () => {
  const body = await (await remove([ID, OTHER_ID])).json();
  assert.deepEqual(body, { ok: true, status: 'ok', deletedIds: [ID] });
  assert.deepEqual(state.deleted, {
    table: 'work_orders',
    filters: [['id', `in.(${ID},${OTHER_ID})`], ['workspace_id', 'eq.workspace-1'], ['source', 'neq.inbox']],
  });
  const uppercase = await (await remove([ID.toUpperCase()])).json();
  assert.deepEqual(uppercase.deletedIds, [ID]);
  assert.equal(state.deleted.filters[0][1], `in.(${ID})`);
});

test('delete treats zero matching rows as success and preserves write failures', async () => {
  state.deleteResult = { persisted: false, reason: 'no-matching-row', records: [] };
  assert.deepEqual(await (await remove([ID])).json(), { ok: true, status: 'ok', deletedIds: [] });
  state.deleteResult = { persisted: false, reason: 'http-503' };
  assert.deepEqual(await (await remove([ID])).json(), { ok: false, status: 'error', reason: 'http-503' });
  state.deleteThrows = true;
  const thrown = await (await remove([ID])).json();
  assert.deepEqual(thrown, { ok: false, status: 'error', reason: 'work-order-delete-failed' });
});
