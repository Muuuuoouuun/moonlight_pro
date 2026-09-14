import { AGENT_SCOPES, isAgentUuid, projectAgentCommandResponse } from '@com-moon/agent-contracts';

const COMMAND_SCOPES = { create_task: 'tasks:write', update_task: 'tasks:write', complete_task: 'tasks:write', record_contact_outcome: 'contact-outcomes:write' };
const COMMAND_FIELDS = ['commandId', 'action', 'targetId', 'expectedUpdatedAt', 'input'];
const MAX_COMMAND_BYTES = 256 * 1024;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (httpStatus, code, extra = {}) => ({ httpStatus, data: { status: 'error', error: code, code, persisted: false, retryable: false, ...extra } });
const unknownWrite = commandId => fail(502, 'command-outcome-unknown', { commandId, persisted: null, nextAction: 'get_command_receipt' });

function contextError(context, scope) {
  if (!isAgentUuid(context?.workspaceId) || typeof context?.actorId !== 'string' || !/^[a-zA-Z0-9._:@/-]{1,128}$/.test(context.actorId) || !Array.isArray(context?.scopes) || context.scopes.some(value => !AGENT_SCOPES.includes(value))) return 'invalid-agent-context';
  return context.scopes.includes(scope) ? null : 'insufficient-scope';
}

async function transport(commandId, body, context, { env = process.env, fetchImpl = fetch } = {}, action) {
  const engineUrl = String(env.COM_MOON_ENGINE_URL || '').trim().replace(/\/$/, '');
  const sharedSecret = String(env.COM_MOON_SHARED_WEBHOOK_SECRET || '').trim();
  if (!engineUrl) return { httpStatus: 202, data: { status: 'preview', error: 'engine-not-configured', commandId, persisted: false } };
  if (!sharedSecret) return fail(503, 'shared-secret-not-configured', { commandId });
  const write = body !== undefined;
  try {
    const response = await fetchImpl(`${engineUrl}/api/agent/command${write ? '' : `/${commandId}`}`, {
      method: write ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-com-moon-shared-secret': sharedSecret, 'x-com-moon-agent-workspace': context.workspaceId, 'x-com-moon-agent-actor': context.actorId, 'x-com-moon-agent-scopes': [...new Set(context.scopes)].sort().join(',') },
      ...(write ? { body } : {}), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!record(data) || typeof data.status !== 'string') throw new Error('invalid-command-response');
    if (data.status === 'saved' && (data.persisted !== true || data.commandId !== commandId || !record(data.entity) || typeof data.entity.id !== 'string' || typeof data.updatedAt !== 'string' || !Array.isArray(data.changedFields) || typeof data.replayed !== 'boolean')) throw new Error('invalid-command-receipt');
    if (!['saved', 'preview', 'error'].includes(data.status) || (data.status === 'saved' && !response.ok)) throw new Error('invalid-command-response');
    if (!write && data.status === 'error' && data.code === 'not-found') {
      Object.assign(data, { commandId, persisted: null, retryable: false, nextAction: 'get_command_receipt', retryPolicy: 'same-command-id-and-input-only' });
    }
    return { httpStatus: response.status, data: projectAgentCommandResponse(data, { action: action ?? data.action }) };
  } catch {
    // Transport loss says nothing about commit state. A caller can read the same
    // command ID; this layer never issues a second write on its own.
    return write ? unknownWrite(commandId) : fail(502, 'receipt-read-unavailable', { commandId, persisted: null, retryable: true });
  }
}

export async function executeAgentCommand(input, context, options = {}) {
  if (!record(input) || Object.keys(input).some(key => !COMMAND_FIELDS.includes(key))) return fail(400, 'invalid-command');
  if (!isAgentUuid(input.commandId)) return fail(400, 'invalid-command-id');
  if (typeof input.action !== 'string' || !Object.hasOwn(COMMAND_SCOPES, input.action)) return fail(400, 'unsupported-action');
  const denied = contextError(context, COMMAND_SCOPES[input.action]);
  if (denied) return fail(403, denied);
  let body;
  try { body = JSON.stringify(input); } catch { return fail(400, 'invalid-command'); }
  if (Buffer.byteLength(body, 'utf8') > MAX_COMMAND_BYTES) return fail(400, 'command-body-too-large');
  // Engine applies the authoritative PMS field validation, business RPC and CAS.
  return transport(input.commandId.toLowerCase(), body, context, options, input.action);
}

export async function getAgentCommandReceipt(id, context, options = {}) {
  const denied = contextError(context, 'read');
  if (denied) return fail(403, denied);
  if (!isAgentUuid(id)) return fail(400, 'invalid-command-id');
  return transport(id.toLowerCase(), undefined, context, options);
}
