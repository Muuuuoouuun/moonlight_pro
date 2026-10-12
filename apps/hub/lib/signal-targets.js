// Shared destinations for signals from /api/hub/daily-brief.
// 리듬(2026-09-23부터 생활 루틴 화면)으로 가던 `wait`·`start`·`rhythm`과, 아무 데도 가지 않던
// `dismiss`·`hold`는 뺐다 — 버튼 이름과 도착지가 어긋났다(확인할 것 스펙 §1·단계 0).
export const SIGNAL_TARGETS = {
  draft: 'dashboard/content/studio?new=draft',
  escalate: 'dashboard/revenue/deals',
  followup: 'dashboard/revenue/deals', // ?draft= 소비자 없음 — 죽은 파라미터 제거(4차 재감사 S)
  deals: 'dashboard/revenue/deals',
  leads: 'dashboard/revenue/leads',
  revenue: 'dashboard/revenue/overview',
  write: 'dashboard/content/studio',
  queue: 'dashboard/content/queue',
  delay: 'dashboard/content/queue',
  review: 'dashboard/automations/runs',
  flows: 'dashboard/automations/flows',
  accept: 'dashboard/work/roadmap',
  chat: 'dashboard/agents/chat',
  projects: 'dashboard/work/projects',
  decision: 'dashboard/work/decisions?new=decision',
  focus: 'dashboard/work/calendar?focus=15',
  runs: 'dashboard/automations/runs',
  automations: 'dashboard/automations',
  content: 'dashboard/content/queue',
  agents: 'dashboard/agents/orders',
};

// Deep-link a signal action to the specific record drawer when the target is the
// deals/leads board and the signal carries a real id — revenue.jsx reads ?deal=/?lead=.
// Sentinel refs (TODAY/NEW/PROPOSED…) are aggregate signals with no single record.
// (Moved from daily-brief.jsx so Home's check-item card links the same way.)
const SENTINEL_REFS = new Set(['TODAY', 'NEW', 'PROPOSED', 'QUEUE', '—', '']);
export function isSentinelRef(ref) {
  return SENTINEL_REFS.has(String(ref ?? '').trim().toUpperCase());
}
export function withEntityRef(target, source) {
  if (!target || !source || !source.ref) return target;
  const ref = String(source.ref).trim();
  if (isSentinelRef(ref)) return target;
  const from = String(source.from || '').toLowerCase();
  const join = target.includes('?') ? '&' : '?';
  if (target.startsWith('dashboard/revenue/deals') && from.startsWith('deal')) {
    return `${target}${join}deal=${encodeURIComponent(ref)}`;
  }
  if (target.startsWith('dashboard/revenue/leads') && from.startsWith('lead')) {
    return `${target}${join}lead=${encodeURIComponent(ref)}`;
  }
  return target;
}

// 확인할 것 `그 밖에`의 결정으로 남기기 — 대상 이름과 출처를 채운 결정 입력(확인할 것 스펙 §6).
const DECISION_SOURCE_TYPES = new Set(['project', 'deal', 'lead', 'account', 'automation', 'content']);
export function decisionDraftTarget(item) {
  const subject = item?.subject || {};
  const params = new URLSearchParams({ new: 'decision' });
  const name = String(subject.name || item?.title || '').trim();
  if (name) params.set('title', `${name} · `);
  if (DECISION_SOURCE_TYPES.has(subject.type) && subject.id) {
    params.set('sourceType', subject.type);
    params.set('sourceId', String(subject.id));
  }
  if (subject.type === 'project' && subject.id) params.set('projectId', String(subject.id));
  return `dashboard/work/decisions?${params.toString()}`;
}
