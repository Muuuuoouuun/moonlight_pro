import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const AGENT_SCHEMA_VERSION = '1.0';
export const AGENT_SCOPES = Object.freeze(['read', 'tasks:write', 'contact-outcomes:write', 'jobs:read', 'jobs:write']);
export const AGENT_RESPONSE_LIMITS = Object.freeze({ summary: 2048, rows: 16384, full: 32768 });
export const AGENT_QUERY_ORDER = 'created_at.asc,id.asc';
export const AGENT_CURSOR_TTL_MS = 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUIRED_FIELDS = ['id', 'status', 'updatedAt'];
const COMMON = { id: 'id', status: 'status', updatedAt: 'updated_at', createdAt: 'created_at' };
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// Select fragments are owned by the server, never accepted from the caller.
export const AGENT_RESOURCES = Object.freeze({
  tasks: {
    table: 'tasks',
    fields: { ...COMMON, title: 'title', priority: 'priority', projectId: 'project_id', ownerId: 'owner_id', dealId: 'deal_id:meta->>deal_id', dueAt: 'due_at', completedAt: 'completed_at', nextAction: 'next_action', description: 'description', checklist: 'checklist:meta->checklist' },
    defaults: ['title', 'priority', 'projectId', 'dueAt', 'nextAction', 'description'],
    textFields: ['title', 'nextAction', 'description', 'checklist'],
    filters: { status: ['inbox', 'todo', 'doing', 'blocked', 'done'], priority: PRIORITIES, projectId: 'uuid', ownerId: 'uuid', dealId: 'uuid', dueBefore: 'date', dueAfter: 'date' },
  },
  projects: {
    table: 'projects',
    fields: { ...COMMON, name: 'name', priority: 'priority', areaId: 'area_id', brandId: 'brand_id', ownerId: 'owner_id', summary: 'summary', progress: 'progress', nextAction: 'next_action', startedAt: 'started_at', dueAt: 'due_at', completedAt: 'completed_at' },
    defaults: ['name', 'priority', 'progress', 'nextAction', 'dueAt', 'summary'],
    textFields: ['name', 'nextAction', 'summary'],
    filters: { status: ['draft', 'active', 'blocked', 'completed', 'archived'], priority: PRIORITIES, areaId: 'uuid', brandId: 'uuid', ownerId: 'uuid', dueBefore: 'date', dueAfter: 'date' },
  },
  'work-orders': {
    table: 'work_orders',
    fields: { ...COMMON, updatedAt: null, title: 'title', kind: 'kind', persona: 'persona', body: 'body', leadId: 'lead_id', dealId: 'deal_id', companyId: 'company_id', channel: 'channel', gate: 'gate', source: 'source', proposedAt: 'proposed_at', decidedAt: 'decided_at', executedAt: 'executed_at' },
    defaults: ['title', 'kind', 'persona', 'gate', 'proposedAt', 'body'],
    textFields: ['title', 'body'],
    filters: { status: ['proposed', 'approved', 'executing', 'executed', 'dismissed'], kind: ['next_action', 'followup', 'idea', 'skeleton', 'review', 'dispatch', 'note', 'objection'], leadId: 'uuid', dealId: 'uuid', companyId: 'uuid' },
  },
  followups: {
    table: null,
    fields: { ...COMMON, kind: 'kind', name: 'name', companyId: 'company_id', nextAction: 'next_action', nextActionAt: 'next_action_at', lastTouchAt: 'last_touch_at', daysSince: 'days_since', channel: 'channel', why: 'why', score: 'score', amount: 'amount' },
    defaults: ['kind', 'name', 'companyId', 'nextAction', 'nextActionAt', 'daysSince', 'channel', 'why'],
    textFields: ['name', 'nextAction', 'why'],
    filters: { kind: ['lead', 'deal'], companyId: 'uuid' },
  },
});

export class AgentInputError extends Error {
  constructor(message, code = 'invalid-input') { super(message); this.name = 'AgentInputError'; this.code = code; }
}

export function isAgentUuid(value) { return typeof value === 'string' && UUID.test(value); }
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function agentHash(value) { return createHash('sha256').update(stableStringify(value)).digest('hex'); }

