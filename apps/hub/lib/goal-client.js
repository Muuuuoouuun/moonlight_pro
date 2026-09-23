export const GOALS_CHANGED_EVENT = 'moonlight:goals-changed';

export function goalScope(value) {
  return value === 'classin' || value === 'company' ? 'company' : value === 'personal' ? 'personal' : '';
}

// 목표·성과의 세 보기 — 목표별 · 빠른 체크 · 주간 실측. 주간 실측은 체크와 겹치지 않는다.
export function goalHref(id, scope, { check = false, create = false, weekly = false } = {}) {
  const params = new URLSearchParams({ view: 'goals', scope: goalScope(scope) === 'company' ? 'classin' : goalScope(scope) || 'all' });
  if (id) params.set('goal', id);
  if (weekly) params.set('weekly', '1');
  else if (check) params.set('check', '1');
  if (create) params.set('new', 'goal');
  return `/dashboard/overview?${params}`;
}

export function goalView(params) {
  if (params.get('weekly') === '1') return 'weekly';
  return params.get('check') === '1' ? 'check' : 'goals';
}

// 하루 리뷰(journal_entries)에는 소속이 없어 정본 규칙상 언제나 개인이다(source-adapters
// resolveEntityScope). 회사 목표에 이 원천을 고르면 영원히 측정된 0이 나오므로 고를 수 없게 한다.
const GOAL_SOURCE_KEYS_BY_SCOPE = {
  personal: ['manual', 'tasks_completed', 'contacts_recorded', 'content_published', 'reviews_completed'],
  company: ['manual', 'tasks_completed', 'contacts_recorded', 'content_published'],
};
export function goalSourceKeysFor(scope) {
  return GOAL_SOURCE_KEYS_BY_SCOPE[scope === 'company' ? 'company' : 'personal'];
}

export function goalLinkedEntityHref(link) {
  if (link.stale || ['scope-mismatch', 'unavailable'].includes(link.linkStatus)) return null;
  if (typeof link.entityHref === 'string' && link.entityHref.startsWith('/dashboard/') && safeGoalEvidenceHref(link.entityHref)) return link.entityHref;
  const id = encodeURIComponent(link.entityId);
  const paths = { projects: `work/projects?project=${id}`, tasks: `work/projects?view=todos&task=${id}`, campaigns: `content/campaigns?campaign=${id}`, brands: `brands?b=${id}`, content_items: `content/studio?item=${id}`, deals: `revenue/deals?deal=${id}`, leads: `revenue/leads?lead=${id}`, customer_accounts: `revenue/accounts?account=${id}`, memos: `work/memos?note=${id}`, journal_entries: `work/memos?note=${id}` };
  return paths[link.entityType] ? `/dashboard/${paths[link.entityType]}` : null;
}

export function goalReadState(response, data) {
  if (!response?.ok || !data || data.status === 'error' || data.source === 'error') return 'error';
  return ['live', 'partial', 'preview'].includes(data.status) ? data.status : 'error';
}

export function goalReadErrorMessage(code) {
  if (code === 'invalid-workspace') return '목표를 불러올 작업공간 설정을 확인해야 합니다. 업무 내용은 계속 편집할 수 있습니다.';
  if (code === 'entity-scope-unavailable') return '이 업무의 소속을 확인하지 못했습니다. 프로젝트·소속을 저장한 뒤 다시 확인해 주세요.';
  return '목표 정보를 읽지 못했습니다. 잠시 후 다시 확인해 주세요. 업무 내용은 계속 편집할 수 있습니다.';
}

