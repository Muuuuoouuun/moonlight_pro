// Navigation metadata only. Operational records come from live ledgers; when a
// ledger is unavailable the Hub renders an explicit preview/empty state.

export const NAV_TREE = [
  { key: 'daily-brief', label: 'Daily Brief', icon: 'brief', path: 'dashboard/daily-brief' },
  {
    key: 'classin', label: '클래스인', icon: 'classin', workspace: true,
    children: [
      { key: 'classin-pipeline', label: '업무·파이프라인', icon: 'deals', path: 'dashboard/classin/pipeline', keywords: ['deals', '딜', '칸반', 'pipeline'] },
      { key: 'classin-revenue', label: '결제·리드', icon: 'leads', path: 'dashboard/classin/revenue', keywords: ['leads', '리드'] },
      { key: 'classin-segments', label: '세그먼트', icon: 'filter', path: 'dashboard/classin/segments', keywords: ['segments', '세그먼트'] },
      { key: 'classin-accounts', label: '고객·계정', icon: 'accounts', path: 'dashboard/classin/accounts', keywords: ['accounts', '계정', '고객'] },
      { key: 'classin-followups', label: 'Follow-ups', icon: 'bell', path: 'dashboard/classin/followups', keywords: ['followup', '팔로업'] },
      { key: 'classin-projects', label: '프로젝트', icon: 'projects', path: 'dashboard/classin/projects' },
      { key: 'classin-automations', label: '시트 동기화', icon: 'automations', path: 'dashboard/classin/automations', keywords: ['sheets', '시트', 'sync', '자동화'] },
    ],
  },
  {
    key: 'brand', label: '브랜드', icon: 'brand', workspace: true,
    children: [
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
      { key: 'projects', label: 'Projects', icon: 'projects', path: 'dashboard/work/projects' },
      { key: 'calendar', label: 'Calendar', icon: 'calendar', path: 'dashboard/work/calendar' },
      { key: 'rhythm', label: 'Rhythm', icon: 'rhythm', path: 'dashboard/work/rhythm' },
      { key: 'decisions', label: 'Decisions', icon: 'decisions', path: 'dashboard/work/decisions' },
      { key: 'roadmap', label: 'Roadmap', icon: 'roadmap', path: 'dashboard/work/roadmap' },
    ],
  },
  {
    key: 'revenue', label: 'Revenue', icon: 'revenue', secondary: true,
    children: [
      { key: 'overview', label: 'Overview', icon: 'revenue', path: 'dashboard/revenue/overview' },
      { key: 'deals', label: 'Deals', icon: 'deals', path: 'dashboard/revenue/deals' },
      { key: 'leads', label: 'Leads', icon: 'leads', path: 'dashboard/revenue/leads' },
      { key: 'accounts', label: 'Accounts', icon: 'accounts', path: 'dashboard/revenue/accounts' },
      { key: 'cases', label: 'Cases', icon: 'cases', path: 'dashboard/revenue/cases' },
      { key: 'followups', label: 'Follow-ups', icon: 'bell', path: 'dashboard/revenue/followups' },
    ],
  },
  {
    key: 'content', label: 'Content', icon: 'content', secondary: true,
    children: [
      { key: 'queue', label: 'Queue', icon: 'queue', path: 'dashboard/content/queue' },
      { key: 'studio', label: 'Studio', icon: 'studio', path: 'dashboard/content/studio' },
      { key: 'campaigns', label: 'Campaigns', icon: 'campaigns', path: 'dashboard/content/campaigns' },
    ],
  },
  {
    key: 'automations', label: 'Automations', icon: 'automations', secondary: true,
    children: [
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
      { key: 'evolution', label: 'Evolution', icon: 'evolution', path: 'dashboard/evolution' },
      { key: 'settings', label: 'Settings', icon: 'settings', path: 'dashboard/settings' },
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
  'dashboard/agents/office': { to: 'dashboard/agents/chat', label: 'Agents · Chat' },
};
