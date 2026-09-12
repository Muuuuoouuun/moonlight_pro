export const DISCOVERY_LABELS = { captured: '포착', exploring: '탐색 중', validating: '검증 중', connected: '실행 연결', paused: '보류', closed: '종료' };
export const DISCOVERY_LIFECYCLES = { captured: 'queued', exploring: 'active', validating: 'active', connected: 'active', paused: 'waiting', closed: 'done' };
export const DISCOVERY_TARGETS = { task: '할 일', project: '프로젝트', lead: '리드', deal: '거래' };
export const DISCOVERY_CREATE_PATHS = { task: '/dashboard/work/my', project: '/dashboard/work/projects?new=project', lead: '/dashboard/revenue/leads?new=lead', deal: '/dashboard/revenue/deals?new=deal' };
export const DISCOVERY_FILTERS = [{ key: 'active', label: '진행 중' }, { key: 'new', label: '새로 포착' }, { key: 'review', label: '다시 볼 기회' }, { key: 'archive', label: '보류·종료' }, { key: 'all', label: '전체' }];
export const optionsForDiscovery = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
export function newDiscovery(id, scope = 'personal') {
  return { id, revision: 0, title: '', orgScope: scope === 'classin' ? 'classin' : 'personal', discoveryMode: 'capture', status: 'captured', evidence: '', hypothesis: '', experiment: '', findings: '', decisionReason: '', resumeCondition: '', reviewDate: null, links: [] };
}
export function discoveryReadState(data, field = 'records') {
  if (data?.status === 'preview') return { ...data, [field]: [] };
  if (data?.status !== 'live' || !Array.isArray(data[field])) return { status: 'error', [field]: [], message: data?.message || '기회 탐색을 불러오지 못했어요. 다시 시도해 주세요.' };
  return data;
}
export function discoveryBucket(record, today) {
  if (record.status === 'closed') return 'archive';
  if (record.reviewDate && record.reviewDate <= today) return 'review';
  if (record.status === 'paused') return 'archive';
  return record.status === 'captured' ? 'new' : 'active';
}
export function filterDiscoveries(records, { scope = 'all', query = '', filter = 'all', today = '' } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return records.filter(r => (scope === 'all' || r.orgScope === scope)
    && (!term || [r.title, r.evidence, r.hypothesis, r.experiment, r.findings].some(v => String(v || '').toLocaleLowerCase().includes(term)))
    && (filter === 'all' || (filter === 'active' ? !['paused', 'closed'].includes(r.status)
      : filter === 'archive' ? ['paused', 'closed'].includes(r.status) : discoveryBucket(r, today) === filter)));
}
export function prepareDiscoveryRequest(draft, previous, uuid = () => crypto.randomUUID()) {
  const { id, title, orgScope, discoveryMode, status, evidence, hypothesis, experiment, findings, decisionReason, resumeCondition, reviewDate } = draft;
  const value = { id, title, orgScope, discoveryMode, status, evidence, hypothesis, experiment, findings, decisionReason, resumeCondition, reviewDate, expectedRevision: draft.revision, links: draft.links.map(({type,id}) => ({type,id})) };
  const fingerprint = JSON.stringify(value);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, payload: { ...value, requestId: uuid() } };
}
export async function writeDiscovery(payload, fetcher = fetch) {
  try {
    const response = await fetcher('/api/hub/discovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    const ok = response.ok && ['saved', 'duplicate'].includes(data.status) && Boolean(data.record?.id);
    return { ...data, ok, message: data.message || (ok ? '기회를 저장했어요.' : '저장을 확인하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.') };
  } catch { return { ok: false, status: 'error', message: '저장을 확인하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.' }; }
}
