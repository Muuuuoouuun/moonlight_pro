import { fetchSupabaseRowsDetailed, resolveSupabaseConfig } from '@com-moon/supabase-rest';
import {
  AGENT_SCHEMA_VERSION, AGENT_SCOPES, AGENT_RESOURCES, AGENT_RESPONSE_LIMITS,
  AgentInputError, agentHash, isAgentUuid, parseAgentQuery, parseAgentEntityQuery,
  sealAgentCursor, openAgentCursor,
} from '@com-moon/agent-contracts';
import { isExplanationLead, isMetaAdsLead, isThreadsLead } from '../sales-os/operator-context.js';
import { isSnoozed } from '../sales-os/snooze.js';

const CACHE_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map();
const inflight = new Map();
let generation = 0;
const STALE_DAYS = { new: 2, qualified: 3, nurturing: 4, contact: 4, proposal: 3, negotiation: 2 };

export function invalidateAgentQueryCache({ workspaceId, resources } = {}) {
  generation += 1;
  const matches = (entry) => (!workspaceId || entry.workspaceId === workspaceId) && (!resources || resources.includes(entry.resource));
  for (const [key, entry] of cache) if (matches(entry)) cache.delete(key);
  for (const [key, entry] of inflight) if (matches(entry)) inflight.delete(key);
}