export function createGoalReadClient({ fetchImpl = fetch } = {}) {
  const inflight = new Map();
  const empty = { objectives: [], metrics: [], observations: [], links: [], asOf: null };
  return {
    invalidate(query) { if (query === undefined) inflight.clear(); else inflight.delete(query); },
    read(query = '') {
      if (!inflight.has(query)) {
        const entry = {};
        entry.promise = (async () => {
          try {
            const response = await fetchImpl(`/api/hub/goals${query ? `?${query}` : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
            const data = await response.json().catch(() => null);
            const status = goalReadState(response, data);
            return { ...empty, ...(status === 'error' ? {} : data), status, error: status === 'error' ? goalReadErrorMessage(data?.error) : '' };
          } catch { return { ...empty, status: 'error', error: '연결을 확인하고 목표 원장을 다시 불러오세요.' }; }
          finally { if (inflight.get(query) === entry) inflight.delete(query); }
        })();
        inflight.set(query, entry);
      }
      return inflight.get(query).promise;
    },
  };
}

export function goalSectionState(model, table) {
  if (model.failedSources?.includes(table)) return 'error';
  return model.truncatedSources?.includes(table) ? 'partial' : 'live';
}

export function measurementLabel(metric) {
  const measured = metric?.measurement;
  if (!measured || measured.coverage === 'unmeasured' || !Number.isFinite(measured.value)) return '미측정';
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(measured.value)}${metric.unit ? ` ${metric.unit}` : ''}`;
}

export function safeGoalEvidenceHref(value) {
  if (typeof value !== 'string') return null;
  if (/^\/dashboard(?:[/?#]|$)/.test(value) && !/[\u0000-\u0020\\]/.test(value)) return value;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

const optionalNumber = value => value === '' || value == null ? null : Number(value);
export function goalObjectiveInput(draft, objective) {
  const text = { title: draft.title.trim(), description: draft.description.trim() };
  return objective ? { id: objective.id, ...text, status: draft.status } : { ...text, scope: draft.scope, periodStart: draft.periodStart, periodEnd: draft.periodEnd, timezone: draft.timezone };
}
export function goalMetricInput(draft, objectiveId) {
  return { objectiveId, name: draft.name.trim(), unit: draft.unit.trim(), role: draft.role, direction: draft.direction, baseline: optionalNumber(draft.baseline), target: draft.direction === 'range' ? null : optionalNumber(draft.target), targetMin: draft.direction === 'range' ? optionalNumber(draft.targetMin) : null, targetMax: draft.direction === 'range' ? optionalNumber(draft.targetMax) : null, sourceKey: draft.sourceKey };
}
export function goalObservationInput(draft, metricId, objective) {
  const hasEvidence = Boolean(draft.evidenceLabel?.trim() && safeGoalEvidenceHref(draft.evidenceHref) && Number.isFinite(Date.parse(draft.evidenceAt)));
  return { metricId, value: draft.coverage === 'unmeasured' ? null : optionalNumber(draft.value), coverage: draft.coverage, observedAt: new Date(draft.observedAt).toISOString(), periodStart: objective.periodStart, periodEnd: objective.periodEnd, sourceKey: 'manual', note: draft.note.trim(), evidence: hasEvidence ? [{ label: draft.evidenceLabel.trim(), href: draft.evidenceHref.trim(), occurredAt: new Date(draft.evidenceAt).toISOString() }] : [] };
}

export function goalWriteErrorMessage(error) {
  return ({
    'invalid-objective': '목표 이름·소속·시작일·종료일을 확인해 주세요.',
    'invalid-objective-update': '목표 이름과 설명·상태를 확인해 주세요.',
    'invalid-timezone': '목표의 시간대 설정을 확인해 주세요.',
    'invalid-target': '목표값이 방향과 맞지 않습니다. 늘리기는 기준값 이상, 줄이기는 기준값 이하로 입력하세요.',
    'invalid-metric': '지표 이름·단위·측정 방법과 숫자 범위를 확인해 주세요.',
    'invalid-observation': '관측 일시·기간·실제값과 측정 상태를 확인해 주세요.',
    'invalid-evidence': '근거의 이름·주소·발생 일시를 확인해 주세요. 관측값을 확정하려면 근거가 필요합니다.',
    'entity-scope-mismatch': '업무와 같은 소속의 목표를 선택해 주세요.',
    'source-scope-mismatch': '하루 리뷰는 개인 기록이라 회사 목표의 측정 방법으로 쓸 수 없습니다. 다른 측정 방법을 고르세요.',
  })[error] || '저장하지 못했습니다. 입력과 연결 상태를 확인한 뒤 다시 시도하세요.';
}

function classifyWrite(data) {
  if (data?.status === 'saved' && data.persisted === true) return { ...data, state: 'saved' };
  if (data?.persisted === false) return { ...data, state: data.status === 'conflict' ? 'conflict' : 'error' };
  return { ...data, state: 'unknown', message: '저장 결과를 확인하지 못했습니다. 요청 기록을 확인하거나 같은 요청을 다시 보낼 수 있습니다.' };
}

// Owns one logical command. A transport failure never licenses a new command ID.
export function createGoalCommandClient({ fetchImpl = fetch, makeId = () => crypto.randomUUID(), pending = null, onPending = () => {} } = {}) {
  let current = pending;
  let busy = false;
  let uncertain = Boolean(pending);
  function setPending(value) { current = value; onPending(value); }
  async function execute(receipt) {
    if (!current || busy) return { state: busy ? 'saving' : 'idle' };
    busy = true;
    try {
      const response = await fetchImpl(receipt ? `/api/hub/goals/commands?commandId=${encodeURIComponent(current.commandId)}` : '/api/hub/goals/commands', receipt
        ? { cache: 'no-store', signal: AbortSignal.timeout(20000) }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(current), signal: AbortSignal.timeout(20000) });
      let result = classifyWrite(await response.json().catch(() => null));
      const unavailable = response.status >= 500 || [401, 403, 404].includes(response.status) || ['missing-persistence', 'goal-storage-unavailable', 'goals-migration-required', 'receipt-read-unavailable'].includes(result.error);
      // Failure to read a receipt says nothing about the earlier write. A retry
      // outage likewise cannot erase a command whose first result was lost.
      if (result.state !== 'saved' && (receipt || (uncertain && unavailable))) result = classifyWrite({ ...result, persisted: null });
      if (result.state === 'unknown') uncertain = true;
      if (result.state !== 'unknown') setPending(null);
      return result;
    } catch { uncertain = true; return classifyWrite(null); }
    finally { busy = false; }
  }
  return {
    get pending() { return current; },
    async submit(action, input, expectedRevision) {
      if (busy) return { state: 'saving' };
      if (current) return classifyWrite(null);
      uncertain = false;
      setPending({ commandId: makeId(), action, ...(expectedRevision !== undefined ? { expectedRevision } : {}), input });
      return execute(false);
    },
    retry: () => execute(false),
    checkReceipt: () => execute(true),
  };
}

const memory = new Map();
export function readGoalLocal(key, fallback = null) {
  try { const text = window.sessionStorage.getItem(`moonlight.goals.v1:${key}`); if (text) return JSON.parse(text) ?? fallback; } catch {}
  return memory.get(key) ?? fallback;
}
export function writeGoalLocal(key, value) {
  if (value == null) memory.delete(key); else memory.set(key, value);
  try { if (value === null) window.sessionStorage.removeItem(`moonlight.goals.v1:${key}`); else window.sessionStorage.setItem(`moonlight.goals.v1:${key}`, JSON.stringify(value)); } catch {}
}
