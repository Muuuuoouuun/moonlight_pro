import { isAgentUuid } from '@com-moon/agent-contracts';
import { OFFICE_MODES } from '@com-moon/agent-contracts/office';
import { parseOfficeWorkflowOrigin } from '@com-moon/agent-contracts/office-workflow';

const INTENTS = new Set(['weekly_report', 'customer_reply']);
const STATES = new Set(['running', 'generated', 'unknown', 'error', 'expired']);
const validActor = actor => /^[a-zA-Z0-9._:@/-]{1,128}$/.test(actor || '');
const validTime = time => typeof time === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(time) && Number.isFinite(Date.parse(time));
const failure = (error, status = 'error') => ({ status, source: status, error, items: [], hasMore: false, nextCursor: null });

// Allowlist both levels even though the private RPC already returns metadata.
// No receipt/result projection, application refresh or model call happens here.
function projectItem(row, scope) {
  if (!row || !isAgentUuid(row.requestId) || !INTENTS.has(row.intent) || row.scope !== scope || !STATES.has(row.status)
    || !validTime(row.createdAt) || !validActor(row.ownerId) || !(OFFICE_MODES.includes(row.mode) || row.mode === 'answer')
    || !Array.isArray(row.participants) || row.participants.length > 9 || !row.participants.every(validActor)) throw new Error('invalid-office-inbox-row');
  const originKeys = row.intent === 'weekly_report' ? ['periodStart', 'periodEnd', 'timezone'] : ['entityType', 'entityId'];
  const origin = Object.fromEntries(originKeys.map(key => [key, row.originRef?.[key]]));
  return { requestId: row.requestId, intent: row.intent, scope: row.scope, originRef: parseOfficeWorkflowOrigin(origin, row.intent),
    ownerId: row.ownerId, mode: row.mode, participants: [...row.participants], createdAt: row.createdAt,
    status: row.status, state: row.status, expired: row.status === 'expired' };
}

export function createOfficeInboxService({ rpc }) {
  async function list(input, identity) {
    let limit, before = null;
    try {
      if (!['personal', 'classin'].includes(input?.scope)) throw new Error();
      limit = input.limit === undefined ? 20 : Number(input.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error();
      if (input.cursor !== undefined) {
        if (typeof input.cursor !== 'string' || !input.cursor || input.cursor.length > 600 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error();
        before = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
        if (!before || Array.isArray(before) || Object.keys(before).length !== 2 || Object.keys(before).some(key => !['id', 'createdAt'].includes(key))
          || !isAgentUuid(before.id) || !validTime(before.createdAt)) throw new Error();
      }
    } catch { return failure('invalid-office-inbox-query'); }
    if (!isAgentUuid(identity?.workspaceId) || !validActor(identity?.actorId)) return failure('office-workspace-not-configured', 'preview');
    try {
      const result = await rpc('office_request_inbox_v1', { p_workspace_id: identity.workspaceId, p_actor_id: identity.actorId,
        p_scope: input.scope, p_limit: limit, p_before: before });
      if (result?.status !== 'ready' || !Array.isArray(result.items) || result.items.length > limit + 1) throw new Error('invalid-office-inbox-response');
      const items = result.items.slice(0, limit).map(row => projectItem(row, input.scope)), last = items.at(-1);
      const hasMore = result.items.length > limit;
      return { status: 'ready', source: 'live', items, hasMore,
        nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.requestId } : null };
    } catch (error) { return error?.preparation ? failure('office-storage-not-ready', 'preview') : failure('office-inbox-read-unavailable'); }
  }
  return { list };
}
