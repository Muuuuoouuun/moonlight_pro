import { eqFilter, fetchSupabaseRows } from '@/lib/server-read';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';
import { isJournalTimestamp, journalContextHref, JOURNAL_CONTEXT_TYPES, validateJournalInput } from '../journal.js';

const NOTE_SELECT = 'id,workspace_id,entry_kind,body,title,occurred_at,note_meta,note_revision,updated_at';
const CONTEXT_TABLES = { project: 'projects', lead: 'leads', account: 'customer_accounts', brand: 'brands' };
const CONFLICT_ERRORS = new Set(['request-id-reused', 'stale-revision', 'selection-changed', 'entry-exists', 'revision-without-note', 'note-no-longer-exists']);
const baseEnvelope = () => ({ configured: Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()), workspaceId: isCanonicalUuid(resolveDefaultWorkspaceId()) ? resolveDefaultWorkspaceId().toLowerCase() : null });
const readError = (base) => ({ ...base, status: 'error', entries: [], entry: null, nextCursor: null, error: 'read-failed', message: '메모를 불러오지 못했어요. 다시 시도해 주세요.' });
const searchError = (base) => ({ ...base, status: 'error', contexts: [], hasMore: false, error: 'read-failed', message: '연결 대상을 불러오지 못했어요. 다시 시도해 주세요.' });
const writeError = (base, httpStatus = 502) => ({ ...base, status: 'error', entry: null, httpStatus, error: httpStatus === 503 ? 'missing-persistence' : 'save-failed', retryable: true, message: '저장을 확인하지 못했어요. 같은 요청으로 다시 시도해 주세요.' });

async function resolveContext() {
  const base = baseEnvelope();
  if (!base.configured) return { ...base, status: 'preview' };
  if (!base.workspaceId) return { ...base, status: 'error' };
  const rows = await fetchSupabaseRows('workspaces', { select: 'id', filters: [['id', eqFilter(base.workspaceId)]], limit: 1 });
  return { ...base, status: Array.isArray(rows) && rows.length === 1 && rows[0].id === base.workspaceId ? 'live' : 'error' };
}

function contextFromValue(value) {
  if (!value || !JOURNAL_CONTEXT_TYPES.includes(value.type) || !isCanonicalUuid(value.id) || typeof value.label !== 'string'
    || (value.href !== null && value.href !== journalContextHref(value.type, value.id))) return null;
  return { type: value.type, id: value.id, label: value.label, href: value.href };
}
function targetHref(type, id, variantId) {
  if (!isCanonicalUuid(id)) return null;
  if (type === 'task') return `/dashboard/work/my?task=${id}`;
  if (type === 'content' && isCanonicalUuid(variantId)) return `/dashboard/content/studio?item=${id}&variant=${variantId}`;
  return null;
}
function useLinkFromValue(value) {
  if (!value || !isCanonicalUuid(value.id) || !isCanonicalUuid(value.targetId)
    || !['task', 'content'].includes(value.targetType) || typeof value.title !== 'string'
    || typeof value.excerpt !== 'string' || !value.excerpt.trim() || value.excerpt.length > 3500
    || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 1 || !isJournalTimestamp(value.createdAt)) return null;
  const variant = typeof value.href === 'string' ? /&variant=([0-9a-f-]{36})$/.exec(value.href)?.[1] : null;
  if (value.href !== targetHref(value.targetType, value.targetId, variant)) return null;
  return { id: value.id, targetType: value.targetType, targetId: value.targetId, title: value.title, href: value.href, excerpt: value.excerpt, sourceRevision: value.sourceRevision, createdAt: value.createdAt };
}
function entryFromRow(row, workspaceId, detail = false) {
  if (!row || row.workspace_id !== workspaceId || row.entry_kind !== 'note' || !isCanonicalUuid(row.id)
    || !Number.isSafeInteger(row.note_revision) || row.note_revision < 1 || !isJournalTimestamp(row.updated_at)) return null;
  const validation = validateJournalInput({ action: 'save', requestId: row.id, entryId: row.id, expectedRevision: 0, body: row.body, title: row.title ?? '', occurredAt: row.occurred_at, noteMeta: row.note_meta, contexts: [] });
  if (!validation.ok) return null;
  const common = { id: row.id, title: row.title ?? '', occurredAt: row.occurred_at, noteMeta: detail ? validation.value.noteMeta : { kind: validation.value.noteMeta.kind }, revision: row.note_revision, updatedAt: row.updated_at };
  if (!detail) return { ...common, excerpt: row.body.slice(0, 180) };
  if (!Array.isArray(row.contexts) || !Array.isArray(row.links)) return null;
  const contexts = row.contexts.map(contextFromValue), links = row.links.map(useLinkFromValue);
  if (contexts.some((v) => !v) || links.some((v) => !v || v.sourceRevision > row.note_revision)
    || new Set(contexts.map((v) => `${v.type}:${v.id}`)).size !== contexts.length
    || new Set(links.map((v) => v.id)).size !== links.length) return null;
  return { ...common, body: row.body, contexts, links };
}