function contextAllowed(context) {
  return isAgentUuid(context?.workspaceId) && typeof context.actorId === 'string' && context.actorId.length > 0 && context.actorId.length <= 128 &&
    Array.isArray(context.scopes) && context.scopes.includes('read') && context.scopes.every((scope) => AGENT_SCOPES.includes(scope));
}
function emptyPage() { return { returnedCount: 0, hasMore: false, nextCursor: null, totalCount: null }; }
function envelope(resource, { status = 'live', source = 'supabase', asOf = new Date().toISOString(), rows = [], partial = false, failedSources = [], truncated = false, page = emptyPage(), ...extra } = {}) {
  return { schemaVersion: AGENT_SCHEMA_VERSION, status, source, asOf, data: { resource, rows }, page, partial, failedSources, truncated, consistency: 'live; asOf is response time, not a database snapshot', ...extra };
}
function failure(resource, code, httpStatus = 400, failedSources = []) {
  return { httpStatus, data: envelope(resource, { status: 'error', source: 'error', error: code, code, retryable: httpStatus === 200, failedSources }) };
}
function preview(resource) { return { httpStatus: 200, data: envelope(resource, { status: 'preview', source: 'preview' }) }; }
function bindingFor(query, context, mode) {
  const { cursor, nextSectionCursor, fresh, ...bound } = query;
  return { schemaVersion: AGENT_SCHEMA_VERSION, workspaceId: context.workspaceId, actorId: context.actorId, scopes: [...new Set(context.scopes)].sort(), mode, query: bound };
}
function cursorSecret() { return process.env.COM_MOON_AGENT_API_TOKEN?.trim() || ''; }
function anchor(row) { return { id: row.id, createdAt: row.created_at, ...(['lead', 'deal'].includes(row.kind) ? { kind: row.kind } : {}) }; }
function validTimestamp(value) { return typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)); }
function validAnchor(value) { return isAgentUuid(value?.id) && validTimestamp(value.createdAt) && (value.kind === undefined || ['lead', 'deal'].includes(value.kind)); }
function keysetFilter(after, kind) {
  if (!after) return [];
  if (!validAnchor(after)) throw new AgentInputError('Invalid cursor position.', 'invalid-cursor');
  // Follow-up rows add kind only as a deterministic tie-break when two tables use
  // the same UUID; ordinary tables keep precisely the created_at/id ordering.
  const op = kind && after.kind && kind > after.kind ? 'gte' : 'gt';
  return [['or', `(created_at.gt.${after.createdAt},and(created_at.eq.${after.createdAt},id.${op}.${after.id}))`]];
}
function selectFor(config, fields) {
  return [...new Set(['workspace_id', 'id', 'created_at', ...fields.map((field) => config.fields[field]).filter(Boolean)])].join(',');
}
function filtersFor(query, context) {
  const config = AGENT_RESOURCES[query.resource];
  return [['workspace_id', `eq.${context.workspaceId}`], ...Object.entries(query.filters).map(([key, value]) => {
    if (key === 'dueBefore') return ['due_at', `lt.${value}`];
    if (key === 'dueAfter') return ['due_at', `gte.${value}`];
    if (key === 'dealId' && query.resource === 'tasks') return ['meta->>deal_id', `eq.${value}`];
    return [config.fields[key], Array.isArray(value) ? `in.(${value.join(',')})` : `eq.${value}`];
  })];
}
function validRow(row, context, versionRequired = true) {
  return row && row.workspace_id === context.workspaceId && isAgentUuid(row.id) && validTimestamp(row.created_at) &&
    typeof row.status === 'string' && row.status.length > 0 && row.status.length <= 40 &&
    (!versionRequired || validTimestamp(row.updated_at));
}
function firstCharacters(value, count = 200) {
  let text = ''; let size = 0;
  for (const char of value) { if (size++ === count) break; text += char; }
  return text;
}
function fieldValue(row, field, config) {
  const column = config.fields[field];
  return column ? row[column.includes(':') ? column.split(':')[0] : column] ?? null : null;
}
function projectRow(row, query) {
  const config = AGENT_RESOURCES[query.resource];
  const result = {}; const excerpts = {};
  for (const field of query.fields) {
    const value = fieldValue(row, field, config);
    if (value !== null && (config.textFields.includes(field) || (typeof value === 'string' && !['id', 'status', 'updatedAt', 'createdAt'].includes(field)))) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      result[field] = firstCharacters(text);
      if (result[field].length < text.length) excerpts[field] = { hasMore: true };
    } else result[field] = value;
  }
  if (Object.keys(excerpts).length) result.excerpts = excerpts;
  if (query.resource === 'work-orders') result.versionAvailable = false;
  return result;
}
function bytes(value) { return Buffer.byteLength(JSON.stringify(value)); }
function compareRows(a, b) {
  const at = Date.parse(a.created_at); const bt = Date.parse(b.created_at);
  // Postgres timestamps can include microseconds: retain the original fraction
  // after comparing epoch milliseconds rather than round away a keyset position.
  const micros = (value) => (value.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(3, 6);
  return at - bt || micros(a.created_at).localeCompare(micros(b.created_at)) || a.id.localeCompare(b.id) || (a.kind || '').localeCompare(b.kind || '');
}

async function readOrdinary(query, context, after) {
  const config = AGENT_RESOURCES[query.resource];
  const fields = query.detail === 'summary' ? ['id', 'status', 'updatedAt'] : query.fields;
  const result = await fetchSupabaseRowsDetailed(config.table, {
    select: selectFor(config, fields), filters: [...filtersFor(query, context), ...keysetFilter(after)],
    limit: query.limit + 1, order: query.order, strictRows: true, dedupe: false,
  });
  if (result.error || !Array.isArray(result.rows) || result.rows.some((row) => !validRow(row, context, query.resource !== 'work-orders'))) {
    return { error: true, failedSources: [config.table] };
  }
  const candidates = result.rows.slice(0, query.limit);
  return { candidates, visible: candidates, hasMore: result.rows.length > query.limit, failedSources: [] };
}

const LEAD_META_FIELDS = ['intent', 'program', 'form_name', 'form_id', 'note', 'campaign', 'campaign_name', 'ad_name', 'ad_id', 'source_family'];
function followupSelect(kind) {
  return [
    'workspace_id', 'id', 'created_at', 'updated_at', 'company_id', 'next_action',
    'next_action_at:meta->>next_action_at', 'snooze_until:meta->>snooze_until',
    ...(kind === 'lead' ? ['name', 'status', 'score', 'last_touch_at', 'source', 'channel', 'meta_source:meta->>source', 'meta_channel:meta->>channel', ...LEAD_META_FIELDS.map((key) => `${key}:meta->>${key}`)] : ['title', 'stage', 'amount', 'last_activity_at']),
  ].join(',');
}
function daysSince(value, now) { const ms = Date.parse(value); return Number.isFinite(ms) ? Math.floor((now - ms) / 86400000) : null; }
function deriveFollowup(row, trackingStartedAt, now) {
  if (isSnoozed({ snooze_until: row.snooze_until }, now)) return null;
  const meta = Object.fromEntries(LEAD_META_FIELDS.map((key) => [key, row[key]]));
  meta.source = row.meta_source; meta.channel = row.meta_channel;
  const record = { ...row, meta };
  const stage = row.status;
  const touch = row.last_touch_at || row.last_activity_at || row.updated_at || row.created_at;
  const since = daysSince(touch, now);
  let threshold = STALE_DAYS[stage] ?? 3;
  if (row.kind === 'lead') {
    if (isExplanationLead(record)) threshold = 1;
    else if (isThreadsLead(record)) threshold = 2;
    else if (isMetaAdsLead(record) && stage === 'new') threshold = 1;
  }
  const nextDue = row.next_action_at && (daysSince(row.next_action_at, now) ?? -1) >= 0;
  const beforeCutover = trackingStartedAt && Date.parse(row.created_at) < Date.parse(trackingStartedAt);
  if (beforeCutover && !nextDue) return null;
  const overdue = since === null || since >= threshold;
  if (!overdue && !nextDue) return null;
  const channel = isThreadsLead(record) ? '스레드 DM' : isExplanationLead(record) || isMetaAdsLead(record) ? '문자/전화' : ['proposal', 'negotiation', 'prop', 'neg'].includes(stage) ? '방문' : '전화/문자';
  return {
    ...row, name: row.name || row.title || (row.kind === 'lead' ? '이름미상' : '딜'),
    next_action: row.next_action || (row.kind === 'lead' ? '다음 행동 정하기' : '단계 진전 액션 정하기'),
    last_touch_at: touch, days_since: since, channel,
    why: nextDue && !overdue ? `예약한 연락일 도래 · ${stage}` : `${since === null ? '무접촉' : `${since}일째 ${row.kind === 'lead' ? '무접촉' : '정체'}`} · ${stage}`,
  };
}
async function readFollowups(query, context, after) {
  const workspace = await fetchSupabaseRowsDetailed('workspaces', { select: 'id,contact_tracking_started_at:meta->>contact_tracking_started_at', filters: [['id', `eq.${context.workspaceId}`]], limit: 1, strictRows: true, dedupe: false });
  if (workspace.error || workspace.rows?.length !== 1 || workspace.rows[0].id !== context.workspaceId) return { error: true, failedSources: ['workspaces'] };
  const rawCutover = workspace.rows[0].contact_tracking_started_at;
  const trackingStartedAt = rawCutover && Number.isFinite(Date.parse(rawCutover)) ? new Date(rawCutover).toISOString() : null;
  if (after && after.trackingStartedAt !== trackingStartedAt) throw new AgentInputError('Follow-up tracking configuration changed. Restart the query.', 'invalid-cursor');
  const kinds = query.filters.kind || ['lead', 'deal'];
  const results = await Promise.all(kinds.map(async (kind) => {
    const table = kind === 'lead' ? 'leads' : 'deals';
    const state = kind === 'lead' ? ['status', 'in.(new,qualified,nurturing)'] : ['stage', 'in.(prospect,proposal,negotiation,lead,qualified,qual,neg,prop)'];
    const filters = [['workspace_id', `eq.${context.workspaceId}`], state, ...keysetFilter(after, kind)];
    if (query.filters.companyId) filters.push(['company_id', `eq.${query.filters.companyId}`]);
    if (trackingStartedAt) filters.push(['or', `(created_at.gte.${trackingStartedAt},meta->>next_action_at.not.is.null)`]);
    const result = await fetchSupabaseRowsDetailed(table, { select: followupSelect(kind), filters, limit: query.limit + 1, order: query.order, strictRows: true, dedupe: false });
    const rows = result.rows?.map((row) => ({ ...row, kind, status: kind === 'lead' ? row.status : row.stage }));
    return result.error || !rows || rows.some((row) => !validRow(row, context)) ? { table, error: true, rows: [] } : { table, rows };
  }));
  const failedSources = results.filter((result) => result.error).map((result) => result.table);
  if (failedSources.length === kinds.length) return { error: true, failedSources };
  const all = results.flatMap((result) => result.rows).sort(compareRows);
  const candidates = all.slice(0, query.limit);
  const now = Date.now();
  return { candidates, visible: candidates.map((row) => deriveFollowup(row, trackingStartedAt, now)).filter(Boolean), hasMore: all.length > query.limit, failedSources, trackingStartedAt };
}

function buildQueryResponse(query, result, binding) {
  const partial = result.failedSources.length > 0;
  const asOf = new Date().toISOString();
  let visible = result.visible;
  let trimmed = false;
  while (true) {
    const hasMore = result.hasMore || trimmed;
    const last = trimmed ? visible.at(-1) : result.candidates.at(-1);
    const position = last ? { ...anchor(last), ...(query.resource === 'followups' ? { trackingStartedAt: result.trackingStartedAt } : {}) } : null;
    const nextCursor = hasMore && position && !partial ? sealAgentCursor(position, binding, cursorSecret()) : null;
    const projected = query.detail === 'summary' ? [] : visible.map((row) => projectRow(row, query));
    const body = envelope(query.resource, {
      status: partial ? 'partial' : 'live', asOf, rows: projected, partial, failedSources: result.failedSources,
      truncated: trimmed || projected.some((row) => row.excerpts),
      page: { returnedCount: visible.length, hasMore, nextCursor, totalCount: null },
    });
    if (query.resource === 'followups') {
      Object.assign(body.data, { basis: 'candidate-page', scannedCount: trimmed ? visible.length : result.candidates.length, trackingStartedAt: result.trackingStartedAt, enrichment: 'inactivity and scheduled dates; company details and outreach history are not included' });
      if (partial) body.data.continuationUnavailable = true;
    }
    if (query.detail === 'summary') {
      const byStatus = {};
      for (const row of visible) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      body.data = { ...body.data, basis: query.resource === 'followups' ? 'candidate-page' : 'page', summary: { sampleCount: visible.length, byStatus } };
      delete body.data.rows;
    }
    if (bytes(body) <= AGENT_RESPONSE_LIMITS[query.detail]) return { httpStatus: 200, data: body };
    if (visible.length <= 1) return failure(query.resource, 'response-limit-exceeded', 200, [AGENT_RESOURCES[query.resource].table || query.resource]);
    visible = visible.slice(0, -1); trimmed = true;
  }
}

export async function queryAgentData(input, context) {
  if (!contextAllowed(context)) return failure(null, 'agent-scope-denied', 403);
  let query;
  try {
    query = parseAgentQuery(input);
    const binding = bindingFor(query, context, 'query');
    const after = query.cursor ? openAgentCursor(query.cursor, binding, cursorSecret()) : null;
    if (after && !validAnchor(after)) throw new AgentInputError('Invalid cursor position.', 'invalid-cursor');
    const config = resolveSupabaseConfig();
    if (!config) return preview(query.resource);
    const key = agentHash({ binding, cursor: query.cursor, config, cursorKey: agentHash(cursorSecret()) });
    if (!query.fresh) {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) return structuredClone(hit.result);
      if (hit) cache.delete(key);
      const existing = inflight.get(key);
      if (existing) return structuredClone(await existing.promise);
    }
    if (query.fresh) cache.delete(key);
    const readGeneration = generation;
    const entry = { workspaceId: context.workspaceId, resource: query.resource, promise: null };
    const run = async () => {
      const result = query.resource === 'followups' ? await readFollowups(query, context, after) : await readOrdinary(query, context, after);
      const response = result.error ? failure(query.resource, 'agent-source-read-failed', 200, result.failedSources) : buildQueryResponse(query, result, binding);
      if (response.data.status === 'live' && generation === readGeneration && inflight.get(key) === entry) {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { workspaceId: context.workspaceId, resource: query.resource, expiresAt: Date.now() + CACHE_TTL_MS, result: structuredClone(response) });
      }
      return response;
    };
    const promise = run();
    entry.promise = promise;
    inflight.set(key, entry);
    try { return structuredClone(await promise); }
    finally { if (inflight.get(key) === entry) inflight.delete(key); }
  } catch (error) {
    return failure(query?.resource || null, error instanceof AgentInputError ? error.code : 'agent-source-read-failed', error instanceof AgentInputError ? 400 : 200, error instanceof AgentInputError ? [] : [query?.resource || 'unknown']);
  }
}

