import { fetchSupabaseRowsDetailed, countSupabaseRows, eqFilter } from '../server-read.js';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '../server-write.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dependencies = { config: resolveSupabaseConfig, read: fetchSupabaseRowsDetailed, count: countSupabaseRows };
const empty = (status, error = null) => ({ status, source: status === 'live' ? 'supabase' : status, rows: [], total: null, unreadCount: null, hasMore: false, error, retryable: status === 'error' });
const clamp = (n, fallback, max) => Number.isSafeInteger(Number(n)) && Number(n) > 0 ? Math.min(Number(n), max) : fallback;

export function inquiryFilters({ workspaceId, scope = 'all', source = 'all', kind = 'all', filter = 'active' } = {}) {
  if (!UUID.test(workspaceId || '')) throw new Error('invalid-workspace');
  if (!['all', 'classin', 'personal', 'unclassified'].includes(scope) || !['all', 'gmail', 'webhook', 'manual'].includes(source)
      || !['all', 'sales', 'support', 'partnership', 'general'].includes(kind) || !['all', 'active', 'closed', 'ignored', 'unread'].includes(filter)) throw new Error('invalid-filter');
  const filters = [['workspace_id', eqFilter(workspaceId)]];
  if (scope !== 'all') filters.push(['org_scope', eqFilter(scope)]);
  if (source !== 'all') filters.push(['sources', `cs.{${source}}`]);
  if (kind !== 'all') filters.push(['kind', eqFilter(kind)]);
  if (filter === 'active') filters.push(['status', 'in.(new,in_progress,waiting)']);
  else if (filter === 'unread') filters.push(['unread', 'eq.true'], ['status', 'in.(new,in_progress,waiting)'], ['classification', 'neq.ignored']);
  else if (filter !== 'all') filters.push(['status', eqFilter(filter)]);
  return filters;
}

export async function getInquiriesLedger(options = {}, deps = dependencies) {
  const workspaceId = options.workspaceId || resolveDefaultWorkspaceId();
  if (!workspaceId || !deps.config()) return empty('preview');
  try {
    const filters = inquiryFilters({ ...options, workspaceId });
    const unreadFilters = inquiryFilters({ ...options, workspaceId, filter: 'unread' });
    const page = clamp(options.page, 1, 100000), pageSize = clamp(options.pageSize, 25, 100);
    const [result, unreadCount] = await Promise.all([
      deps.read('inquiries', { filters: [...filters, ['offset', String((page - 1) * pageSize)]], order: 'received_at.desc,id.desc', limit: pageSize, count: 'exact' }),
      deps.count('inquiries', unreadFilters),
    ]);
    if (!Array.isArray(result?.rows) || !Number.isFinite(result.count) || !Number.isFinite(unreadCount)) return empty('error', 'inquiries-read-failed');
    return { status: 'live', source: 'supabase', rows: result.rows, total: result.count, unreadCount, page, pageSize, hasMore: page * pageSize < result.count };
  } catch (error) {
    return empty('error', ['invalid-filter', 'invalid-workspace'].includes(error.message) ? error.message : 'inquiries-read-failed');
  }
}

