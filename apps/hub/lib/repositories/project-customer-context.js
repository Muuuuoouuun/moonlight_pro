import { eqFilter, inFilter, fetchSupabaseRows } from '@/lib/server-read';
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { projectCustomerRef } from '../project-customer-context.js';
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
      dueAt: project.due_at, href: `/dashboard/work/projects?project=${project.id}&focus=overview` })),
    hasMore: (projects?.length || 0) > 20,
  };
}
