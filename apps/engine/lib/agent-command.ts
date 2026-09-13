import { normalizePmsCommand } from './pms-command.ts';

export type AgentCommandContext = { workspaceId?: string; actorId?: string; scopes?: string[] };
export type AgentCommand = { commandId: string; action: string; targetId: string; expectedUpdatedAt: string | null; payload: Record<string, unknown> };
export const AGENT_SCOPES = ['read', 'tasks:write', 'contact-outcomes:write', 'jobs:read', 'jobs:write'];
export const AGENT_COMMAND_BODY_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR = /^[a-zA-Z0-9._:@/-]{1,128}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const COMMAND_FIELDS = new Set(['commandId', 'action', 'targetId', 'expectedUpdatedAt', 'input']);
const TASK_FIELDS = ['title', 'status', 'priority', 'projectId', 'project_id', 'dueAt', 'due_at', 'description', 'nextAction', 'next_action', 'checklist'];
const OUTCOME_FIELDS = ['entityType', 'entityId', 'contactId', 'kind', 'summary', 'reaction', 'nextAction', 'nextActionAt', 'dormant'];
const SCOPES: Record<string, string> = { create_task: 'tasks:write', update_task: 'tasks:write', complete_task: 'tasks:write', record_contact_outcome: 'contact-outcomes:write' };
const invalid = (reason: string) => ({ ok: false as const, reason });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const isAgentUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function validateAgentContext(context: AgentCommandContext, requiredScope?: string) {
  if (!isAgentUuid(context?.workspaceId)) return 'missing-workspace';
  if (typeof context.actorId !== 'string' || !ACTOR.test(context.actorId)) return 'invalid-actor';
  if (!Array.isArray(context.scopes) || context.scopes.some(scope => !AGENT_SCOPES.includes(scope))) return 'invalid-scopes';
  if (requiredScope && !context.scopes.includes(requiredScope)) return 'insufficient-scope';
  return null;
}

// PMS owns the task field/type rules. Use a fixed clock only for normalization,
// then remove generated timestamps; SQL assigns the actual transaction times.
// This keeps retries canonical even when they arrive on a different day.
export function normalizeAgentCommand(input: unknown, context: AgentCommandContext): { ok: true; command: AgentCommand } | { ok: false; reason: string } {
  const contextError = validateAgentContext(context);
  if (contextError) return invalid(contextError);
  if (!record(input)) return invalid('invalid-command');
  if (Object.keys(input).some(key => !COMMAND_FIELDS.has(key))) return invalid('unknown-command-field');
  if (!isAgentUuid(input.commandId)) return invalid('invalid-command-id');
  const commandId = input.commandId.toLowerCase();
  const action = typeof input.action === 'string' ? input.action : '';
  if (!Object.hasOwn(SCOPES, action)) return invalid('unsupported-action');
  if (!context.scopes!.includes(SCOPES[action])) return invalid('insufficient-scope');
  const fields = input.input === undefined ? {} : input.input;
  if (!record(fields)) return invalid('invalid-command-input');
  const allowed = action === 'record_contact_outcome' ? OUTCOME_FIELDS : action === 'complete_task' ? [] : action === 'create_task' ? [...TASK_FIELDS, 'dealId', 'deal_id'] : TASK_FIELDS;
  if (Object.keys(fields).some(key => !allowed.includes(key))) return invalid('unknown-input-field');
  if (Object.values(fields).some(value => value === undefined)) return invalid('invalid-command-input');
  const target = input.targetId ?? (action === 'create_task' ? commandId : action === 'record_contact_outcome' ? fields.entityId : null);
  if (!isAgentUuid(target)) return invalid('invalid-target-id');
  const targetId = target.toLowerCase();
  if (action === 'create_task' && targetId !== commandId) return invalid('create-target-must-match-command');
  let expectedUpdatedAt: string | null = null;
  if (action === 'update_task' || action === 'complete_task') {
    if (!input.expectedUpdatedAt) return invalid('missing-expected-updated-at');
    if (typeof input.expectedUpdatedAt !== 'string' || !TIMESTAMP.test(input.expectedUpdatedAt) || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) return invalid('invalid-expected-updated-at');
    expectedUpdatedAt = input.expectedUpdatedAt;
  } else if (input.expectedUpdatedAt != null) return invalid('unexpected-expected-updated-at');

  if (action === 'record_contact_outcome') {
    if (!['lead', 'deal', 'account'].includes(String(fields.entityType))) return invalid('invalid-entity');
    if (fields.entityId != null && (!isAgentUuid(fields.entityId) || fields.entityId.toLowerCase() !== targetId)) return invalid('target-mismatch');
    if (fields.contactId != null && !isAgentUuid(fields.contactId)) return invalid('invalid-contact-id');
    if (typeof fields.summary !== 'string' || !fields.summary.trim() || fields.summary.length > 4000) return invalid('invalid-summary');
    if (typeof fields.reaction !== 'string' || fields.reaction.length > 100) return invalid('invalid-reaction');
    if (fields.kind != null && (typeof fields.kind !== 'string' || fields.kind.length > 100)) return invalid('invalid-kind');
    if (fields.nextAction != null && (typeof fields.nextAction !== 'string' || fields.nextAction.length > 1000)) return invalid('invalid-next-action');
    if (fields.nextActionAt != null && (typeof fields.nextActionAt !== 'string' || !TIMESTAMP.test(fields.nextActionAt) || !Number.isFinite(Date.parse(fields.nextActionAt)))) return invalid('invalid-next-action-at');
    if (fields.dormant !== undefined && typeof fields.dormant !== 'boolean') return invalid('invalid-dormant');
    return { ok: true, command: { commandId, action, targetId, expectedUpdatedAt, payload: {
      entityType: fields.entityType, contactId: typeof fields.contactId === 'string' ? fields.contactId.toLowerCase() : null,
      kind: typeof fields.kind === 'string' ? fields.kind.trim().toLowerCase() : 'call',
      summary: fields.summary.trim(), reaction: fields.reaction.trim().toLowerCase(),
      nextAction: typeof fields.nextAction === 'string' ? fields.nextAction.trim() || null : null,
      nextActionAt: fields.nextActionAt ?? null, dormant: fields.dormant ?? false,
    } } };
  }

  const pms = normalizePmsCommand({ ...fields, action: action === 'complete_task' ? 'update_task' : action, id: targetId, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}), ...(action === 'complete_task' ? { status: 'done' } : {}), source: 'agent' }, { workspaceId: context.workspaceId, now: '2000-01-01T00:00:00.000Z' });
  if (!pms.ok) return invalid(pms.reason);
  const payload = { ...(pms.record || pms.patch) };
  for (const key of ['id', 'workspace_id', 'owner_id', 'updated_at', 'completed_at']) delete payload[key];
  return { ok: true, command: { commandId, action, targetId, expectedUpdatedAt, payload } };
}
