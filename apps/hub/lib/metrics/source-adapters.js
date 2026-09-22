import { fetchSupabaseRowsDetailed } from '@/lib/server-read';
import { resolveDefaultWorkspaceId } from '@/lib/server-write';
import { canonicalOrgScopeForKey } from '../brand-org-scope.js';
import { isCalendarDateKey, shiftDateKey, toZonedDateKey } from '../rhythm-calendar.js';

const CONTACT_KINDS = new Set(['call', 'meeting', 'info_session', 'demo', 'visit', 'email', 'kakao', 'quote']);
const SOURCE_LABELS = { tasks_completed:'완료 상태인 할 일',contacts_recorded:'실제 고객 연락',content_published:'발행 완료',reviews_completed:'하루 리뷰' };
const TABLES = {
  tasks_completed: ['tasks', 'completed_at'], contacts_recorded: ['crm_activities', 'occurred_at'],
  content_published: ['publish_logs', 'published_at'], reviews_completed: ['journal_entries', 'review_date'],
};
const ENTITY_TABLES = new Set(['tasks', 'projects', 'brands', 'content_items', 'content_variants', 'deals', 'leads', 'customer_accounts', 'companies', 'campaigns', 'memos', 'journal_entries']);
// Column names must exist in supabase/schema.sql or a migration; the test file checks this.
// (content_variants links to its item through content_id — never content_item_id.)
export const METRIC_SOURCE_SELECTS = {
  tasks: 'id,workspace_id,title,status,completed_at,project_id,meta',
  projects: 'id,workspace_id,name,brand_id,meta', brands: 'id,workspace_id,slug,meta',
  content_items: 'id,workspace_id,title,brand_id,meta', content_variants: 'id,workspace_id,content_id,meta',
  publish_logs: 'id,workspace_id,variant_id,channel,status,published_at,external_id,target_url',
  crm_activities: 'id,workspace_id,kind,occurred_at,lead_id,deal_id,account_id,meta',
  journal_entries: 'id,workspace_id,entry_kind,review_date,review_timezone',
};
const readDetailed = (table,options) => fetchSupabaseRowsDetailed(table,{...options,count:'exact',strictRows:true});
const normalizeScope = value => ['classin', 'company', 'business'].includes(value) ? 'company' : ['personal', 'brand', 'individual'].includes(value) ? 'personal' : null;

function localMidnight(date, timezone) {
  const target = Date.parse(`${date}T00:00:00Z`);
  const format = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let instant = target;
  for (let n = 0; n < 4; n += 1) {
    const p = Object.fromEntries(format.formatToParts(instant).map(part => [part.type, part.value]));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const difference = target - represented;
    if (!difference) return new Date(instant).toISOString();
    instant += difference;
  }
  return null; // Some historical timezone dates have no midnight. Never silently change the cohort.
}

export function metricPeriodWindow({ periodStart, periodEnd, timezone = 'Asia/Seoul' }) {
  if (!isCalendarDateKey(periodStart) || !isCalendarDateKey(periodEnd) || periodStart > periodEnd) return null;
  try {
    const start = localMidnight(periodStart, timezone);
    const end = localMidnight(shiftDateKey(periodEnd, 1), timezone);
    return start && end ? { start, end } : null;
  } catch { return null; }
}

