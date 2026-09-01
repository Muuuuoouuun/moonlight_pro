// Navigation metadata only. Operational records come from live ledgers; when a
// ledger is unavailable the Hub renders an explicit preview/empty state.

export const NAV_TREE = [
  { key: 'daily-brief', label: '오늘', icon: 'brief', path: 'dashboard/daily-brief', keywords: ['오늘', 'today', 'daily brief', '브리핑', '브리프'] },
  { key: 'overview', label: '현황', icon: 'signal', path: 'dashboard/overview', keywords: ['overview', '현황', '차트', '시각', '통계', 'chart', 'stats', '정리'] },
  { key: 'my-work', label: '내 작업', icon: 'inbox', path: 'dashboard/work/my', keywords: ['내 작업', 'my work', '내작업', 'tasks', '할 일', '할일', 'todo', 'deals', 'calendar', '일정', '실행'] },
  {
    key: 'classin', label: '클래스인', icon: 'classin', workspace: true,
    children: [
      { key: 'classin-pipeline', label: 'Deals', icon: 'deals', path: 'dashboard/classin/pipeline', keywords: ['deals', '딜', '칸반', 'pipeline', '파이프라인', '업무'] },
      { key: 'classin-revenue', label: 'Leads', icon: 'leads', path: 'dashboard/classin/revenue', keywords: ['leads', '리드', '결제'] },
      { key: 'classin-segments', label: '세그먼트', icon: 'filter', path: 'dashboard/classin/segments', keywords: ['segments', '세그먼트'] },
      { key: 'classin-accounts', label: 'Accounts', icon: 'accounts', path: 'dashboard/classin/accounts', keywords: ['accounts', '계정', '고객'] },
      // classin-followups·classin-automations 행 제거(2026-08-05): workspace prop 없이
      // dashboard/revenue/followups·dashboard/automations/sheets와 바이트 동일한 페이지를
      // 가리키는 중복 팔레트 항목이었다. 라우트 자체는 PAGE_MAP에 남아 북마크는 유지된다.
      { key: 'classin-projects', label: '프로젝트', icon: 'projects', path: 'dashboard/classin/projects' },
    ],
  },
  {
    key: 'brand', label: '브랜드', icon: 'brand', workspace: true,
    children: [
      // 브랜드 탭 — 정체성·리듬·기록 (2026-08-29 브랜드 탭 설계). 아래 세 항목은
      // 개인 스코프 별칭이며 브랜드 자체가 아니라 그 스코프의 프로젝트·콘텐츠다.
      { key: 'brand-directory', label: '브랜드', icon: 'brand', path: 'dashboard/brands', keywords: ['brand', '브랜드', '정체성', '보이스', '리듬'] },
      { key: 'brand-projects', label: '브랜드·프로젝트', icon: 'projects', path: 'dashboard/brand/projects' },
      { key: 'brand-studio', label: '콘텐츠 스튜디오', icon: 'studio', path: 'dashboard/brand/studio' },
      { key: 'brand-queue', label: '발행 큐', icon: 'queue', path: 'dashboard/brand/queue' },
    ],
  },
  {
    key: 'agents', label: 'Agents', icon: 'agents', secondary: true,
    children: [
      { key: 'chat', label: 'Chat', icon: 'chat', path: 'dashboard/agents/chat' },
      { key: 'orders', label: 'Orders', icon: 'orders', path: 'dashboard/agents/orders' },
      { key: 'council', label: 'Council', icon: 'council', path: 'dashboard/agents/council' },
    ],
  },
  {
    key: 'work', label: 'Work', icon: 'work', secondary: true,
    children: [
      { key: 'projects', label: 'Projects', icon: 'projects', path: 'dashboard/work/projects', keywords: ['프로젝트', '기획', 'pms'] },
      { key: 'calendar', label: 'Calendar', icon: 'calendar', path: 'dashboard/work/calendar', keywords: ['캘린더', '일정'] },
      { key: 'rhythm', label: 'Rhythm', icon: 'rhythm', path: 'dashboard/work/rhythm', keywords: ['리듬', '루틴'] },
      { key: 'decisions', label: 'Decisions', icon: 'decisions', path: 'dashboard/work/decisions', keywords: ['결정', '의사결정'] },
      { key: 'roadmap', label: 'Roadmap', icon: 'roadmap', path: 'dashboard/work/roadmap', keywords: ['로드맵'] },
    ],
  },
  {
    // 팔레트 어휘를 사이드바(hub-nav.js)의 D4 확정 라벨과 동기화(2026-07-15 스펙) — 운영자가
    // 매일 보는 라벨(영업·매출, 고객 연락)로 검색했을 때 0건이 나오지 않아야 한다.
    key: 'revenue', label: 'Revenue', icon: 'revenue', secondary: true,
    children: [
      { key: 'overview', label: '개요', icon: 'revenue', path: 'dashboard/revenue/overview', keywords: ['revenue overview', '매출 개요', '영업', '영업·매출'] },
      { key: 'customers', label: '고객 DB', icon: 'accounts', path: 'dashboard/revenue/customers', keywords: ['customers', '고객', 'crm', '통합'] },
      { key: 'heatmap', label: '매출 히트맵', icon: 'globe', path: 'dashboard/revenue/heatmap', keywords: ['heatmap', '히트맵', '지역', '지도', 'map'] },
      { key: 'deals', label: 'Deals', icon: 'deals', path: 'dashboard/revenue/deals', keywords: ['딜', '파이프라인', '영업'] },
      { key: 'leads', label: 'Leads', icon: 'leads', path: 'dashboard/revenue/leads', keywords: ['리드', '영업'] },
      { key: 'accounts', label: 'Accounts', icon: 'accounts', path: 'dashboard/revenue/accounts', keywords: ['계정', '고객사'] },
      { key: 'cases', label: 'Cases', icon: 'cases', path: 'dashboard/revenue/cases', keywords: ['케이스', 'cs'] },
      { key: 'followups', label: '고객 연락', icon: 'bell', path: 'dashboard/revenue/followups', keywords: ['followup', 'follow-ups', '팔로업', '연락', '후속'] },
    ],
  },
  {
    key: 'content', label: 'Content', icon: 'content', secondary: true,
    children: [
      { key: 'queue', label: 'Queue', icon: 'queue', path: 'dashboard/content/queue', keywords: ['콘텐츠', '발행 큐'] },
      { key: 'studio', label: 'Studio', icon: 'studio', path: 'dashboard/content/studio', keywords: ['스튜디오', '작성'] },
      { key: 'campaigns', label: 'Campaigns', icon: 'campaigns', path: 'dashboard/content/campaigns' },
    ],
  },
  {
    key: 'automations', label: 'Automations', icon: 'automations', secondary: true,
    children: [
      { key: 'automations-overview', label: '자동화 개요', icon: 'automations', path: 'dashboard/automations', keywords: ['automations overview', '자동화 개요', '자동화 목록', 'flows summary'] },
      { key: 'runs', label: 'Runs', icon: 'runs', path: 'dashboard/automations/runs' },
      { key: 'flows', label: 'Flows', icon: 'zap', path: 'dashboard/automations/flows' },
      { key: 'email', label: 'Email', icon: 'email', path: 'dashboard/automations/email' },
      { key: 'webhooks', label: 'Webhooks', icon: 'webhook', path: 'dashboard/automations/webhooks' },
      { key: 'sheets', label: 'Sheets', icon: 'leads', path: 'dashboard/automations/sheets' },
    ],
  },
  {
    key: 'system', label: 'System', icon: 'settings', secondary: true,
    children: [
      { key: 'evolution', label: 'Evolution', icon: 'evolution', path: 'dashboard/evolution', keywords: ['에볼루션', '시스템 로그'] },
      { key: 'settings', label: 'Settings', icon: 'settings', path: 'dashboard/settings', keywords: ['설정', '세팅', '환경', '연결'] },
    ],
  },
];

