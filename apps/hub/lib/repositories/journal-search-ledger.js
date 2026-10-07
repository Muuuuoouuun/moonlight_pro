import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { eqFilter, fetchSupabaseRows } from '@/lib/server-read';
import { isCanonicalUuid } from '../uuid.js';
import { isJournalTimestamp, journalContextHref, JOURNAL_NOTE_KINDS, JOURNAL_SCOPES } from '../journal.js';
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
  if (!filters.q ? match !== null : !match || !['title', 'body', 'enhancement', 'tags'].includes(match.field) || typeof match.text !== 'string' || !match.text || [...match.text].length > 180) return null;
  return { id: row.id, title: row.title, excerpt: row.excerpt, occurredAt: row.occurredAt, updatedAt: row.updatedAt,
    noteMeta: { kind: row.noteMeta.kind }, revision: row.revision, match: match ? { field: match.field, text: match.text } : null, used: row.used };
}

// journal_search_v1 returns kind only. Read the existing JSON metadata with the
// same workspace/IDs and revision before classifying; never infer a legacy scope.
async function attachScopes(rows, workspaceId) {
  if (!rows.length) return rows;
  const metadata = await fetchSupabaseRows('journal_entries', {
    select: 'id,workspace_id,entry_kind,note_meta,note_revision',
    filters: [['workspace_id', eqFilter(workspaceId)], ['entry_kind', eqFilter('note')], ['id', `in.(${rows.map(row => row.id).join(',')})`]],
    limit: rows.length,
  });
  if (!Array.isArray(metadata) || metadata.length !== rows.length) throw Error('scope-read-failed');
  const byId = new Map();
  for (const row of metadata) {
    const source = rows.find(entry => entry.id === row.id);
    if (!source || byId.has(row.id) || row.workspace_id !== workspaceId || row.entry_kind !== 'note'
      || row.note_revision !== source.revision || row.note_meta?.kind !== source.noteMeta.kind
      || (row.note_meta.scope !== undefined && !JOURNAL_SCOPES.includes(row.note_meta.scope))) throw Error('scope-read-failed');
    byId.set(row.id, row.note_meta.scope);
  }
  return rows.map(row => ({ ...row, noteMeta: { ...row.noteMeta, ...(byId.get(row.id) === undefined ? {} : { scope: byId.get(row.id) }) } }));
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
    const entries = [];
    let position = before, context = null, hasMore = false, last = null;
    // Filter existing RPC pages rather than adding a SQL contract. Bound the scan
    // and disclose a partial result with a continuation when matches are sparse.
    for (let page = 0; page < (filters.noteScope ? 8 : 1); page++) {
      const result = await invokeSupabaseRpc('journal_search_v1', {
        p_workspace_id: base.workspaceId, p_query: filters.q, p_date_from: dateFromAt, p_date_to: dateToAt,
        p_kind: filters.kind, p_context_type: filters.contextType, p_context_id: filters.contextId || null, p_used: filters.used,
        p_before: position?.before ?? null, p_before_id: position?.beforeId ?? null, p_limit: limit,
      });
      const data = result.data;
      if (!result.ok || data?.status !== 'live' || data.workspaceId !== base.workspaceId || !Array.isArray(data.entries) || data.entries.length > limit + 1) return failure(base);
      if (filters.contextType) {
        const value = data.context;
        if (!value || value.type !== filters.contextType || value.id !== filters.contextId || typeof value.label !== 'string'
          || value.href !== journalContextHref(value.type, value.id)) return failure(base);
        context = { type: value.type, id: value.id, label: value.label, href: value.href };
      } else if (data.context !== null) return failure(base);
      let rows = data.entries.map(row => summary(row, base.workspaceId, filters));
      if (rows.some(row => !row) || new Set(rows.map(row => row.id)).size !== rows.length
        || rows.some((row, index) => (index > 0 && !precedes(rows[index - 1], row))
          || (position && !precedes({ occurredAt: position.before, id: position.beforeId }, row))
          || (dateFromAt && timestampMicros(row.occurredAt) < timestampMicros(dateFromAt))
          || (dateToAt && timestampMicros(row.occurredAt) >= timestampMicros(dateToAt)))) return failure(base);
      rows = await attachScopes(rows, base.workspaceId);
      hasMore = rows.length > limit;
      for (let index = 0; index < Math.min(limit, rows.length); index++) {
        const row = rows[index]; last = row;
        if (!filters.noteScope || (filters.noteScope === 'unclassified' ? row.noteMeta.scope === undefined : row.noteMeta.scope === filters.noteScope)) entries.push(row);
        if (entries.length === limit) {
          hasMore = hasMore || index < rows.length - 1;
          break;
        }
      }
      if (entries.length === limit || !hasMore) break;
      position = { before: last.occurredAt, beforeId: last.id };
    }
    return { ...base, status: hasMore && entries.length < limit ? 'partial' : 'live', context, entries,
      nextCursor: hasMore && last ? encodeCursor(last, scope, config.apiKey) : null,
      ...(hasMore && entries.length < limit ? { message: '범위 조건으로 일부 기록을 확인했어요. 더 보기로 이어서 찾을 수 있습니다.' } : {}) };
  } catch { return failure(base); }
}
