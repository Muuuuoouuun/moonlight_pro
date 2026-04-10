export const navigationItems = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Today, alerts, and operating pulse",
  },
  {
    href: "/dashboard/work",
    label: "Work OS",
    description: "Projects, rhythm, and decisions",
    children: [
      {
        href: "/dashboard/work",
        label: "Overview",
        description: "Focus stack and execution pulse",
      },
      {
        href: "/dashboard/work/projects",
        label: "Projects",
        description: "Portfolio, blockers, and milestones",
      },
      {
        href: "/dashboard/work/pms",
        label: "PMS",
        description: "Cadence, PMS, and routine reviews",
      },
    ],
  },
  {
    href: "/dashboard/revenue",
    label: "Revenue",
    description: "Leads, deals, accounts, and cases",
    children: [
      {
        href: "/dashboard/revenue",
        label: "Overview",
        description: "Pipeline health and next moves",
      },
      {
        href: "/dashboard/revenue/leads",
        label: "Leads",
        description: "Warm inbound and follow-up queue",
      },
      {
        href: "/dashboard/revenue/deals",
        label: "Deals",
        description: "Opportunity stages and close risk",
      },
      {
        href: "/dashboard/revenue/accounts",
        label: "Accounts",
        description: "Customer state and account health",
      },
      {
        href: "/dashboard/revenue/cases",
        label: "Cases",
        description: "Customer work and escalations",
      },
    ],
  },
  {
    href: "/dashboard/content",
    label: "Content",
    description: "Queue, studio, assets, and publish",
    children: [
      {
        href: "/dashboard/content",
        label: "Overview",
        description: "Pipeline health and publishing cadence",
      },
      {
        href: "/dashboard/content/queue",
        label: "Queue",
        description: "Ideas, briefs, and review states",
      },
      {
        href: "/dashboard/content/studio",
        label: "Studio",
        description: "Card-news drafting workspace",
      },
      {
        href: "/dashboard/content/assets",
        label: "Assets",
        description: "Outputs, files, and source material",
      },
      {
        href: "/dashboard/content/publish",
        label: "Publish",
        description: "Distribution history and channel status",
      },
    ],
  },
  {
    href: "/dashboard/automations",
    label: "Automations",
    description: "Runs, webhooks, agents, and sync health",
    children: [
      {
        href: "/dashboard/automations",
        label: "Overview",
        description: "Machine status and recent output",
      },
      {
        href: "/dashboard/automations/runs",
        label: "Runs",
        description: "Execution pulse and failures",
      },
      {
        href: "/dashboard/automations/webhooks",
        label: "Webhooks",
        description: "Endpoint catalog and intake history",
      },
      {
        href: "/dashboard/automations/integrations",
        label: "Integrations",
        description: "Connected systems and sync runs",
      },
    ],
  },
  {
    href: "/dashboard/evolution",
    label: "Evolution",
    description: "Logs, issues, memos, and activity",
    children: [
      {
        href: "/dashboard/evolution",
        label: "Overview",
        description: "Self-improvement loop and ownership",
      },
      {
        href: "/dashboard/evolution/logs",
        label: "Logs",
        description: "Errors, warnings, and fix status",
      },
      {
        href: "/dashboard/evolution/issues",
        label: "Issues",
        description: "Operational risk and mitigation state",
      },
      {
        href: "/dashboard/evolution/activity",
        label: "Activity",
        description: "Recent changes across the OS",
      },
    ],
  },
];

export const shellActions = [
  {
    href: "/dashboard/work",
    label: "Open Work OS",
    tone: "secondary",
  },
  {
    href: "/dashboard/content/studio",
    label: "Open Studio",
    tone: "primary",
  },
  {
    href: "/dashboard/evolution/logs",
    label: "Review Alerts",
    tone: "ghost",
  },
];

export function matchesNavigationPath(pathname, href) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveNavigationSection(pathname) {
  return (
    [...navigationItems]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => matchesNavigationPath(pathname, item.href)) ?? navigationItems[0]
  );
}

export function getActiveNavigationView(pathname, section = getActiveNavigationSection(pathname)) {
  if (!section.children?.length) {
    return section;
  }

  return (
    [...section.children]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => matchesNavigationPath(pathname, item.href)) ?? section.children[0]
  );
}