// Each reader owns a short-lived cache. No cross-user cache or mutable global source snapshot.
export function createMetricReader({ workspaceId = resolveDefaultWorkspaceId(), readRows = readDetailed, now = new Date(), pageSize = 500, maxPages = 21 } = {}) {
  const cache = new Map();
  const references = new Map();
  const observedAt = now.toISOString();
  async function read(table, filters = []) {
    const key = JSON.stringify([table, filters]);
    if (!cache.has(key)) cache.set(key, (async () => {
      if (!workspaceId) return { rows: [], coverage: 'unmeasured', reason: 'missing-workspace' };
      const rows = []; let cursor = null;
      try {
        for (let page = 0; page < maxPages; page += 1) {
          const answer = await readRows(table, {
            select: METRIC_SOURCE_SELECTS[table] || '*', filters: [['workspace_id', `eq.${workspaceId}`], ...filters, ...(cursor ? [['id', `gt.${cursor}`]] : [])], order: 'id.asc', limit: pageSize,
          });
          const result = Array.isArray(answer) ? answer : answer?.rows;
          const remaining = Array.isArray(answer) ? null : answer?.count;
          if (!Array.isArray(result)) return { rows, coverage: rows.length ? 'partial' : 'unmeasured', reason: `${table}-read-failed` };
          if (result.some(row => !row?.id || row.workspace_id !== workspaceId || (cursor && row.id <= cursor)) || new Set(result.map(row => row.id)).size !== result.length) return { rows, coverage: 'partial', reason: `${table}-invalid-page` };
          rows.push(...result);
          // A server may impose a lower page limit. A short page alone is not proof of completeness.
          if (!result.length || (Number.isInteger(remaining) && remaining === result.length) || (filters.some(([field,value]) => field === 'id' && value.startsWith('eq.')) && result.length === 1)) return { rows, coverage: 'complete' };
          cursor = result.at(-1).id;
        }
        return { rows, coverage: 'partial', reason: `${table}-row-limit` };
      } catch { return { rows, coverage: rows.length ? 'partial' : 'unmeasured', reason: `${table}-read-failed` }; }
    })());
    return cache.get(key);
  }
  async function get(table, id) {
    const key = `${table}:${id}`;
    if (!references.has(key)) references.set(key,(async()=>{
      const result = await read(table, [['id', `eq.${id}`]]);
      return result.coverage === 'complete' && result.rows.length === 1 ? result.rows[0] : null;
    })());
    return references.get(key);
  }
  async function getMany(table, ids) {
    const unique = [...new Set(ids)].filter(Boolean);
    const missing = unique.filter(id => !references.has(`${table}:${id}`));
    for (let offset = 0; offset < missing.length; offset += 100) {
      const batch = missing.slice(offset, offset + 100);
      const result = await read(table, [['id', `in.(${batch.join(',')})`]]);
      const found = new Map(result.rows.map(row => [row.id, row]));
      for (const id of batch) references.set(`${table}:${id}`, Promise.resolve(result.coverage === 'complete' ? found.get(id) || null : null));
      if (result.coverage === 'complete') await prime(result.rows);
    }
    return Promise.all(unique.map(id => references.get(`${table}:${id}`)));
  }
  // Preload ownership ancestors in bounded batches rather than an HTTP call for each event.
  async function prime(rows, depth = 0) {
    if (depth > 6) return;
    const groups = new Map();
    for (const row of rows) for (const [field,table] of [['brand_id','brands'],['project_id','projects'],['variant_id','content_variants'],['content_id','content_items'],['lead_id','leads'],['deal_id','deals'],['account_id','customer_accounts']]) {
      const id = row[field];
      if (!id || references.has(`${table}:${id}`)) continue;
      if (!groups.has(table)) groups.set(table,new Set());
      groups.get(table).add(id);
    }
    await Promise.all([...groups].map(async([table,ids])=>{
      const values = [...ids];
      for(let offset=0;offset<values.length;offset+=100){
        const batch=values.slice(offset,offset+100);
        const result=await read(table,[['id',`in.(${batch.join(',')})`]]);
        const found=new Map(result.rows.map(row=>[row.id,row]));
        for(const id of batch) references.set(`${table}:${id}`,Promise.resolve(result.coverage==='complete'?found.get(id)||null:null));
        if(result.coverage==='complete')await prime(result.rows,depth+1);
      }
    }));
  }
  async function resolveEntityScope(table, row, visited = new Set()) {
    if (!row || row.workspace_id !== workspaceId) return null;
    const identity = `${table}:${row.id}`;
    if (visited.has(identity) || visited.size > 6) return null;
    const next = new Set(visited).add(identity);
    const meta = row.meta || {};
    for (const value of [row.org_scope, meta.org_scope, meta.workspace]) {
      const scope = normalizeScope(value); if (scope) return scope;
    }
    if (meta.lane === 'classin_sales') return 'company';
    const isCrm = ['leads', 'deals', 'customer_accounts'].includes(table);
    const typeScope = isCrm ? normalizeScope(meta.account_kind || meta.type || meta.kind) : normalizeScope(meta.type) || normalizeScope(row.type);
    if (typeScope) return typeScope;
    if (table === 'brands') return normalizeScope(canonicalOrgScopeForKey(row.slug));
    if (row.brand_id) return resolveEntityScope('brands', await get('brands', row.brand_id), next);
    const brandKey = meta.brand || meta.brand_key || meta.brandKey || meta.brand_slug || row.brand;
    if (brandKey) return normalizeScope(canonicalOrgScopeForKey(brandKey));
    if (table === 'tasks' && row.project_id) return resolveEntityScope('projects', await get('projects', row.project_id), next);
    if (table === 'content_variants' && row.content_id) return resolveEntityScope('content_items', await get('content_items', row.content_id), next);
    if (table === 'publish_logs') {
      if (!row.variant_id) return null;
      return resolveEntityScope('content_variants', await get('content_variants', row.variant_id), next);
    }
    if (table === 'crm_activities') {
      const links = [['lead_id','leads'],['deal_id','deals'],['account_id','customer_accounts']].filter(([field]) => row[field]);
      if (!links.length) return null;
      const scopes = await Promise.all(links.map(async ([field,target]) => resolveEntityScope(target, await get(target,row[field]), next)));
      return scopes.every(scope => scope && scope === scopes[0]) ? scopes[0] : null;
    }
    if (isCrm && row.company_id) return 'company';
    // The canonical ownership rule makes unassigned work personal; a broken explicit reference above never falls through here.
    return 'personal';
  }
  async function scopedRows(table, filters, scope) {
    const result = await read(table, filters);
    await prime(result.rows);
    const rows = []; let missing = false;
    // Bounded groups avoid one request per record overwhelming PostgREST while preserving cache coalescing.
    for (let offset = 0; offset < result.rows.length; offset += 20) {
      const group = result.rows.slice(offset, offset + 20);
      const scopes = await Promise.all(group.map(row => resolveEntityScope(table,row)));
      group.forEach((row,i) => { if (scopes[i] === null) missing = true; else if (scopes[i] === scope) rows.push(row); });
    }
    return { ...result, rows, coverage: missing ? 'partial' : result.coverage, ...(missing ? {reason:'scope-reference-unavailable'} : {}) };
  }
  async function measure({sourceKey, scope, periodStart, periodEnd, timezone = 'Asia/Seoul'}) {
    const base = { sourceKey, periodStart, periodEnd, observedAt, value: null, coverage: 'unmeasured', evidence: [] };
    const window = metricPeriodWindow({periodStart, periodEnd, timezone});
    if (!TABLES[sourceKey] || !window || !['personal','company'].includes(scope)) return {...base,reason:'invalid-measurement-definition'};
    if (window.start > observedAt) return {...base,reason:'period-not-started'};
    const [table, timeField] = TABLES[sourceKey];
    const filters = sourceKey === 'reviews_completed'
      ? [['entry_kind','eq.daily_review'],['review_date',`gte.${periodStart}`],['review_date',`lt.${shiftDateKey(periodEnd < toZonedDateKey(now,timezone) ? periodEnd : toZonedDateKey(now,timezone),1)}`]]
      : [[timeField,`gte.${window.start}`],[timeField,`lt.${window.end < observedAt ? window.end : observedAt}`], ...(sourceKey === 'tasks_completed' ? [['status','eq.done']] : sourceKey === 'content_published' ? [['status','eq.published']] : [])];
    const source = await read(table, filters);
    let rows = source.rows;
    if (sourceKey === 'contacts_recorded') rows = rows.filter(row => CONTACT_KINDS.has(row.kind));
    await prime(rows);
    let incomplete = source.coverage !== 'complete'; let reason = source.reason;
    const chosen = [];
    for (let offset = 0; offset < rows.length; offset += 20) {
      const group = rows.slice(offset, offset + 20);
      const scopes = await Promise.all(group.map(row => resolveEntityScope(table,row)));
      group.forEach((row,i) => { if (!scopes[i]) {incomplete = true;reason='scope-reference-unavailable';} else if (scopes[i] === scope) chosen.push(row); });
    }
    // content_published counts published pieces, not publish events: one per content variant
    // (publish_logs.variant_id), the same unit as the content performance page
    // (content_variants.published_at). Recording a publication again for the same variant inside
    // the window (URL fix, re-post) counts once. A published log must still point at an external
    // post (external_id or target_url) — an export handoff without one keeps the count partial.
    // A log without a variant cannot resolve ownership and is already partial above; should one
    // ever resolve, its post identity is the fallback key.
    const unique = new Map();
    for (const row of chosen) {
      let identity = row.id;
      if (sourceKey === 'content_published') {
        const post = row.external_id ? `${row.channel}:${row.external_id}` : row.target_url ? `${row.channel}:${row.target_url}` : null;
        if (!post) {incomplete = true;reason='publication-identity-missing';continue;}
        identity = row.variant_id ? `variant:${row.variant_id}` : `post:${post}`;
        // Keep the latest log as evidence: its URL is the one the variant carries now.
        const kept = unique.get(identity);
        if (kept && Date.parse(kept.published_at) > Date.parse(row.published_at)) continue;
      }
      if (sourceKey === 'reviews_completed') identity = `${row.review_timezone || timezone}:${row.review_date}`;
      unique.set(identity,row);
    }
    const evidence = [...unique.values()].slice(0,19).map(row => ({type:'ledger',table,id:row.id,label:row.title || row.review_date || SOURCE_LABELS[sourceKey],
      ...(sourceKey==='tasks_completed'?{href:`/dashboard/work/projects?view=todos&task=${row.id}`}:sourceKey==='reviews_completed'?{href:`/dashboard/work/daily-review?date=${row.review_date}`}:sourceKey==='content_published'&&/^https?:\/\//.test(row.target_url||'')?{href:row.target_url}:{}),
    }));
    evidence.push({type:'query',table,label:`${SOURCE_LABELS[sourceKey]} · ${periodStart}–${periodEnd} · ${incomplete?'일부 확인':`${unique.size}건 확인`}`,periodStart,periodEnd,scope,count:unique.size,asOf:observedAt});
    return {...base, value:incomplete ? null : unique.size, coverage: source.coverage === 'unmeasured' ? 'unmeasured' : incomplete ? 'partial' : 'complete', evidence, ...(reason ? {reason} : {}), ...(sourceKey === 'tasks_completed' ? {definitionNote:'현재 완료 상태의 작업을 완료 시각으로 집계합니다. 재오픈·재완료하면 과거 집계도 바뀔 수 있습니다.'} : sourceKey === 'content_published' ? {definitionNote:'발행한 원고 단위로 집계합니다. 같은 원고의 발행을 기간 안에서 다시 기록해도 1건입니다.'} : {})};
  }
  return { measure, read, get, getMany, scopedRows, resolveEntityScope };
}

export async function measureGoalMetric(input) {
  return createMetricReader({workspaceId:input.workspaceId}).measure(input);
}
export async function resolveMetricEntityScope({workspaceId,entityType,entityId}) {
  if (!ENTITY_TABLES.has(entityType)) return {scope:null,reason:'unsupported-entity'};
  const reader = createMetricReader({workspaceId});
  const scope = await reader.resolveEntityScope(entityType,await reader.get(entityType,entityId));
  return {scope,...(!scope ? {reason:'scope-reference-unavailable'} : {})};
}
