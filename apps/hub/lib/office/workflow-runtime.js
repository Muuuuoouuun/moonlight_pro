import { fetchSupabaseRowsDetailed, invokeSupabaseRpc, resolveDefaultWorkspaceId } from '@com-moon/supabase-rest';
import { isAgentUuid } from '@com-moon/agent-contracts';
import { verifyOperatorSessionRequest } from '../operator-session.js';
import { hasHubServerCredential } from '../hub-write-guard.js';
import { canonicalOrgScopeForKey } from '../brand-org-scope.js';
import { resolveProjectOrgScope } from '../repositories/project-ledger-context.js';
import { resolveMetricEntityScope } from '../metrics/source-adapters.js';
import { getOfficeWorkflowContext } from '../repositories/office-workflow-context.js';
import { recordAgentRun } from '../sales-os/agent-runs.js';
import { callOfficeWorkflowEngine, callOfficeApplyEngine, officeEngineConfigured } from './workflow-engine-client.js';
import { createOfficeWorkflowService } from './workflow-service.js';

// The middleware authenticates the request; clients cannot choose workspace or
// actor through a body/header. Development loopback follows the existing single
// operator model, and server credentials have that same fixed actor.
export function officeOperatorIdentity(req) {
  const verified = verifyOperatorSessionRequest(req);
  const actorId = verified.ok && /^[a-zA-Z0-9._:@/-]{1,128}$/.test(verified.session?.sub || '') ? verified.session.sub : 'operator';
  return { workspaceId: resolveDefaultWorkspaceId(), actorId: hasHubServerCredential(req) ? 'operator' : actorId };
}
async function rpc(name, params) {
  const result = await invokeSupabaseRpc(name, params);
  if (!result.ok || !result.data || typeof result.data !== 'object') {
    const error = new Error('office-storage-unavailable');
    error.preparation = result.error === 'missing-config' || result.status === 404 || /(?:office_|relation).*?(?:does not exist|schema cache)|could not find.*?office_/i.test(result.detail || '');
    throw error;
  }
  return result.data;
}
const invalidTarget = (error, status = 'conflict') => ({ status, error, persistence: { persisted: false }, capabilities: { generate: false, applyTask: false } });
export async function readOfficeTaskTargets(fields, scope, identity, { read = fetchSupabaseRowsDetailed, resolveScope = resolveMetricEntityScope } = {}) {
  if (!isAgentUuid(fields?.projectId)) return invalidTarget('office-task-project-required', 'invalid-input');
  if (fields.dealId != null && !isAgentUuid(fields.dealId)) return invalidTarget('invalid-deal-id', 'invalid-input');
  const readOne = async (table, id, select) => {
    const result = await read(table, { select, filters: [['workspace_id', `eq.${identity.workspaceId}`], ['id', `eq.${id.toLowerCase()}`]], limit: 1, strictRows: true });
    const row = result.rows?.[0];
    if (result.error || !row || row.id !== id.toLowerCase() || row.workspace_id !== identity.workspaceId || !row.updated_at) throw new Error('target-read-failed');
    return row;
  };
  try {
    const project = await readOne('projects', fields.projectId, 'id,workspace_id,brand_id,meta,updated_at');
    const refs = [{ type: 'projects', id: project.id, updatedAt: project.updated_at }];
    let brand;
    if (project.brand_id) {
      brand = await readOne('brands', project.brand_id, 'id,workspace_id,slug,meta,updated_at');
      refs.push({ type: 'brands', id: brand.id, updatedAt: brand.updated_at });
    }
    const orgScope = resolveProjectOrgScope(project, brand ? { orgScope: brand.meta?.org_scope || canonicalOrgScopeForKey(brand.slug || brand.id) } : null);
    const expectedMetric = scope === 'classin' ? 'company' : 'personal';
    const metric = await resolveScope({ workspaceId: identity.workspaceId, entityType: 'projects', entityId: project.id });
    if (orgScope !== scope || metric.scope !== expectedMetric) return invalidTarget('office-project-scope-mismatch');
    if (fields.dealId) {
      const deal = await readOne('deals', fields.dealId, 'id,workspace_id,updated_at');
      const dealScope = await resolveScope({ workspaceId: identity.workspaceId, entityType: 'deals', entityId: deal.id });
      if (dealScope.scope !== expectedMetric) return invalidTarget('office-deal-scope-mismatch');
      refs.push({ type: 'deals', id: deal.id, updatedAt: deal.updated_at });
    }
    return { status: 'ready', sourceRefs: refs };
  } catch { return invalidTarget('office-target-read-unavailable', 'error'); }
}
export const officeWorkflowService = createOfficeWorkflowService({
  rpc, readContext: getOfficeWorkflowContext, generate: callOfficeWorkflowEngine,
  engineConfigured: officeEngineConfigured, recoverySecret: () => process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim(),
  recordRun: recordAgentRun, readTargets: readOfficeTaskTargets, apply: callOfficeApplyEngine,
  confirmTask: async (id, identity) => {
    const result = await fetchSupabaseRowsDetailed('tasks', { select: 'id,workspace_id', filters: [['workspace_id', `eq.${identity.workspaceId}`], ['id', `eq.${id}`]], limit: 1, strictRows: true });
    return !result.error && result.rows?.[0]?.id === id && result.rows[0].workspace_id === identity.workspaceId;
  },
});