function safeEnd(text, offset, length) {
  let end = Math.min(text.length, offset + length);
  if (end < text.length && end > offset && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  return end;
}
function buildEntityResponse(query, row, binding, after) {
  const config = AGENT_RESOURCES[query.resource];
  const entity = projectRow(row, query);
  const revision = agentHash(row);
  if (after && after.revision !== revision) return failure(query.resource, 'entity-changed', 409);
  const values = query.fields.filter((field) => config.textFields.includes(field)).map((field) => {
    const value = fieldValue(row, field, config);
    return { field, text: value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value), encoding: typeof value === 'object' && value !== null ? 'json' : 'text' };
  });
  let index = after?.index ?? 0; let offset = after?.offset ?? 0;
  if (!Number.isInteger(index) || index < 0 || index > values.length || !Number.isInteger(offset) || offset < 0 || offset > (values[index]?.text.length ?? 0)) throw new AgentInputError('Invalid section cursor.', 'invalid-cursor');
  const body = envelope(query.resource);
  body.data = { resource: query.resource, entity, sections: [], nextSectionCursor: null };
  body.page.returnedCount = 1;
  if (query.detail !== 'full') {
    body.truncated = Boolean(entity.excerpts);
    return bytes(body) <= AGENT_RESPONSE_LIMITS[query.detail] ? { httpStatus: 200, data: body } : failure(query.resource, 'response-limit-exceeded', 200, [config.table]);
  }
  const cursorAt = (nextIndex, nextOffset) => nextIndex < values.length ? sealAgentCursor({ revision, index: nextIndex, offset: nextOffset }, binding, cursorSecret()) : null;
  while (index < values.length) {
    const value = values[index];
    if (offset === value.text.length) { index += 1; offset = 0; continue; }
    let low = 0; let high = Math.min(value.text.length - offset, AGENT_RESPONSE_LIMITS.full);
    let best = null;
    while (low <= high) {
      const count = Math.floor((low + high) / 2);
      const end = safeEnd(value.text, offset, count);
      const finished = end === value.text.length;
      const section = { field: value.field, text: value.text.slice(offset, end), encoding: value.encoding, offset, hasMore: !finished };
      const candidate = { ...body, truncated: !finished || index + 1 < values.length, data: { ...body.data, sections: [...body.data.sections, section], nextSectionCursor: cursorAt(finished ? index + 1 : index, finished ? 0 : end) } };
      if (bytes(candidate) <= AGENT_RESPONSE_LIMITS.full) { best = { candidate, end }; low = count + 1; } else high = count - 1;
    }
    if (!best || best.end === offset) {
      body.truncated = true; body.data.nextSectionCursor = cursorAt(index, offset); break;
    }
    Object.assign(body, best.candidate);
    if (best.end < value.text.length) break;
    index += 1; offset = 0;
  }
  if (index === values.length) { body.truncated = false; body.data.nextSectionCursor = null; }
  if (bytes(body) > AGENT_RESPONSE_LIMITS.full) return failure(query.resource, 'response-limit-exceeded', 200, [config.table]);
  return { httpStatus: 200, data: body };
}