async function readDetail(row, workspaceId) {
  const rows = await fetchSupabaseRows('journal_links', {
    select: 'id,workspace_id,journal_id,link_kind,target_type,target_id,title,href,excerpt,source_revision,created_at',
    filters: [['workspace_id', eqFilter(workspaceId)], ['journal_id', eqFilter(row.id)]], order: 'created_at.asc,id.asc', limit: 1000,
  });
  if (!Array.isArray(rows) || rows.length >= 1000 || rows.some((r) => r.workspace_id !== workspaceId || r.journal_id !== row.id || !isCanonicalUuid(r.id))) return null;
  const contextRows = rows.filter((r) => r.link_kind === 'context');
  if (contextRows.length > 20 || rows.some((r) => !['context', 'use'].includes(r.link_kind))) return null;
  const contexts = await Promise.all(contextRows.map(async (link) => {
    if (!JOURNAL_CONTEXT_TYPES.includes(link.target_type) || !isCanonicalUuid(link.target_id)) throw new Error('invalid-context');
    const contextRows = await fetchSupabaseRows(CONTEXT_TABLES[link.target_type], {
      select: 'id,workspace_id,name', filters: [['workspace_id', eqFilter(workspaceId)], ['id', eqFilter(link.target_id)]], limit: 2,
    });
    if (!Array.isArray(contextRows) || contextRows.length > 1) throw new Error('context-read-failed');
    const context = contextRows.find((r) => r.id === link.target_id && r.workspace_id === workspaceId);
    return { type: link.target_type, id: link.target_id, label: context ? (context.name || '이름 없음') : '연결 대상 없음', href: context ? journalContextHref(link.target_type, link.target_id) : null };
  }));
  const links = rows.filter((r) => r.link_kind === 'use').map((r) => ({ id: r.id, targetType: r.target_type, targetId: r.target_id, title: r.title, href: r.href, excerpt: r.excerpt, sourceRevision: r.source_revision, createdAt: r.created_at }));
  return entryFromRow({ ...row, contexts, links }, workspaceId, true);
}

export async function getJournalLedger({ note = null, before = null, beforeId = null } = {}) {
  let base = baseEnvelope();
  if ((note !== null && !isCanonicalUuid(note)) || (before === null) !== (beforeId === null)
    || (before !== null && (!isJournalTimestamp(before) || !isCanonicalUuid(beforeId)))) return readError(base);
  try {
    const context = await resolveContext();
    base = { configured: context.configured, workspaceId: context.workspaceId };
    if (context.status === 'preview') return { ...base, status: 'preview', entries: [], entry: null, nextCursor: null };
    if (context.status !== 'live') return readError(base);
    const filters = [['workspace_id', eqFilter(base.workspaceId)], ['entry_kind', eqFilter('note')]];
    const cursor = before === null ? [] : [['or', `(occurred_at.lt.${before},and(occurred_at.eq.${before},id.lt.${beforeId.toLowerCase()}))`]];
    const [rows, selected] = await Promise.all([
      fetchSupabaseRows('journal_entries', { select: NOTE_SELECT, filters: [...filters, ...cursor], order: 'occurred_at.desc,id.desc', limit: 41 }),
      note === null ? Promise.resolve([]) : fetchSupabaseRows('journal_entries', { select: NOTE_SELECT, filters: [...filters, ['id', eqFilter(note.toLowerCase())]], limit: 2 }),
    ]);
    if (!Array.isArray(rows) || rows.length > 41 || !Array.isArray(selected) || selected.length > 1) return readError(base);
    const summaries = rows.map((r) => entryFromRow(r, base.workspaceId));
    if (summaries.some((v) => !v) || new Set(summaries.map((v) => v.id)).size !== summaries.length) return readError(base);
    let entry = null;
    if (selected.length) {
      if (selected[0].id !== note.toLowerCase() || !entryFromRow(selected[0], base.workspaceId)) return readError(base);
      entry = await readDetail(selected[0], base.workspaceId);
      if (!entry) return readError(base);
    }
    const entries = summaries.slice(0, 40), last = entries.at(-1);
    return { ...base, status: 'live', entries, entry, nextCursor: rows.length > 40 ? { before: last.occurredAt, beforeId: last.id } : null };
  } catch { return readError(base); }
}