export async function getInquiryDetail(id, options = {}, deps = dependencies) {
  const workspaceId = options.workspaceId || resolveDefaultWorkspaceId();
  if (!workspaceId || !deps.config()) return { ...empty('preview'), inquiry: null, events: [] };
  if (!UUID.test(id || '') || !UUID.test(workspaceId)) return { ...empty('error', 'invalid-id'), inquiry: null, events: [] };
  try {
    const parent = await deps.read('inquiries', { filters: [['workspace_id', eqFilter(workspaceId)], ['id', eqFilter(id)]], limit: 1 });
    if (!Array.isArray(parent?.rows)) return { ...empty('error', 'inquiry-read-failed'), inquiry: null, events: [] };
    if (!parent.rows[0]) return { ...empty('not-found'), inquiry: null, events: [] };
    const eventPage = clamp(options.eventPage, 1, 100000);
    const referenceTypes = [['lead_id', 'leads', 'name', '리드', 'lead'], ['deal_id', 'deals', 'name', '거래', 'deal'], ['case_id', 'operation_cases', 'title', '지원 건', 'case']];
    const [events, links] = await Promise.all([
      deps.read('inquiry_events', { filters: [['workspace_id', eqFilter(workspaceId)], ['inquiry_id', eqFilter(id)], ['offset', String((eventPage - 1) * 25)]], order: 'received_at.desc,inbound_seq.desc,id.desc', limit: 25, count: 'exact' }),
      Promise.all(referenceTypes.filter(([field]) => parent.rows[0][field]).map(async ([field, table, label, typeLabel, type]) => {
        const referenceId = parent.rows[0][field];
        try {
          const result = await deps.read(table, { select: `id,${label}`, filters: [['workspace_id', eqFilter(workspaceId)], ['id', eqFilter(referenceId)]], limit: 1 });
          const row = result?.rows?.[0];
          return { id: referenceId, type, typeLabel, label: row?.[label] || '이름 없음', status: row ? 'live' : Array.isArray(result?.rows) ? 'not-found' : 'error', href: `dashboard/revenue/${type}s?${type}=${referenceId}` };
        } catch { return { id: referenceId, type, typeLabel, status: 'error' }; }
      })),
    ]);
    if (!Array.isArray(events?.rows) || !Number.isFinite(events.count)) return { ...empty('error', 'inquiry-events-read-failed'), inquiry: parent.rows[0], events: [] };
    return { status: 'live', source: 'supabase', inquiry: parent.rows[0], events: events.rows, links, eventPage, eventTotal: events.count, hasMoreEvents: eventPage * 25 < events.count };
  } catch { return { ...empty('error', 'inquiry-read-failed'), inquiry: null, events: [] }; }
}

export async function getInquirySyncStatus({ workspaceId = resolveDefaultWorkspaceId() } = {}) {
  if (!workspaceId || !resolveSupabaseConfig()) return { status: 'preview', connections: [] };
  try {
    const r = await fetchSupabaseRowsDetailed('inquiry_sync_states', { select: 'account_key,last_success_at,last_error,updated_at,state', filters: [['workspace_id', eqFilter(workspaceId)]], limit: 10 });
    if (!Array.isArray(r.rows)) return { status: 'error', error: 'inquiry-sync-status-failed', connections: [] };
    return { status: 'live', connections: r.rows.map(({ state, ...row }) => ({ ...row, phase: state?.phase, recoverySince: state?.recoverySince, recoveryNotice: state?.recoveryNotice, pending: state?.pending?.length || 0 })) };
  } catch { return { status: 'error', error: 'inquiry-sync-status-failed', connections: [] }; }
}

export async function getInquiryReferences({ workspaceId = resolveDefaultWorkspaceId(), query = '' } = {}, deps = dependencies) {
  if (!workspaceId || !deps.config()) return { status: 'preview', leads: [], deals: [], cases: [] };
  if (!UUID.test(workspaceId)) return { status: 'error', error: 'invalid-workspace' };
  // Quoted PostgREST operands prevent punctuation from becoming query syntax.
  const term = String(query).trim().slice(0, 100).replace(/[\\%_*]/g, '');
  try {
    const results = await Promise.all([['leads', 'name'], ['deals', 'name'], ['operation_cases', 'title']].map(([table, label]) => deps.read(table, {
      select: `id,${label}`, filters: [['workspace_id', eqFilter(workspaceId)], ...(term ? [[label, `ilike.${JSON.stringify(`*${term}*`)}`]] : [])],
      order: `${label}.asc.nullslast,id.asc`, limit: 51,
    })));
    if (results.some(r => !Array.isArray(r?.rows))) return { status: 'error', error: 'inquiry-references-read-failed' };
    return { status: 'live', leads: results[0].rows.slice(0, 50), deals: results[1].rows.slice(0, 50), cases: results[2].rows.slice(0, 50), hasMore: results.some(r => r.rows.length > 50) };
  } catch { return { status: 'error', error: 'inquiry-references-read-failed' }; }
}
