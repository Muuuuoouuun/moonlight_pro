import { eqFilter, inFilter, fetchSupabaseRows } from '@/lib/server-read';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { projectCustomerRef } from '../project-customer-context.js';
import { isCanonicalUuid } from '../uuid.js';
import { deadlineDayKey, isDeadlineAlertSuppressed, readDeadlineAlertReset } from '../deadline-alert-reset.js';
import { WORKSPACE_ROW_SELECT } from '../workspace-row-select.js';
import { getJournalContexts } from './journal-ledger.js';
import { resolveLeadEnrichmentView } from '../sales-os/lead-view.js';

// Reuse the bounded, literal-name search RPC; enrich only its exact identities.
// Batch joins avoid a detail request for every result and need no new schema.
export async function searchProjectCustomers({ q = '', search = getJournalContexts, read = fetchSupabaseRows } = {}) {
  const failure = { status: 'error', contexts: [], hasMore: false, message: '고객 구분 정보를 불러오지 못했어요. 다시 찾아 주세요.' };
  if (typeof q !== 'string' || q.length > 100) return failure;
  try {
    const results = await Promise.all(['lead', 'account'].map(type => search({ type, q })));
    if (results.every(result => result.status === 'preview')) return { ...failure, status: 'preview' };
    const workspaceId = results[0].workspaceId;
    if (!workspaceId || results.some(result => result.status !== 'live' || result.workspaceId !== workspaceId)) return failure;
    const scoped = async (table, ids, select) => {
      if (!ids.length) return [];
      const rows = await read(table, { select, filters: [['workspace_id', eqFilter(workspaceId)], ['id', inFilter(ids)]], limit: ids.length });
      if (!Array.isArray(rows) || rows.length !== ids.length || new Set(rows.map(row => row.id)).size !== ids.length || rows.some(row => !ids.includes(row.id))) throw Error('incomplete identity read');
      return rows;
    };
    const records = await Promise.all(results.map((result, index) => scoped(index === 0 ? 'leads' : 'customer_accounts', result.contexts.map(row => row.id), index === 0 ? 'id,name,company_id,contact_id,meta' : 'id,name,company_id,meta')));
    const all = records.flat();
    const ids = key => [...new Set(all.map(row => row[key]).filter(Boolean))];
    const [contacts, companies] = await Promise.all([
      scoped('contacts', ids('contact_id'), 'id,name,email,phone,title'),
      scoped('companies', ids('company_id'), 'id,name,meta'),
    ]);
    const contactById = new Map(contacts.map(row => [row.id, row]));
    const companyById = new Map(companies.map(row => [row.id, row]));
    const contexts = results.flatMap((result, index) => {
      const byId = new Map(records[index].map(row => [row.id, row]));
      return result.contexts.map(context => {
        const row = byId.get(context.id), contact = contactById.get(row.contact_id), company = companyById.get(row.company_id);
        const region = index === 0 ? resolveLeadEnrichmentView(row).region : row.meta?.region;
        const details = [...new Set([company?.name !== context.label ? company?.name : null,
          contact?.name, contact?.title, region || company?.meta?.region, contact?.email || contact?.phone].filter(value => typeof value === 'string' && value.trim()))];
        return { ...context, description: details.join(' · ') };
      });
    });
    // Identical names AND identity metadata still need a stable distinction.
    const key = row => `${row.type}:${row.label}:${row.description}`;
    const counts = new Map();
    contexts.forEach(row => counts.set(key(row), (counts.get(key(row)) || 0) + 1));
    return { status: 'live', workspaceId, hasMore: results.some(result => result.hasMore), contexts: contexts.map(row => ({
      ...row, recordId: counts.get(key(row)) > 1 ? row.id : null,
    })) };
  } catch { return failure; }
}

const CONTACT_KINDS = '(call,kakao,email,meeting,visit,demo,info_session)';
const TERMINAL_PROJECT = new Set(['completed', 'archived']);
const empty = (status, workspaceId) => ({ status, workspaceId, customer: null, recent: null, projects: [], hasMore: false, failedSources: [] });

