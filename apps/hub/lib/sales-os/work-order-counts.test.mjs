import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const state = globalThis.__workOrderCountsTest = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '../server-read.js') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export const eqFilter = (value) => 'eq.' + value;
      export async function countSupabaseRows(table, filters) {
        globalThis.__workOrderCountsTest.calls.push({ table, filters });
        const status = filters.find(([key]) => key === 'status')?.[1]?.slice(3);
        return globalThis.__workOrderCountsTest.values[status];
      }
    `), shortCircuit: true,
  };
  if (specifier === '../server-write.js') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export const resolveDefaultWorkspaceId = () => 'workspace-1';
      export const resolveSupabaseConfig = () => globalThis.__workOrderCountsTest.configured ? {} : null;
    `), shortCircuit: true,
  };
  return next(specifier, context);
} });

const { getWorkOrderCounts } = await import('./work-order-counts.js');
beforeEach(() => {
  state.configured = true;
  state.calls = [];
  state.values = { proposed: 2, approved: 3, executing: 4, executed: 5, dismissed: 6 };
});

test('counts every proposal lifecycle status exactly and excludes inbox records in one workspace', async () => {
  const result = await getWorkOrderCounts({ workspaceId: 'workspace-2' });
  assert.equal(result.source, 'supabase');
  assert.deepEqual(result.counts, state.values);
  assert.equal(state.calls.length, 5);
  for (const call of state.calls) {
    assert.equal(call.table, 'work_orders');
    assert.deepEqual(call.filters.slice(0, 2), [['workspace_id', 'eq.workspace-2'], ['source', 'neq.inbox']]);
  }
});

test('a narrowed statuses list counts only those statuses (daily-brief only needs proposed)', async () => {
  const result = await getWorkOrderCounts({ workspaceId: 'workspace-2', statuses: ['proposed'] });
  assert.equal(result.source, 'supabase');
  assert.deepEqual(result.counts, { proposed: state.values.proposed });
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].table, 'work_orders');
  assert.deepEqual(state.calls[0].filters, [
    ['workspace_id', 'eq.workspace-2'], ['source', 'neq.inbox'], ['status', 'eq.proposed'],
  ]);
});

test('an empty or fully-unknown statuses list falls back to the default five', async () => {
  assert.equal((await getWorkOrderCounts({ statuses: [] })).source, 'supabase');
  assert.equal(state.calls.length, 5);
  state.calls = [];
  assert.equal((await getWorkOrderCounts({ statuses: ['bogus'] })).source, 'supabase');
  assert.equal(state.calls.length, 5);
});

test('unconfigured and failed counts stay distinct from a proven zero', async () => {
  state.configured = false;
  assert.deepEqual(await getWorkOrderCounts(), { source: 'preview', counts: null });
  assert.equal(state.calls.length, 0);
  state.configured = true;
  state.values.approved = null;
  assert.deepEqual(await getWorkOrderCounts(), { source: 'error', counts: null });
});
