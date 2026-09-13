import { isAgentUuid, normalizeAgentCommand, validateAgentContext, type AgentCommandContext } from './agent-command.ts';
import { invokeSupabaseRpc } from './supabase-rest.ts';
import { projectAgentCommandResponse } from '@com-moon/agent-contracts';

type Envelope = Record<string, unknown>;
type Result = { httpStatus: number; data: Envelope };
type RpcResult = { ok: boolean; data?: unknown; status?: number | null; error?: string; detail?: string };
type Dependencies = { rpc?: (name: string, params: Record<string, unknown>) => Promise<RpcResult> };
const error = (httpStatus: number, reason: string, code = reason, extra: Envelope = {}): Result => ({ httpStatus, data: { status: 'error', error: reason, code, persisted: false, retryable: false, ...extra } });
const invalid = (reason: string) => error(['insufficient-scope', 'invalid-actor', 'invalid-scopes'].includes(reason) ? 403 : 400, reason);
const record = (value: unknown): value is Envelope => !!value && typeof value === 'object' && !Array.isArray(value);
const unknown = (commandId: string) => error(502, 'command-outcome-unknown', 'command-outcome-unknown', { commandId, persisted: null, nextAction: 'get_command_receipt' });

function storageFailure(result: RpcResult, commandId: string, write: boolean): Result {
  if (result.error === 'missing-config') return { httpStatus: 202, data: { status: 'preview', error: 'missing-config', persisted: false, commandId } };
  if (result.status === 404 || /(?:agent_command|record_contact_outcome|relation).*?(?:does not exist|schema cache)|could not find.*?(?:agent_command|record_contact_outcome)/i.test(result.detail || '')) return error(503, 'agent-commands-migration-required', 'agent-commands-migration-required', { commandId });
  if (result.status === 401 || result.status === 403 || /permission denied/i.test(result.detail || '')) return error(503, 'command-storage-unauthorized', 'command-storage-unauthorized', { commandId });
  return write ? unknown(commandId) : error(502, 'receipt-read-unavailable', 'receipt-read-unavailable', { commandId, persisted: null, retryable: true });
}

function fromEnvelope(value: unknown, commandId: string, write: boolean, action?: string): Result {
  if (!record(value)) return write ? unknown(commandId) : error(502, 'invalid-receipt-response', undefined, { persisted: null, commandId });
  if (value.status === 'saved') {
    if (value.persisted !== true || value.commandId !== commandId || !record(value.entity) || typeof value.entity.id !== 'string' || typeof value.updatedAt !== 'string' || !Array.isArray(value.changedFields) || typeof value.replayed !== 'boolean') return write ? unknown(commandId) : error(502, 'invalid-receipt-response', undefined, { persisted: null, commandId });
    return { httpStatus: write && value.action === 'create_task' && value.replayed !== true ? 201 : 200, data: projectAgentCommandResponse(value, { action: action ?? String(value.action || '') }) };
  }
  if (value.status === 'error' && typeof value.error === 'string') {
    // An older deployed RPC can still return persisted:false for absence. A
    // missing row cannot prove that a timed-out transaction will never commit.
    if (!write && value.code === 'not-found') return { httpStatus: 404, data: { ...value, commandId, persisted: null, retryable: false, nextAction: 'get_command_receipt', retryPolicy: 'same-command-id-and-input-only' } };
    const status = value.code === 'conflict' ? 409 : value.code === 'not-found' ? 404 : value.code === 'forbidden' ? 403 : value.code === 'invalid-input' ? 400 : value.code === 'agent-commands-migration-required' ? 503 : 502;
    return { httpStatus: status, data: projectAgentCommandResponse(value, { action: action ?? String(value.action || '') }) };
  }
  return write ? unknown(commandId) : error(502, 'invalid-receipt-response', undefined, { persisted: null, commandId });
}

export async function executeAgentCommand(input: unknown, context: AgentCommandContext, { rpc = invokeSupabaseRpc }: Dependencies = {}): Promise<Result> {
  const normalized = normalizeAgentCommand(input, context);
  if (!normalized.ok) return invalid(normalized.reason);
  const { command } = normalized;
  let result: RpcResult;
  try { result = await rpc('agent_command_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId, p_scopes: context.scopes, p_command: command }); }
  catch { return unknown(command.commandId); }
  return result.ok ? fromEnvelope(result.data, command.commandId, true, command.action) : storageFailure(result, command.commandId, true);
}

export async function getAgentCommandReceipt(id: unknown, context: AgentCommandContext, { rpc = invokeSupabaseRpc }: Dependencies = {}): Promise<Result> {
  const contextError = validateAgentContext(context, 'read');
  if (contextError) return invalid(contextError);
  if (!isAgentUuid(id)) return invalid('invalid-command-id');
  const commandId = id.toLowerCase();
  let result: RpcResult;
  try { result = await rpc('agent_command_receipt_v1', { p_workspace_id: context.workspaceId, p_actor_id: context.actorId, p_scopes: context.scopes, p_command_id: commandId }); }
  catch { return error(502, 'receipt-read-unavailable', undefined, { commandId, persisted: null, retryable: true }); }
  return result.ok ? fromEnvelope(result.data, commandId, false) : storageFailure(result, commandId, false);
}
