// Shared destinations for signals from /api/hub/daily-brief.
export const SIGNAL_TARGETS = {
  draft: 'dashboard/content/studio?new=draft',
  escalate: 'dashboard/revenue/deals',
  followup: 'dashboard/revenue/deals', // ?draft= 소비자 없음 — 죽은 파라미터 제거(4차 재감사 S)
  deals: 'dashboard/revenue/deals',
  leads: 'dashboard/revenue/leads',
  revenue: 'dashboard/revenue/overview',
  wait: 'dashboard/work/rhythm',
  write: 'dashboard/content/studio',
  queue: 'dashboard/content/queue',
  delay: 'dashboard/content/queue',
  review: 'dashboard/automations/runs',
  flows: 'dashboard/automations/flows',
  dismiss: 'dashboard/daily-brief',
  accept: 'dashboard/work/roadmap',
  chat: 'dashboard/agents/chat',
  hold: 'dashboard/work/decisions',
  start: 'dashboard/work/rhythm',
  projects: 'dashboard/work/projects',
  decision: 'dashboard/work/decisions?new=decision',
  rhythm: 'dashboard/work/rhythm',
  focus: 'dashboard/work/calendar?focus=15',
  // 승인 큐의 정본 표면(agents/orders) — 자기 경로(daily-brief)를 가리키면 내비가
  // 스킵돼 "처리함"만 찍히는 no-op 버튼이 된다(2026-08-05 re-audit #6).
  queueApprovals: 'dashboard/agents/orders',
  runs: 'dashboard/automations/runs',
  automations: 'dashboard/automations',
  content: 'dashboard/content/queue',
  agents: 'dashboard/agents/orders',
};
