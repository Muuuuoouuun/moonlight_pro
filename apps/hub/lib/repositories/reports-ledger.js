import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from '../server-write.js';
import { isCanonicalUuid } from '../uuid.js';

const projectStored = row => ({ id: `stored:${row.id}`, kind: row.kind, scope: row.scope, title: row.title, periodStart: row.period_start, periodEnd: row.period_end, createdAt: row.created_at,
  source: 'snapshot', status: row.payload?.status || 'live', summary: row.payload?.summary || '', facts: row.payload?.facts ?? null, interpretation: '', decision: row.decision || '', revision: row.revision,
  sourceRefs: row.payload?.sourceRefs || [], actions: [] });
const projectResearch = brief => ({ id: `research:${brief.id}`, kind: 'research', scope: 'content', title: brief.title, periodStart: null, periodEnd: null, createdAt: brief.createdAt,
  source: 'research', status: 'live', summary: brief.change || '', facts: { facts: brief.facts || [], factEvidence: brief.factEvidence || [], conditions: brief.conditions, change: brief.change, whyBrand: brief.whyBrand, counterevidence: brief.counterevidence, unknown: brief.unknown, draft: brief.draft, sources: brief.sources || [], state: brief.state, brandId: brief.brandId, origin: brief.origin, verificationLevel: brief.verificationLevel, promotion: brief.promotion },
  interpretation: brief.interpretation || '', decision: '', sourceRefs: (brief.sources || []).map(ref => ({ url: ref.url, label: ref.title })), actions: [{ label: '리서치 검토', href: `/dashboard/content/research?brief=${encodeURIComponent(brief.id)}` }] });
const projectOffice = row => ({ id: `office:${row.id}`, kind: 'weekly', scope: row.scope === 'classin' ? 'company' : 'personal', title: `${row.scope === 'classin' ? '회사' : '개인'} 주간 AI 정리`, periodStart: row.origin_ref?.periodStart, periodEnd: row.origin_ref?.periodEnd, createdAt: row.created_at,
  source: 'office', status: row.result?.context?.missing?.length ? 'partial' : 'live', summary: row.result?.summary || '', facts: null, interpretation: row.result?.artifact?.body || '', decision: '', sourceRefs: row.result?.evidence || [], actions: row.result?.nextStep ? [row.result.nextStep] : [] });

const reportRef = value => typeof value === 'string' && /^(stored|research|office):[0-9a-f-]{36}$/.test(value) && isCanonicalUuid(value.split(':')[1]);
const validCursor = value => value && typeof value === 'object' && reportRef(value.id) && typeof value.createdAt === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.createdAt) && Number.isFinite(Date.parse(value.createdAt));
const emptyArchive = (status, error) => ({ status, reports: [], failedSources: status === 'error' ? ['reports'] : [], nextCursor: null, ...(error ? { error } : {}) });

export async function getReportsArchive({ workspaceId = resolveDefaultWorkspaceId(), actorId = 'operator', report = null, cursor = null, invokeRpc = invokeSupabaseRpc } = {}) {
  let before = null;
  if (report !== null && !reportRef(report)) return emptyArchive('error', 'invalid-report-reference');
  if (cursor !== null) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 1024 || !/^[a-zA-Z0-9_-]+$/.test(cursor)) throw new Error('invalid');
      before = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!validCursor(before)) throw new Error('invalid');
      before = { createdAt: before.createdAt, id: before.id };
    } catch { return emptyArchive('error', 'invalid-report-cursor'); }
  }
  if (!isCanonicalUuid(workspaceId)) return emptyArchive('preview');
  try {
    const response = await invokeRpc('report_archive_v1', { p_workspace_id: workspaceId, p_actor_id: actorId, p_limit: 100, p_before: before, p_ref: report });
    if (response?.error === 'missing-config' || response?.configured === false) return emptyArchive('preview');
    if (!response?.ok || response.data?.status !== 'live' || !Array.isArray(response.data.items)) return emptyArchive('error');
    const projectors = { snapshot: projectStored, research: projectResearch, office: projectOffice };
    const reports = response.data.items.map(item => {
      if (!projectors[item.source] || !isCanonicalUuid(item.row?.id)) throw new Error('invalid-report-row');
      return projectors[item.source](item.row);
    });
    const next = response.data.nextCursor;
    if (next && !validCursor(next)) return emptyArchive('error');
    return { status: reports.some(item => item.status === 'partial') ? 'partial' : 'live', reports, failedSources: [], nextCursor: next ? Buffer.from(JSON.stringify(next)).toString('base64url') : null };
  } catch { return emptyArchive('error'); }
}