// Exact identity lookups; the project/customer relationship is never inferred
// from a company name or from another contact in the same organisation.
export async function getProjectCustomerContext({ kind, id, projectsOnly = false,
  workspaceId = resolveDefaultWorkspaceId(), configured = Boolean(resolveSupabaseConfig()),
  read = fetchSupabaseRows, now = new Date(),
} = {}) {
  const ref = projectCustomerRef({ type: kind, id });
  if (!ref) return { ...empty('error', workspaceId), message: '고객 주소를 확인해 주세요.' };
  if (!workspaceId || !configured) return empty('preview', workspaceId);
  const base = [['workspace_id', eqFilter(workspaceId)]];
  const safelyRead = async (table, options) => {
    try { return await read(table, { ...options, filters: [...base, ...(options.filters || [])] }); }
    catch { return null; }
  };
  const customers = await safelyRead(ref.type === 'lead' ? 'leads' : 'customer_accounts', { filters: [['id', eqFilter(ref.id)]], limit: 1 });
  if (!Array.isArray(customers)) return { ...empty('error', workspaceId), message: '고객 정보를 불러오지 못했어요.' };
  const row = customers[0];
  if (!row) return { ...empty('live', workspaceId), missing: true };
  const projectKey = ref.type === 'lead' ? 'lead_id' : 'customer_account_id';
  const activityKey = ref.type === 'lead' ? 'lead_id' : 'account_id';
  // select '*': product_id(0049)를 이름으로 부르면 0049 전 DB에서 프로젝트 읽기 전체가 실패한다.
  // '*'는 열이 없으면 키만 빠진다(operating-ledger와 같은 방식) — 21행 상한이라 본문 크기는 작다.
  const [projects, contacts, companies, direct, common] = await Promise.all([
    safelyRead('projects', { select: '*', filters: [[projectKey, eqFilter(ref.id)]], order: 'updated_at.desc,id.asc', limit: 21 }),
    !projectsOnly && row.contact_id ? safelyRead('contacts', { select: 'id,name', filters: [['id', eqFilter(row.contact_id)]], limit: 1 }) : [],
    !projectsOnly && row.company_id ? safelyRead('companies', { select: 'id,name', filters: [['id', eqFilter(row.company_id)]], limit: 1 }) : [],
    !projectsOnly ? safelyRead('crm_activities', { select: 'id,kind,body,occurred_at', filters: [[activityKey, eqFilter(ref.id)], ['kind', `in.${CONTACT_KINDS}`]], order: 'occurred_at.desc,id.desc', limit: 1 }) : [],
    !projectsOnly && row.company_id ? safelyRead('crm_activities', { select: 'id,kind,body,occurred_at', filters: [['company_id', eqFilter(row.company_id)], ['lead_id', 'is.null'], ['account_id', 'is.null'], ['deal_id', 'is.null'], ['kind', `in.${CONTACT_KINDS}`]], order: 'occurred_at.desc,id.desc', limit: 1 }) : [],
  ]);
  // 열린 일이 먼저, 각 무리 안은 읽은 순서(updated_at desc) 그대로 — 최근에 끝낸 일이 진행 중인 일을
  // "더 보기" 뒤로 밀지 않게 한다. Array.prototype.sort는 안정 정렬이다.
  const listed = Array.isArray(projects) ? projects.slice(0, 20).sort((a, b) => TERMINAL_PROJECT.has(a.status) - TERMINAL_PROJECT.has(b.status)) : [];
  // 제품 이름은 프로젝트 목록 보기(view=projects)만 읽는다 — 그 목록을 그리는 곳이 고객 드로어뿐이고,
  // 프로젝트 고객 패널(전체 맥락)은 프로젝트를 그리지 않으니 제품 읽기로 'partial'이 되면 안 된다.
  // 0049 전 DB는 product_id가 없어 여기서 멈춘다. product_id가 있으면 같은 0049가 products도 만들었으므로,
  // 제품 읽기 실패(스키마 캐시 미갱신 PGRST205 포함)는 "제품 없음"이 아니라 'products' 실패로 밝힌다.
  const productIds = projectsOnly ? [...new Set(listed.map(project => project.product_id).filter(isCanonicalUuid))] : [];
  // 이전 기한 알림 해제(설정)는 PMS·내 작업·주의 목록과 같이 따른다 — 해제한 기한을 여기서 다시 붉게 세우지 않는다.
  // 막힘·끝난 일은 '기한 지남'을 그리지 않으므로, 지난 기한의 열린 일이 있을 때만 워크스페이스를 읽는다.
  const today = deadlineDayKey(now);
  const late = project => { const day = deadlineDayKey(project.due_at); return !TERMINAL_PROJECT.has(project.status) && project.status !== 'blocked' && Boolean(day) && day < today; };
  const readWorkspace = async () => {
    try { const rows = await read('workspaces', { select: WORKSPACE_ROW_SELECT, filters: [['id', eqFilter(workspaceId)]], limit: 1 }); return rows?.[0] || null; }
    catch { return null; }
  };
  const [productRows, workspace] = await Promise.all([
    productIds.length ? safelyRead('products', { select: 'id,name', filters: [['id', inFilter(productIds)]], limit: productIds.length }) : [],
    projectsOnly && listed.some(late) ? readWorkspace() : {},
  ]);
  const productNames = new Map((productRows || []).map(product => [product.id, product.name]));
  const reset = readDeadlineAlertReset(workspace?.meta);
  const failedSources = [
    ['projects', projects], ['contacts', contacts], ['companies', companies],
    ['customer_activities', direct], ['company_activities', common], ['products', productRows],
    // 해제 여부를 모르면 붉은 '기한 지남'을 세우지 않는다(화면은 날짜만) — 대신 일부 데이터로 밝힌다.
    ['deadline_alerts', workspace ? [] : null],
  ].filter(([, rows]) => !Array.isArray(rows)).map(([name]) => name);
  const person = contacts?.[0]?.name || null;
  const company = companies?.[0]?.name || null;
  const name = row.name || company || '이름 없는 고객';
  const activity = direct?.[0] || common?.[0];
  return {
    status: failedSources.length ? 'partial' : 'live', workspaceId, failedSources,
    customer: { ...ref, name, label: person || name, company: company || (person ? name : null),
      nextAction: row.next_action || '', nextActionAt: row.meta?.next_action_at || null, dormant: Boolean(row.meta?.dormant) },
    recent: activity ? { id: activity.id, kind: activity.kind, body: activity.body || '', occurredAt: activity.occurred_at,
      scope: direct?.[0] ? 'customer' : 'company' } : null,
    // productName·deadlineAlertSuppressed는 목록 보기(view=projects)에서만 읽는다. 전체 맥락 보기에서는 늘 null·false다.
    projects: listed.map((project) => ({ id: project.id, name: project.name, status: project.status,
      dueAt: project.due_at, productId: project.product_id || null, productName: productNames.get(project.product_id) || null,
      deadlineAlertSuppressed: isDeadlineAlertSuppressed(reset, 'project', project.id, project.due_at),
      href: `/dashboard/work/projects?project=${project.id}&focus=overview` })),
    hasMore: (projects?.length || 0) > 20,
  };
}
