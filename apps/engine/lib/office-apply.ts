import { randomUUID } from 'node:crypto';
import { isAgentUuid, normalizeAgentCommand, validateAgentContext, type AgentCommandContext } from './agent-command.ts';
import { projectAgentCommandResponse } from '@com-moon/agent-contracts';
import { invokeSupabaseRpc } from './supabase-rest.ts';

type Row = Record<string, any>;
type Rpc = (name: string, params: Record<string, unknown>) => Promise<{ ok: boolean; data?: any; error?: string; status?: number | null; detail?: string }>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (error: string, status = 'error', persisted: boolean | null = false) => ({ status, error, persisted });
const storageFailure = (result: { error?: string; status?: number | null }, writing = false) => result.error === 'missing-config' || result.status === 404
  ? fail('office-storage-not-ready', 'preview') : fail(writing ? 'office-application-outcome-unknown' : 'office-receipt-unavailable', writing ? 'unknown' : 'error', writing ? null : false);

export function createOfficeTaskApplyService({ rpc = invokeSupabaseRpc, uuid = randomUUID }: { rpc?: Rpc; uuid?: () => string } = {}) {
  return async (input: unknown, identity: AgentCommandContext) => {
    const context = { workspaceId: identity?.workspaceId, actorId: identity?.actorId, scopes: ['read', 'tasks:write'] };
    if (validateAgentContext(context, 'tasks:write')) return fail('invalid-office-context', 'invalid-input');
    if (!object(input) || Object.keys(input).some(key => !['requestId', 'resultRevision', 'fields', 'sourceRefs'].includes(key)) || !isAgentUuid(input.requestId)) return fail('invalid-office-application', 'invalid-input');
    const requestId = input.requestId.toLowerCase();
    const args = { p_workspace_id: context.workspaceId, p_actor_id: context.actorId, p_request_id: requestId };
    let prior;
    try { prior = await rpc('office_request_receipt_v1', { ...args, p_request: null }); }
    catch { return fail('office-receipt-unavailable'); }
    if (!prior.ok) return storageFailure(prior);
    let row = prior.data?.request;
    if (!row) return fail(prior.data?.error || 'request-not-found', prior.data?.status || 'error');
    if (!row.application) {
      if (prior.data.status === 'expired') return fail('office-result-expired', 'expired');
      if (row.state !== 'generated' || input.resultRevision !== row.result_revision || !object(input.fields) || !isAgentUuid(input.fields.projectId)) return fail('office-task-project-required', 'invalid-input');
      // The general PMS normalizer caps text by slicing. Office presents a
      // reviewed artifact: reject overlong edited fields rather than losing text.
      for (const [field, limit] of [['title', 300], ['description', 4000], ['nextAction', 1000], ['next_action', 1000]] as const) {
        if (input.fields[field] != null && (typeof input.fields[field] !== 'string' || input.fields[field].length > limit)) return fail(`office-task-${field}-too-long`, 'invalid-input');
      }
      if (!Array.isArray(input.sourceRefs) || input.sourceRefs.length < 1 || input.sourceRefs.length > 4 || input.sourceRefs.some(ref => !object(ref) || Object.keys(ref).some(key => !['type', 'id', 'updatedAt'].includes(key)) || !['projects', 'deals', 'brands'].includes(ref.type) || !isAgentUuid(ref.id) || typeof ref.updatedAt !== 'string' || !Number.isFinite(Date.parse(ref.updatedAt)))) return fail('invalid-office-target-versions', 'invalid-input');
      const normalized = normalizeAgentCommand({ commandId: uuid(), action: 'create_task', input: input.fields }, context);
      if (!normalized.ok) return fail(normalized.reason, 'invalid-input');
      let claim;
      try { claim = await rpc('office_application_claim_v1', { ...args, p_result_revision: input.resultRevision, p_command: normalized.command, p_source_refs: input.sourceRefs }); }
      catch { return fail('office-application-outcome-unknown', 'unknown', null); }
      if (!claim.ok) return storageFailure(claim, true);
      row = claim.data?.request;
      if (!row?.application) return fail(claim.data?.error || 'office-application-not-claimed', claim.data?.status || 'unknown', claim.data?.persisted ?? null);
    }
    // Retry uses only the stored command. New browser fields never replace an
    // application slot; the SQL wrapper reads the real receipt under its lock.
    let dispatched;
    try { dispatched = await rpc('office_apply_task_v1', args); }
    catch { return { ...fail('office-application-outcome-unknown', 'unknown', null), commandId: row.application.commandId }; }
    if (!dispatched.ok) return storageFailure(dispatched, true);
    const result = dispatched.data;
    if (!object(result)) return fail('office-application-outcome-unknown', 'unknown', null);
    if (result.status === 'saved') {
      if (result.persisted !== true || result.commandId !== row.application.commandId || result.action !== 'create_task' || !isAgentUuid(result.entity?.id)) return fail('invalid-office-command-receipt', 'unknown', null);
      try { await rpc('office_application_refresh_v1', args); } catch { /* The saved command receipt still confirms the task. */ }
      return projectAgentCommandResponse(result, { action: 'create_task' });
    }
    return { ...fail(result.error || 'office-application-rejected', result.status || 'error', result.persisted ?? null), ...(result.commandId ? { commandId: result.commandId } : {}) };
  };
}
export const applyOfficeTask = createOfficeTaskApplyService();
