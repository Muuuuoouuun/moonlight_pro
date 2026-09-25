import { countSupabaseRows, eqFilter } from '../server-read.js';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '../server-write.js';

const STATUSES = ['proposed', 'approved', 'executing', 'executed', 'dismissed'];

export async function getWorkOrderCounts({ workspaceId = resolveDefaultWorkspaceId(), statuses = STATUSES } = {}) {
  if (!resolveSupabaseConfig() || !workspaceId) return { source: 'preview', counts: null };

  // Callers that only need one lifecycle count (e.g. daily-brief's approval-queue badge just
  // reads counts.proposed) pass a narrower `statuses` so we don't count all five every time.
  // An empty/unknown-only intersection falls back to the full set rather than counting nothing.
  const requestedStatuses = statuses.filter((status) => STATUSES.includes(status));
  const countedStatuses = requestedStatuses.length ? requestedStatuses : STATUSES;

  const values = await Promise.all(countedStatuses.map((status) =>
    countSupabaseRows('work_orders', [
      ['workspace_id', eqFilter(workspaceId)],
      ['source', 'neq.inbox'],
      ['status', eqFilter(status)],
    ]),
  ));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return { source: 'error', counts: null };
  }

  return { source: 'supabase', counts: Object.fromEntries(countedStatuses.map((status, index) => [status, values[index]])) };
}
