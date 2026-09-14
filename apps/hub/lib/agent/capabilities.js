import { fetchSupabaseRowsDetailed, resolveSupabaseConfig } from '@com-moon/supabase-rest';
import { AGENT_SCHEMA_VERSION, AGENT_SCOPES, AGENT_RESPONSE_LIMITS, isAgentUuid } from '@com-moon/agent-contracts';
import { getAgentWorkerAvailability } from './jobs.js';

const ACTION_SCOPES = {
  create_task: 'tasks:write', update_task: 'tasks:write', complete_task: 'tasks:write',
  record_contact_outcome: 'contact-outcomes:write',
};
const unknownExecutor = (reason) => ({ executorOnline: null, lastHeartbeatAt: null, leaseExpiresAt: null, reason });

function probeState(results) {
  const reachable = results.some((result) => !result.error || result.error.status !== null);
  const denied = results.some((result) => [401, 403].includes(result.error?.status));
  return { configured: true, reachable, authenticated: denied ? false : results.every((result) => !result.error) ? true : null };
}

export async function getAgentCapabilities(context) {
  if (!isAgentUuid(context?.workspaceId) || typeof context.actorId !== 'string' || !context.actorId || !Array.isArray(context.scopes) || !context.scopes.includes('read') || context.scopes.some((scope) => !AGENT_SCOPES.includes(scope))) {
    return { httpStatus: 403, data: { status: 'error', error: 'agent-scope-denied', code: 'agent-scope-denied', retryable: false } };
  }
  const config = resolveSupabaseConfig();
  const engineConfigured = Boolean(process.env.COM_MOON_ENGINE_URL?.trim() && process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() && process.env.COM_MOON_HUB_WRITE_SECRET?.trim());
  const scopes = [...new Set(context.scopes)].sort();
  const actions = Object.entries(ACTION_SCOPES).filter(([, scope]) => scopes.includes(scope)).map(([action]) => action);
  const data = {
    configured: Boolean(config), reachable: true, authenticated: true, canRead: false,
    canWrite: actions.length && config && engineConfigured ? null : false,
    permissions: { scopes, actions }, writeVerification: 'receipt-required',
    persistence: { verified: false, evidence: 'Only a persisted command receipt proves a write.' },
    connections: {
      database: { configured: Boolean(config), reachable: null, authenticated: null },
      engine: { configured: engineConfigured, reachable: null, authenticated: null },
    },
    executor: unknownExecutor('scope-not-granted'),
    limits: { defaultRows: 20, maxRows: 100, responseBytes: AGENT_RESPONSE_LIMITS, cacheTtlSeconds: 15 },
    resources: ['tasks', 'projects', 'followups', 'work-orders'],
  };
  let failedSources = [];
  let status = config ? 'live' : 'preview';
  if (config) {
    const [workspace, tasks] = await Promise.all([
      fetchSupabaseRowsDetailed('workspaces', { select: 'id', filters: [['id', `eq.${context.workspaceId}`]], limit: 1, strictRows: true, dedupe: false }),
      fetchSupabaseRowsDetailed('tasks', { select: 'id', filters: [['workspace_id', `eq.${context.workspaceId}`]], limit: 1, strictRows: true, dedupe: false }),
    ]);
    data.connections.database = probeState([workspace, tasks]);
    if (workspace.error || workspace.rows?.length !== 1 || workspace.rows[0].id !== context.workspaceId) failedSources.push('workspaces');
    if (tasks.error || !Array.isArray(tasks.rows)) failedSources.push('tasks');
    data.canRead = failedSources.length === 0;
    if (!data.canRead) status = 'error';
    if (scopes.includes('jobs:read') || scopes.includes('jobs:write')) {
      const worker = await getAgentWorkerAvailability(context);
      data.executor = {
        executorOnline: typeof worker?.executorOnline === 'boolean' ? worker.executorOnline : null,
        lastHeartbeatAt: typeof worker?.lastHeartbeatAt === 'string' && worker.lastHeartbeatAt.length <= 40 ? worker.lastHeartbeatAt : null,
        leaseExpiresAt: typeof worker?.leaseExpiresAt === 'string' && worker.leaseExpiresAt.length <= 40 ? worker.leaseExpiresAt : null,
        ...(worker?.status !== 'live' ? { reason: 'availability-unavailable' } : {}),
      };
      if (worker?.status !== 'live') { failedSources.push('agent_jobs'); if (status === 'live') status = 'partial'; }
    }
  } else if (scopes.includes('jobs:read') || scopes.includes('jobs:write')) data.executor = unknownExecutor('missing-config');
  return {
    httpStatus: 200,
    data: {
      schemaVersion: AGENT_SCHEMA_VERSION, status, source: status === 'preview' ? 'preview' : status === 'error' ? 'error' : 'supabase',
      asOf: new Date().toISOString(), data, page: { returnedCount: 1, hasMore: false, nextCursor: null, totalCount: null },
      partial: status === 'partial', failedSources, truncated: false,
      ...(status === 'error' ? { error: 'agent-read-probe-failed', retryable: true } : {}),
    },
  };
}