export const summaryStats = [
  {
    title: "Open Projects",
    value: "06",
    detail: "2 need milestone updates before the next work block.",
    badge: "Execution",
  },
  {
    title: "PMS Checks",
    value: "03",
    detail: "Morning, midday, and weekly review lanes are visible.",
    badge: "Cadence",
    tone: "muted",
  },
  {
    title: "Active Leads",
    value: "18",
    detail: "3 are warm and ready for follow-up.",
    badge: "Sales",
    tone: "warning",
  },
  {
    title: "Webhook Health",
    value: "02/03",
    detail: "Telegram and health endpoints are live, project intake is ready.",
    badge: "Engine",
    tone: "blue",
  },
  {
    title: "Error Logs",
    value: "03",
    detail: "All tracked with a clear fix owner.",
    badge: "Stable",
    tone: "green",
  },
];

export const todayFocus = [
  {
    title: "Advance the project lane",
    detail: "Promote the highest-priority project milestone and note the next blocker.",
  },
  {
    title: "Run the PMS checkpoint",
    detail: "Keep the day grounded with one cadence review before context drifts.",
  },
  {
    title: "Validate project webhook intake",
    detail: "Confirm the engine can accept progress events before wiring external tools.",
  },
];

export const systemChecks = [
  {
    title: "Hub shell",
    value: "Online",
    detail: "Dashboard, project, PMS, automation, and log lanes are visible.",
  },
  {
    title: "Project progress",
    value: "Tracked",
    detail: "Milestones, blockers, and next actions can sit in one operating surface.",
  },
  {
    title: "PMS rhythm",
    value: "Ready",
    detail: "Daily and weekly cadence blocks are now explicit rather than implied.",
  },
  {
    title: "Webhook intake",
    value: "Primed",
    detail: "Telegram plus project progress endpoints are in the engine path.",
  },
];

export const activityFeed = [
  {
    title: "Project lane expanded",
    detail: "Progress, milestones, and project update rhythm were added to the hub.",
    time: "Just now",
  },
  {
    title: "PMS cadence surfaced",
    detail: "Morning pulse, weekly review, and follow-up notes now have a home.",
    time: "8 min ago",
  },
  {
    title: "Webhook check path added",
    detail: "The engine exposes a route for project progress intake and service health.",
    time: "14 min ago",
  },
];

export const projectPortfolio = [
  {
    title: "Hub OS activation",
    owner: "Boss",
    status: "active",
    progress: 72,
    milestone: "Operational shell and engine intake aligned",
    nextAction: "Connect Supabase-backed live reads into dashboard blocks.",
    risk: "Integration",
  },
  {
    title: "Content engine rollout",
    owner: "Content lane",
    status: "active",
    progress: 58,
    milestone: "Card-news draft path returns structured results",
    nextAction: "Turn skill spec into HTML/PNG/ZIP export flow.",
    risk: "Scope",
  },
  {
    title: "Public funnel fit",
    owner: "Web lane",
    status: "queued",
    progress: 34,
    milestone: "Landing shell is online and ready for proof blocks",
    nextAction: "Add trust sections, contact capture, and case detail pages.",
    risk: "Proof",
  },
  {
    title: "Project webhook intake",
    owner: "Engine lane",
    status: "ready",
    progress: 64,
    milestone: "Dedicated route and normalization layer",
    nextAction: "Wire external project tools and persist event history to Supabase.",
    risk: "Mapping",
  },
];

export const projectUpdates = [
  {
    title: "Hub OS activation moved to implementation",
    detail: "The shell now exposes project, PMS, and automation operating views.",
    time: "Now",
    tone: "green",
  },
  {
    title: "Project webhook route prepared",
    detail: "Engine intake can normalize incoming progress events and summarize the result.",
    time: "Next",
    tone: "blue",
  },
  {
    title: "Live data wiring still pending",
    detail: "The next milestone is replacing the static seed data with repository-backed reads.",
    time: "Upcoming",
    tone: "warning",
  },
];

export const quickCommands = [
  {
    command: "/cardnews retention campaign",
    note: "Generate a card-news draft through the engine path.",
  },
  {
    command: "/projects",
    note: "Ask the engine which project lane should move next.",
  },
  {
    command: "/pms weekly",
    note: "Return the next cadence block or review checkpoint.",
  },
  {
    command: "/webhooks",
    note: "Inspect available webhook endpoints and health checks.",
  },
];

export const commandCenterQueue = [
  {
    title: "Project milestone refresh",
    detail: "Update the top two active projects with blocker and next-action notes.",
    tone: "green",
  },
  {
    title: "PMS midday pass",
    detail: "Run the second cadence check before the day scatters into reactive work.",
    tone: "warning",
  },
  {
    title: "Webhook smoke test",
    detail: "Send one sample project progress payload through the engine route.",
    tone: "blue",
  },
];

