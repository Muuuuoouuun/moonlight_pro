import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';
import { isJournalTimestamp, journalContextHref, JOURNAL_NOTE_KINDS } from '../journal.js';
import { JOURNAL_SEARCH_DEFAULTS, normalizeJournalSearch } from '../journal-search.js';

const failure = (base, error = 'read-failed') => ({ ...base, status: 'error', context: null, entries: [], nextCursor: null, error, message: error === 'invalid-input' ? '검색어와 기간, 연결 조건을 확인해 주세요.' : '메모를 찾지 못했어요. 다시 시도해 주세요.' });
const fingerprint = (workspaceId, filters, limit) => createHash('sha256').update(JSON.stringify({ workspaceId, filters, limit })).digest('hex');
const signature = (payload, key) => createHmac('sha256', key).update(payload).digest('base64url');
function encodeCursor(last, scope, key) {
  const payload = Buffer.from(JSON.stringify({ v: 1, scope, before: last.occurredAt, beforeId: last.id })).toString('base64url');
  return `${payload}.${signature(payload, key)}`;
}
function decodeCursor(cursor, scope, key) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(cursor)) return null;
  const [payload, mac] = cursor.split('.');
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(signature(payload, key)))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return value?.v === 1 && value.scope === scope && isJournalTimestamp(value.before)
      && isCanonicalUuid(value.beforeId) && value.beforeId === value.beforeId.toLowerCase() ? value : null;
  } catch { return null; }
}
// Date.parse truncates PostgreSQL microseconds. Keep them for stable same-time paging.
function timestampMicros(value) {
  const fraction = /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '';
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3));
}
function precedes(a, b) {
  const timeA = timestampMicros(a.occurredAt), timeB = timestampMicros(b.occurredAt);
  return timeA > timeB || (timeA === timeB && a.id > b.id);
}
function summary(row, workspaceId, filters) {
  if (!row || row.workspace_id !== workspaceId || row.entry_kind !== 'note' || !isCanonicalUuid(row.id)
    || row.id !== row.id.toLowerCase() || typeof row.title !== 'string' || row.title.length > 200
    || typeof row.excerpt !== 'string' || [...row.excerpt].length > 180 || !isJournalTimestamp(row.occurredAt) || !isJournalTimestamp(row.updatedAt)
    || !JOURNAL_NOTE_KINDS.includes(row.noteMeta?.kind) || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.used !== 'boolean') return null;
  if ((filters.kind && row.noteMeta.kind !== filters.kind) || (filters.used === 'used' && !row.used) || (filters.used === 'unused' && row.used)) return null;
  const match = row.match;
  if (!filters.q ? match !== null : !match || !['title', 'body', 'enhancement'].includes(match.field) || typeof match.text !== 'string' || !match.text || [...match.text].length > 180) return null;
  return { id: row.id, title: row.title, excerpt: row.excerpt, occurredAt: row.occurredAt, updatedAt: row.updatedAt,
    noteMeta: { kind: row.noteMeta.kind }, revision: row.revision, match: match ? { field: match.field, text: match.text } : null, used: row.used };
}

export async function getJournalSearch(input = {}) {
  const config = resolveSupabaseConfig(), configuredWorkspace = resolveDefaultWorkspaceId();
  let base = { configured: Boolean(config && configuredWorkspace), workspaceId: isCanonicalUuid(configuredWorkspace) ? configuredWorkspace.toLowerCase() : null, filters: { ...JOURNAL_SEARCH_DEFAULTS } };
  const validation = normalizeJournalSearch(input);
  if (!validation.ok) return failure(base, 'invalid-input');
  const { filters, dateFromAt, dateToAt, limit, cursor } = validation.value;
  base = { ...base, filters };
  try {
    const scope = fingerprint(base.workspaceId, filters, limit);
    const before = cursor && config ? decodeCursor(cursor, scope, config.apiKey) : null;
    if (cursor && !before) return failure(base, 'invalid-input');
    if (!base.configured) return { ...base, status: 'preview', context: null, entries: [], nextCursor: null };
    if (!base.workspaceId) return failure(base);
    const result = await invokeSupabaseRpc('journal_search_v1', {
      p_workspace_id: base.workspaceId, p_query: filters.q, p_date_from: dateFromAt, p_date_to: dateToAt,
      p_kind: filters.kind, p_context_type: filters.contextType, p_context_id: filters.contextId || null, p_used: filters.used,
      p_before: before?.before ?? null, p_before_id: before?.beforeId ?? null, p_limit: limit,
    });
    const data = result.data;
    if (!result.ok || data?.status !== 'live' || data.workspaceId !== base.workspaceId || !Array.isArray(data.entries) || data.entries.length > limit + 1) return failure(base);
    let context = null;
    if (filters.contextType) {
      const value = data.context;
      if (!value || value.type !== filters.contextType || value.id !== filters.contextId || typeof value.label !== 'string'
        || value.href !== journalContextHref(value.type, value.id)) return failure(base);
      context = { type: value.type, id: value.id, label: value.label, href: value.href };
    } else if (data.context !== null) return failure(base);
    const rows = data.entries.map(row => summary(row, base.workspaceId, filters));
    if (rows.some(row => !row) || new Set(rows.map(row => row.id)).size !== rows.length
      || rows.some((row, index) => (index > 0 && !precedes(rows[index - 1], row))
        || (before && !precedes({ occurredAt: before.before, id: before.beforeId }, row))
        || (dateFromAt && timestampMicros(row.occurredAt) < timestampMicros(dateFromAt))
        || (dateToAt && timestampMicros(row.occurredAt) >= timestampMicros(dateToAt)))) return failure(base);
    const entries = rows.slice(0, limit);
    return { ...base, status: 'live', context, entries, nextCursor: rows.length > limit ? encodeCursor(entries.at(-1), scope, config.apiKey) : null };
  } catch { return failure(base); }
}