export const LEGACY_TREE = [];

export const LEGACY_REDIRECTS = {
  'dashboard/work/management': { to: 'dashboard/work/projects', label: 'Projects (PMS 통합)' },
  'dashboard/work/plan': { to: 'dashboard/work/roadmap', label: 'Roadmap' },
  'dashboard/work/releases': { to: 'dashboard/evolution', label: 'Evolution · Log' },
  'dashboard/work/pms': { to: 'dashboard/work/projects', label: 'Projects' },
  'dashboard/content/assets': { to: 'dashboard/content/studio', label: 'Studio' },
  'dashboard/content/publish': { to: 'dashboard/content/queue', label: 'Queue' },
  'dashboard/automations/integrations': { to: 'dashboard/settings', label: 'Settings · Integrations' },
  'dashboard/operations': { to: 'dashboard/daily-brief', label: 'Daily Brief' },
  'dashboard/pms': { to: 'dashboard/work/projects', label: 'Projects' },
  'dashboard/playbooks': { to: 'dashboard/evolution', label: 'Evolution · Playbooks' },
  'dashboard/command-center': { to: 'dashboard/evolution', label: 'Evolution · Commands' },
  'dashboard/command': { to: 'dashboard/evolution', label: 'Evolution · Commands' },
  'dashboard/card-news': { to: 'dashboard/content/studio', label: 'Studio (Carousel)' },
  'dashboard/logs': { to: 'dashboard/automations/runs', label: 'Run log' },
  'dashboard/routine': { to: 'dashboard/work/rhythm', label: 'Rhythm' },
  'dashboard/evolution/activity': { to: 'dashboard/evolution', label: 'Evolution' },
  'dashboard/evolution/issues': { to: 'dashboard/evolution', label: 'Evolution' },
  'dashboard/evolution/logs': { to: 'dashboard/evolution', label: 'Evolution · Log' },
  'dashboard/projects': { to: 'dashboard/work/projects', label: 'Projects' },
  'dashboard/classin/intake': { to: 'dashboard/classin/revenue', label: '결제·리드' },
  'dashboard/classin/followups': { to: 'dashboard/revenue/followups', label: '고객 연락' },
  'dashboard/agents/office': { to: 'dashboard/agents/chat', label: 'Agents · Chat' },
};