function record(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function reject(message) { throw new AgentInputError(message); }
function allowedKeys(value, keys) {
  if (!record(value)) reject('Expected an object.');
  if (Object.keys(value).some((key) => !keys.includes(key))) reject('Unknown input field.');
}
function resourceFor(resource) {
  if (typeof resource !== 'string' || !Object.hasOwn(AGENT_RESOURCES, resource)) reject('Unknown resource.');
  return AGENT_RESOURCES[resource];
}
function selectFields(fields, config, full = false) {
  if (fields === undefined) return [...new Set([...REQUIRED_FIELDS, ...(full ? Object.keys(config.fields) : config.defaults)])];
  if (!Array.isArray(fields) || !fields.length || fields.length > 30 || fields.some((field) => typeof field !== 'string' || !Object.hasOwn(config.fields, field))) reject('Unknown or empty field projection.');
  return [...new Set([...REQUIRED_FIELDS, ...fields])];
}
function filtersFor(filters = {}, config) {
  allowedKeys(filters, Object.keys(config.filters));
  return Object.fromEntries(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
    const type = config.filters[key];
    if (Array.isArray(type)) {
      const values = Array.isArray(value) ? value : [value];
      if (!values.length || values.length > type.length || values.some((item) => !type.includes(item))) reject(`Invalid ${key} filter.`);
      return [key, [...new Set(values)].sort()];
    }
    if (type === 'uuid' && !isAgentUuid(value)) reject(`Invalid ${key} filter.`);
    if (type === 'date' && (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value)))) reject(`Invalid ${key} filter.`);
    return [key, value];
  }));
}
function detailFor(detail, fallback) {
  const value = detail ?? fallback;
  if (!Object.hasOwn(AGENT_RESPONSE_LIMITS, value)) reject('Invalid detail level.');
  return value;
}
function cursorFor(cursor) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || !cursor.length || cursor.length > 4096) reject('Invalid cursor.');
  return cursor;
}
export function parseAgentQuery(input) {
  allowedKeys(input, ['resource', 'detail', 'limit', 'fields', 'filters', 'cursor', 'fresh']);
  const config = resourceFor(input.resource);
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) reject('limit must be an integer from 1 to 100.');
  if (input.fresh !== undefined && typeof input.fresh !== 'boolean') reject('fresh must be boolean.');
  return { resource: input.resource, detail: detailFor(input.detail, 'rows'), limit, fields: selectFields(input.fields, config), filters: filtersFor(input.filters, config), cursor: cursorFor(input.cursor), fresh: input.fresh === true, order: AGENT_QUERY_ORDER };
}
export function parseAgentEntityQuery(type, id, input = {}) {
  const aliases = { task: 'tasks', project: 'projects', 'work-order': 'work-orders' };
  const resource = aliases[type] || type;
  const config = resourceFor(resource);
  if (resource === 'followups' || !isAgentUuid(id)) reject('Unknown entity type or invalid entity ID.');
  allowedKeys(input, ['detail', 'fields', 'nextSectionCursor', 'fresh']);
  if (input.fresh !== undefined && ![true, false, 'true', 'false'].includes(input.fresh)) reject('fresh must be boolean.');
  const detail = detailFor(input.detail, 'full');
  const fields = typeof input.fields === 'string' ? input.fields.split(',') : input.fields;
  return { resource, id, detail, fields: selectFields(fields, config, detail === 'full'), nextSectionCursor: cursorFor(input.nextSectionCursor), fresh: input.fresh === undefined || input.fresh === true || input.fresh === 'true' };
}

export function sealAgentCursor(payload, binding, secret, { now = Date.now() } = {}) {
  if (typeof secret !== 'string' || !secret) throw new AgentInputError('Cursor signing is unavailable.', 'cursor-unavailable');
  const body = Buffer.from(JSON.stringify({ v: AGENT_SCHEMA_VERSION, b: agentHash(binding), exp: now + AGENT_CURSOR_TTL_MS, p: payload })).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
export function openAgentCursor(token, binding, secret, { now = Date.now() } = {}) {
  try {
    if (typeof token !== 'string' || token.length > 4096 || !secret || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error();
    const [body, signature] = token.split('.');
    const expected = createHmac('sha256', secret).update(body).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsed.v !== AGENT_SCHEMA_VERSION || parsed.b !== agentHash(binding) || !Number.isFinite(parsed.exp) || parsed.exp <= now || !record(parsed.p)) throw new Error();
    return parsed.p;
  } catch { throw new AgentInputError('Cursor is invalid, expired, or belongs to a different query.', 'invalid-cursor'); }
}

const COMMAND_RESPONSE_FIELDS = ['status', 'persisted', 'commandId', 'action', 'changedFields', 'updatedAt', 'replayed', 'code', 'error', 'retryable', 'nextAction', 'retryPolicy'];
const OUTCOME_RESPONSE_FIELDS = ['status', 'activityId', 'entityType', 'entityId', 'dormant', 'warning'];
const pick = (value, fields) => Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
function commandSummary(value) {
  if (typeof value !== 'string') return null;
  let text = ''; let count = 0;
  for (const character of value) { if (count++ === 200) break; text += character; }
  return text;
}

// A receipt proves a command; full row data belongs to a separately bounded read.
// Apply this on both sides of the transport for older deployed Engine/RPC versions.
export function projectAgentCommandResponse(value, { action = value?.action } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = pick(value, COMMAND_RESPONSE_FIELDS);
  if (value.outcome && typeof value.outcome === 'object' && !Array.isArray(value.outcome)) result.outcome = pick(value.outcome, OUTCOME_RESPONSE_FIELDS);
  const raw = value.entity;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const entity = { id: raw.id, status: raw.status ?? raw.stage ?? null, updatedAt: value.updatedAt ?? raw.updatedAt ?? raw.updated_at ?? null };
  const label = Object.hasOwn(raw, 'title') ? 'title' : Object.hasOwn(raw, 'name') ? 'name' : null;
  if (label) entity[label] = commandSummary(raw[label]);
  if (raw.summaryTruncated === true || (label && typeof raw[label] === 'string' && entity[label].length < raw[label].length)) entity.summaryTruncated = true;
  const isTask = ['create_task', 'update_task', 'complete_task'].includes(action);
  const type = isTask ? 'tasks' : ({ lead: 'leads', deal: 'deals', account: 'accounts' }[value.outcome?.entityType] || value.entityRef?.type || 'unknown');
  result.entity = entity;
  result.entityRef = { type, id: raw.id, detailAvailable: type === 'tasks', href: type === 'tasks' ? `/api/agent/v1/entities/tasks/${raw.id}` : null };
  return result;
}
