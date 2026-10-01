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
