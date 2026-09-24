import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from '@com-moon/supabase-rest';
import { isAgentUuid } from '@com-moon/agent-contracts';

const OWNER = 'operator'; // Moonlight has one operator; Agent actor is the recorder, not the owner.
const REQUEST_KEYS = ['requestId', 'taskId', 'scope', 'instruction', 'expectedEvidence'];
const RECEIPT_KEYS = ['state', 'summary', 'evidence', 'commandId'];
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).every((key) => keys.includes(key));
const bounded = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const reply = (httpStatus, status, error, extra = {}) => ({ httpStatus, data: { status, error, ...extra } });

export function validateSkillRequest(input) {
  if (!exactKeys(input, REQUEST_KEYS) || !isAgentUuid(input.requestId) || !isAgentUuid(input.taskId)
    || !['classin', 'personal'].includes(input.scope) || !bounded(input.instruction, 4000)
    || !bounded(input.expectedEvidence, 500) || Buffer.byteLength(JSON.stringify(input), 'utf8') > 16384) return null;
  return { requestId: input.requestId.toLowerCase(), taskId: input.taskId.toLowerCase(), scope: input.scope,
    instruction: input.instruction.trim(), expectedEvidence: input.expectedEvidence.trim() };
}

export function validateSkillReceipt(input) {
  if (!exactKeys(input, RECEIPT_KEYS) || !['completed', 'failed', 'unconfirmed'].includes(input.state)
    || !bounded(input.summary, 2000) || !Array.isArray(input.evidence) || input.evidence.length > 8
    || (input.state === 'completed' && input.evidence.length === 0)
    || input.evidence.some((item) => !exactKeys(item, ['kind', 'value'])
      || !['path', 'url', 'note'].includes(item.kind) || !bounded(item.value, 1024))
    || (input.commandId !== undefined && (!isAgentUuid(input.commandId) || input.state !== 'completed'))
    || Buffer.byteLength(JSON.stringify(input), 'utf8') > 16384) return null;
  return { state: input.state, summary: input.summary.trim(), evidence: input.evidence.map(({kind, value}) => ({ kind, value: value.trim() })),
    ...(input.commandId ? { commandId: input.commandId.toLowerCase() } : {}) };
}

function contextValid(workspaceId) { return isAgentUuid(workspaceId); }

export function createSkillRequestService({ rpc = invokeSupabaseRpc, workspace = resolveDefaultWorkspaceId } = {}) {
  async function call(name, params, { read = false } = {}) {
    const result = await rpc(name, params);
    if (!result.ok || !record(result.data) || typeof result.data.status !== 'string') {
      if (result.error === 'missing-config') {
        return reply(read ? 200 : 202, read ? 'error' : 'preview', 'skill-storage-not-configured',
          { source: read ? 'error' : 'preview', persisted: false });
      }
      return reply(read ? 200 : 502, 'error', 'skill-storage-unavailable',
        { source: 'error', persisted: false, retryable: true });
    }
    const data = result.data;
    if (read && !['ready', 'not-found'].includes(data.status)) {
      return { httpStatus: 200, data: { ...data, status: 'error', source: 'error' } };
    }
    const httpStatus = read ? 200 : data.status === 'invalid-input' ? 400 : data.status === 'not-found' ? 404
      : data.status === 'conflict' ? 409 : data.status === 'error' ? 502 : 200;
    return { httpStatus, data };
  }
  const context = (workspaceId) => workspaceId || workspace();
  return {
    async create(input, { workspaceId } = {}) {
      const request = validateSkillRequest(input);
      const scope = context(workspaceId);
      if (!request || !contextValid(scope)) return reply(400, 'invalid-input', 'invalid-skill-request', { persisted: false });
      return call('local_skill_request_create_v1', { p_workspace_id: scope, p_operator_id: OWNER, p_request: request });
    },
    async get(id, { workspaceId } = {}) {
      const scope = context(workspaceId);
      if (!isAgentUuid(id) || !contextValid(scope)) return reply(200, 'error', 'invalid-skill-request-id', { source: 'error' });
      return call('local_skill_request_get_v1', { p_workspace_id: scope, p_operator_id: OWNER, p_request_id: id.toLowerCase() }, { read: true });
    },
    async list({ limit = 20 } = {}, { workspaceId } = {}) {
      const scope = context(workspaceId);
      const count = Number(limit);
      if (!Number.isInteger(count) || count < 1 || count > 50 || !contextValid(scope)) return reply(200, 'error', 'invalid-skill-request-query', { source: 'error' });
      return call('local_skill_request_list_v1', { p_workspace_id: scope, p_operator_id: OWNER, p_limit: count }, { read: true });
    },
    async record(id, input, { workspaceId, actorId } = {}) {
      const scope = context(workspaceId);
      const receipt = validateSkillReceipt(input);
      if (!isAgentUuid(id) || !receipt || !contextValid(scope) || !/^[a-zA-Z0-9._:@/-]{1,128}$/.test(actorId || '')) {
        return reply(400, 'invalid-input', 'invalid-skill-receipt', { persisted: false });
      }
      return call('local_skill_receipt_record_v1', { p_workspace_id: scope, p_operator_id: OWNER,
        p_agent_actor_id: actorId, p_request_id: id.toLowerCase(), p_receipt: receipt });
    },
  };
}

export const skillRequestService = createSkillRequestService();