export async function getAgentEntity(type, id, input = {}, context) {
  if (!contextAllowed(context)) return failure(null, 'agent-scope-denied', 403);
  let query;
  try {
    query = parseAgentEntityQuery(type, id, input);
    const binding = bindingFor(query, context, 'entity');
    const after = query.nextSectionCursor ? openAgentCursor(query.nextSectionCursor, binding, cursorSecret()) : null;
    if (!resolveSupabaseConfig()) return preview(query.resource);
    const config = AGENT_RESOURCES[query.resource];
    // Detail is intentionally fresh: a subsequent command must use this exact
    // database version. This also validates section cursors against current text.
    const result = await fetchSupabaseRowsDetailed(config.table, { select: selectFor(config, query.fields), filters: [['workspace_id', `eq.${context.workspaceId}`], ['id', `eq.${id}`]], limit: 1, strictRows: true, dedupe: false });
    if (result.error || !Array.isArray(result.rows)) return failure(query.resource, 'agent-source-read-failed', 200, [config.table]);
    if (!result.rows.length) return failure(query.resource, 'entity-not-found', 404);
    const row = result.rows[0];
    if (row.id !== id || !validRow(row, context, query.resource !== 'work-orders')) return failure(query.resource, 'agent-source-read-failed', 200, [config.table]);
    return buildEntityResponse(query, row, binding, after);
  } catch (error) {
    return failure(query?.resource || null, error instanceof AgentInputError ? error.code : 'agent-source-read-failed', error instanceof AgentInputError ? 400 : 200, error instanceof AgentInputError ? [] : [query?.resource || 'unknown']);
  }
}
