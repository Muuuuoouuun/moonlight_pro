import { eqFilter, fetchSupabaseRows } from '@/lib/server-read';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { projectCustomerRef } from '../project-customer-context.js';

const CONTACT_KINDS = '(call,kakao,email,meeting,visit,demo,info_session)';
const empty = (status, workspaceId) => ({ status, workspaceId, customer: null, recent: null, projects: [], hasMore: false, failedSources: [] });

// Exact identity lookups; the project/customer relationship is never inferred
// from a company name or from another contact in the same organisation.
export async function getProjectCustomerContext({ kind, id, projectsOnly = false,
  workspaceId = resolveDefaultWorkspaceId(), configured = Boolean(resolveSupabaseConfig()),
  read = fetchSupabaseRows,
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
  const [projects, contacts, companies, direct, common] = await Promise.all([
    safelyRead('projects', { select: 'id,name,status,due_at,updated_at', filters: [[projectKey, eqFilter(ref.id)]], order: 'updated_at.desc,id.asc', limit: 21 }),
    !projectsOnly && row.contact_id ? safelyRead('contacts', { select: 'id,name', filters: [['id', eqFilter(row.contact_id)]], limit: 1 }) : [],
    !projectsOnly && row.company_id ? safelyRead('companies', { select: 'id,name', filters: [['id', eqFilter(row.company_id)]], limit: 1 }) : [],
    !projectsOnly ? safelyRead('crm_activities', { select: 'id,kind,body,occurred_at', filters: [[activityKey, eqFilter(ref.id)], ['kind', `in.${CONTACT_KINDS}`]], order: 'occurred_at.desc,id.desc', limit: 1 }) : [],
    !projectsOnly && row.company_id ? safelyRead('crm_activities', { select: 'id,kind,body,occurred_at', filters: [['company_id', eqFilter(row.company_id)], ['lead_id', 'is.null'], ['account_id', 'is.null'], ['deal_id', 'is.null'], ['kind', `in.${CONTACT_KINDS}`]], order: 'occurred_at.desc,id.desc', limit: 1 }) : [],
  ]);
  const failedSources = [
    ['projects', projects], ['contacts', contacts], ['companies', companies],
    ['customer_activities', direct], ['company_activities', common],
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
    projects: (projects || []).slice(0, 20).map((project) => ({ id: project.id, name: project.name, status: project.status,
      dueAt: project.due_at, href: `/dashboard/work/projects?project=${project.id}` })),
    hasMore: (projects?.length || 0) > 20,
  };
}
