import { countSupabaseRows, eqFilter } from '../server-read.js';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '../server-write.js';

const STATUSES = ['proposed', 'approved', 'executing', 'executed', 'dismissed'];

export async function getWorkOrderCounts({ workspaceId = resolveDefaultWorkspaceId() } = {}) {
  if (!resolveSupabaseConfig() || !workspaceId) return { source: 'preview', counts: null };

  const values = await Promise.all(STATUSES.map((status) =>
    countSupabaseRows('work_orders', [
      ['workspace_id', eqFilter(workspaceId)],
      ['source', 'neq.inbox'],
      ['status', eqFilter(status)],
    ]),
  ));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return { source: 'error', counts: null };
  }

  return { source: 'supabase', counts: Object.fromEntries(STATUSES.map((status, index) => [status, values[index]])) };
}