export const operationsBoard = [
  {
    title: "Active leads",
    detail: "18 total, 3 high-intent, 2 waiting on reply.",
  },
  {
    title: "Open deals",
    detail: "5 tracked opportunities with clear next steps.",
  },
  {
    title: "Operation cases",
    detail: "7 live cases with accountability assigned.",
  },
];

export const pmsBoard = [
  {
    title: "Morning pulse",
    status: "done",
    rhythm: "09:00",
    detail: "Check dashboard, choose one priority, and confirm the first outbound move.",
  },
  {
    title: "Midday review",
    status: "active",
    rhythm: "13:30",
    detail: "Review project movement, clear approvals, and decide whether the queue changed.",
  },
  {
    title: "Evening closeout",
    status: "queued",
    rhythm: "18:00",
    detail: "Capture what moved, what stalled, and what tomorrow needs first.",
  },
];

export const routineItems = [
  {
    title: "Morning",
    detail: "Review the dashboard, answer the highest-leverage message, and pick one content task.",
  },
  {
    title: "Midday",
    detail: "Clear approvals, update the lead list, and check the queue for blockers.",
  },
  {
    title: "Evening",
    detail: "Log what happened, note what broke, and prepare the next day’s focus.",
  },
];

export const weeklyReview = [
  {
    title: "Project review",
    detail: "Which project actually moved, and which one only looked busy?",
  },
  {
    title: "Decision log sweep",
    detail: "Capture the calls that changed product, lead, or operating direction.",
  },
  {
    title: "Automation follow-up",
    detail: "List one workflow that should lose manual effort next week.",
  },
];

export const automationCards = [
  {
    title: "Telegram intake",
    status: "active",
    route: "/api/webhook/telegram",
    detail: "Slash commands reach the engine, log a run, and return structured output.",
  },
  {
    title: "Project webhook",
    status: "ready",
    route: "/api/webhook/project",
    detail: "Progress updates from project tools can be normalized into one intake lane.",
  },
  {
    title: "Engine health",
    status: "active",
    route: "/api/health",
    detail: "A fast inspection route exposes commands, webhooks, and service readiness.",
  },
];

export const automationRuns = [
  {
    title: "cardnews retention campaign",
    status: "success",
    time: "Now",
    detail: "Returned a structured 5-slide draft summary and logged the command path.",
  },
  {
    title: "project webhook smoke test",
    status: "ready",
    time: "Queued",
    detail: "Prepared to accept progress events and persist them when Supabase env is present.",
  },
  {
    title: "pms weekly review",
    status: "queued",
    time: "Later",
    detail: "The command lane is defined and ready for richer scheduling logic.",
  },
];

export const contentSummary = [
  {
    title: "Idea Backlog",
    value: "14",
    detail: "Raw topics still waiting for a clear angle and a first hook.",
    badge: "Ideas",
    tone: "muted",
  },
  {
    title: "Draft + Review",
    value: "08",
    detail: "Pieces currently in writing, tightening, or operator review.",
    badge: "In Motion",
    tone: "warning",
  },
  {
    title: "Scheduled / Published",
    value: "05",
    detail: "Work already queued for distribution or recently pushed live.",
    badge: "Distribution",
    tone: "blue",
  },
  {
    title: "Attention",
    value: "02",
    detail: "Runs or publish steps that need intervention before they drift.",
    badge: "Watch",
    tone: "warning",
  },
];

export const contentPipeline = [
  {
    title: "Idea",
    note: "Topics that exist, but still need a sharper frame.",
    items: [
      {
        title: "브랜딩 운영 구조화",
        meta: "research",
        nextAction: "문제 정의를 한 줄로 줄이기",
      },
      {
        title: "실무형 세일즈 리듬",
        meta: "meeting",
        nextAction: "카드뉴스 첫 장 훅 만들기",
      },
    ],
  },
  {
    title: "Draft",
    note: "Core message exists, but phrasing still needs tightening.",
    items: [
      {
        title: "콘텐츠 자동화 실전 흐름",
        meta: "brief",
        nextAction: "증거 문장과 CTA 정리",
      },
      {
        title: "문의 전환형 랜딩 구조",
        meta: "idea",
        nextAction: "독자 문제를 더 앞에 배치",
      },
    ],
  },
  {
    title: "Review",
    note: "Readable enough, now waiting for approval or cleanup.",
    items: [
      {
        title: "허브 OS 운영 데스크 소개",
        meta: "repurpose",
        nextAction: "퍼블릭 톤과 허브 톤 차이 검수",
      },
      {
        title: "카드뉴스 템플릿 실험",
        meta: "research",
        nextAction: "첫 장 문장 리듬 다듬기",
      },
    ],
  },
  {
    title: "Publish",
    note: "Scheduled output and recently shipped work.",
    items: [
      {
        title: "이번 주 운영 브리프",
        meta: "scheduled",
        nextAction: "뉴스레터 요약본까지 같이 발송",
      },
      {
        title: "브랜딩 제안 구조 메모",
        meta: "published",
        nextAction: "반응 기반 후속 인사이트 작성",
      },
    ],
  },
];