export async function getJournalContexts({ type = null, q = '', id = null } = {}) {
  let base = baseEnvelope();
  if (!JOURNAL_CONTEXT_TYPES.includes(type) || typeof q !== 'string' || q.length > 200 || (id !== null && !isCanonicalUuid(id))) return searchError(base);
  try {
    const context = await resolveContext();
    base = { configured: context.configured, workspaceId: context.workspaceId };
    if (context.status === 'preview') return { ...base, status: 'preview', contexts: [], hasMore: false };
    if (context.status !== 'live') return searchError(base);
    // Bound SQL parameters preserve literal %, _, backslash and * search text.
    const result = await invokeSupabaseRpc('journal_context_search_v1', { p_workspace_id: base.workspaceId, p_type: type, p_query: q, p_id: id?.toLowerCase() ?? null });
    const data = result.data;
    if (!result.ok || data?.status !== 'live' || data.workspaceId !== base.workspaceId || !Array.isArray(data.contexts)
      || data.contexts.length > (id ? 1 : 30) || typeof data.hasMore !== 'boolean') return searchError(base);
    const contexts = data.contexts.map(contextFromValue);
    if (contexts.some((v) => !v || v.type !== type || (id && v.id !== id.toLowerCase()))
      || new Set(contexts.map((v) => v.id)).size !== contexts.length) return searchError(base);
    return { ...base, status: 'live', contexts, hasMore: data.hasMore };
  } catch { return searchError(base); }
}

export async function writeJournal(payload) {
  const validation = validateJournalInput(payload);
  if (!validation.ok) return { status: 'invalid-input', httpStatus: 400, entry: null, error: validation.error, message: validation.message, retryable: false };
  let base = baseEnvelope();
  try {
    const context = await resolveContext();
    base = { configured: context.configured, workspaceId: context.workspaceId };
    if (context.status !== 'live') return writeError(base, context.status === 'preview' ? 503 : 502);
    const { requestId, ...command } = validation.value;
    const result = await invokeSupabaseRpc('journal_workflow_v1', { p_workspace_id: base.workspaceId, p_request_id: requestId, p_command: command });
    const data = result.data;
    if (!result.ok || !['saved', 'duplicate', 'conflict', 'invalid-input'].includes(data?.status)) return writeError(base);
    if (data.status === 'invalid-input') return { ...base, status: 'invalid-input', httpStatus: 400, entry: null, error: 'invalid-input', message: '메모 입력과 연결 대상을 확인해 주세요.', retryable: false };
    const entry = data.entry === null ? null : entryFromRow(data.entry, base.workspaceId, true);
    if ((data.entry !== null && !entry) || (entry && entry.id !== command.entryId)) return writeError(base);
    if (data.status === 'conflict') return { ...base, status: 'conflict', httpStatus: 409, entry, error: CONFLICT_ERRORS.has(data.error) ? data.error : 'revision-conflict', retryable: false, message: '다른 저장 내용이 있어요. 현재 기록을 확인한 뒤 다시 시도해 주세요.' };
    if (!entry) return writeError(base);
    if (command.action === 'save') return { ...base, status: data.status, entry };
    const link = useLinkFromValue(data.link), target = data.target;
    if (!link || !target || target.type !== (command.action === 'create_task' ? 'task' : 'content')
      || !targetHref(target.type, target.id, target.variantId) || target.href !== targetHref(target.type, target.id, target.variantId)
      || typeof target.title !== 'string' || link.targetId !== target.id || link.targetType !== target.type
      || link.href !== target.href || link.excerpt !== command.selection.text || link.sourceRevision !== command.expectedRevision
      || !entry.links.some((v) => v.id === link.id)) return writeError(base);
    return { ...base, status: data.status, entry, link, target: { type: target.type, id: target.id, ...(target.type === 'content' ? { variantId: target.variantId } : {}), href: target.href, title: target.title } };
  } catch { return writeError(base); }
}
