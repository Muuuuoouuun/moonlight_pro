import { invokeSupabaseRpc } from '@com-moon/supabase-rest';
import { UUID, normalizeJobInput, publicProjects, readProjects, jobHttpStatus } from '../../../../packages/codex-worker/contracts.mjs';

const fail = (httpStatus, error) => ({ httpStatus, data: { status: 'error', error, code: error, retryable: false } });
function authorized(context, scope) { return UUID.test(context?.workspaceId || '') && typeof context?.actorId === 'string' && context.actorId.length > 0 && context.actorId.length <= 128 && (context.scopes instanceof Set ? context.scopes.has(scope) : context.scopes?.includes(scope)); }

export async function getAgentWorkerAvailability(context, { rpc = invokeSupabaseRpc } = {}) {
  if (!authorized(context, 'jobs:read') && !authorized(context, 'jobs:write')) return { status: 'error', executorOnline: null, lastHeartbeatAt: null, leaseExpiresAt: null, reason: 'insufficient-scope' };
  try {
    const result = await rpc('agent_jobs_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId, p_action: 'availability', p_input: {} });
    if (!result.ok) return { status: result.error === 'missing-config' ? 'preview' : 'error', executorOnline: null, lastHeartbeatAt: null, leaseExpiresAt: null, reason: result.error === 'missing-config' ? 'missing-config' : 'availability-unavailable' };
    return result.data;
  } catch { return { status: 'error', executorOnline: null, lastHeartbeatAt: null, leaseExpiresAt: null, reason: 'availability-unavailable' }; }
}

export async function handleAgentJob(action, input, context, { env = process.env, rpc = invokeSupabaseRpc } = {}) {
  const scope = ['submit', 'cancel', 'resume'].includes(action) ? 'jobs:write' : 'jobs:read';
  if (!authorized(context, scope)) return fail(403, 'insufficient-scope');
  let normalized, projects;
  try { projects = readProjects(env.COM_MOON_CODEX_PROJECTS_JSON); normalized = normalizeJobInput(action, input, projects); }
  catch (error) { return fail(400, error.message || 'invalid-input'); }
  if (action === 'projects') return { httpStatus: 200, data: { status: 'live', projects: publicProjects(projects), availability: await getAgentWorkerAvailability(context, { rpc }) } };
  try {
    const result = await rpc('agent_jobs_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId, p_action: action, p_input: normalized });
    if (!result.ok) {
      if (result.error === 'missing-config') return { httpStatus: 200, data: { status: 'preview', persisted: false, reason: 'missing-config', job: null, jobs: [], events: [] } };
      return { httpStatus: 502, data: { status: 'error', code: 'job-storage-unavailable', error: 'Job storage unavailable', retryable: true } };
    }
    if (!result.data || typeof result.data.status !== 'string') return fail(502, 'invalid-job-response');
    return { httpStatus: jobHttpStatus(result.data), data: result.data };
  } catch { return { httpStatus: 502, data: { status: 'error', code: 'job-storage-unavailable', error: 'Job storage unavailable', retryable: true } }; }
}