export const contentVariants = [
  {
    title: "브랜딩 운영 구조화 카드뉴스",
    type: "Card News",
    status: "ready",
    channel: "Instagram",
    detail: "5-slide draft with hook, operating insight, and CTA.",
  },
  {
    title: "콘텐츠 자동화 인사이트 글",
    type: "Blog",
    status: "draft",
    channel: "Insights",
    detail: "Long-form expansion of the current card-news concept.",
  },
  {
    title: "이번 주 운영 메모",
    type: "Newsletter",
    status: "published",
    channel: "Email",
    detail: "Short summary note for warm leads and current clients.",
  },
  {
    title: "문의 전환형 랜딩 카피",
    type: "Landing Copy",
    status: "ready",
    channel: "Web",
    detail: "Homepage proof and CTA blocks aligned to the content loop.",
  },
];

export const contentAssets = [
  {
    title: "brand-ops-carousel-v3",
    kind: "1080 PNG pack",
    source: "Card News",
    detail: "Final export set for the current carousel draft.",
    status: "ready",
  },
  {
    title: "automation-insight-hero",
    kind: "Hero image",
    source: "Blog",
    detail: "Visual asset reserved for the long-form insight post.",
    status: "draft",
  },
  {
    title: "landing-proof-strip-copy",
    kind: "Copy block",
    source: "Landing Copy",
    detail: "Reusable trust/proof language for homepage and case notes.",
    status: "ready",
  },
  {
    title: "weekly-brief-source-note",
    kind: "Source memo",
    source: "Newsletter",
    detail: "Short operator memo that can be repurposed into follow-up content.",
    status: "archived",
  },
];

export const publishQueue = [
  {
    title: "브랜딩 운영 구조화 카드뉴스",
    channel: "Instagram",
    status: "queued",
    time: "Today",
    detail: "Queued for the next card-news publish pass.",
  },
  {
    title: "이번 주 운영 메모",
    channel: "Email",
    status: "published",
    time: "09:10",
    detail: "Sent to the current lead and client list.",
  },
  {
    title: "문의 전환형 랜딩 카피",
    channel: "Web",
    status: "published",
    time: "Yesterday",
    detail: "Homepage proof strip updated with current positioning.",
  },
];

export const contentAttention = [
  {
    title: "첫 장 훅을 더 세게 다듬기",
    detail: "The current draft reads correctly, but the first panel still feels too explanatory.",
    tone: "warning",
  },
  {
    title: "리드 후속과 배포 타이밍 맞추기",
    detail: "When a topic hits, the follow-up queue and distribution lane should move on the same day.",
    tone: "blue",
  },
  {
    title: "실패 로그를 콘텐츠 맥락으로 묶기",
    detail: "If an automation fails, the content item that triggered it should still be easy to locate.",
    tone: "green",
  },
];

export const webhookEndpoints = [
  {
    name: "Telegram Bot Intake",
    method: "POST",
    path: "/api/webhook/telegram",
    status: "active",
    note: "Parses slash commands and writes lifecycle logs.",
  },
  {
    name: "Project Progress Intake",
    method: "POST",
    path: "/api/webhook/project",
    status: "ready",
    note: "Accepts project and PMS progress payloads, normalizes them, and records webhook events.",
  },
  {
    name: "Engine Health",
    method: "GET",
    path: "/api/health",
    status: "active",
    note: "Reports service readiness, active routes, and command support.",
  },
];

export const logItems = [
  {
    title: "Project webhook route staged",
    detail: "A dedicated engine path now exists for external project or PMS event intake.",
    severity: "green",
  },
  {
    title: "Live database reads still pending",
    detail: "Dashboard and PMS blocks are intentionally static until repository wiring lands.",
    severity: "warning",
  },
  {
    title: "Operational shell widened",
    detail: "Project progress, cadence, and automation visibility now sit in the same frame.",
    severity: "green",
  },
];
