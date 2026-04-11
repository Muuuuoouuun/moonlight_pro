/**
 * Navigation items carry both the original English `label`/`description`
 * (kept as a fallback for legacy consumers that read the fields directly,
 * e.g. `dashboard/page.jsx`) and an `i18nKey` pointing into the `nav.*`
 * namespace of the hub's translation messages. The dashboard shell
 * resolves labels through `useTranslations("nav")` + `i18nKey`, so the
 * shell chrome always matches the user's active locale.
 */
export const navigationItems = [
  {
    href: "/dashboard",
    i18nKey: "overview",
    label: "Overview",
    description: "Today, alerts, and operating pulse",
    group: "core",
  },
  {
    href: "/dashboard/work",
    i18nKey: "work",
    label: "Work OS",
    description: "Projects, PMS, roadmap, and decisions",
    group: "core",
    children: [
      {
        href: "/dashboard/work",
        i18nKey: "workOverview",
        label: "Overview",
        description: "Focus stack and execution pulse",
      },
      {
        href: "/dashboard/work/projects",
        i18nKey: "workProjects",
        label: "Projects",
        description: "Portfolio, blockers, and milestones",
      },
      {
        href: "/dashboard/work/management",
        i18nKey: "workManagement",
        label: "Management",
        description: "Per-project progress, tasks, and GitHub signals",
      },
      {
        href: "/dashboard/work/calendar",
        i18nKey: "workCalendar",
        label: "Calendar",
        description: "Shared schedule, due dates, and progress timing",
      },
      {
        href: "/dashboard/work/rhythm",
        i18nKey: "workRhythm",
        label: "Rhythm",
        description: "Cadence checks and recurring control loops",
      },
      {
        href: "/dashboard/work/pms",
        i18nKey: "workPms",
        label: "PMS",
        description: "GitHub shipping pulse and operator cadence",
      },
      {
        href: "/dashboard/work/roadmap",
        i18nKey: "workRoadmap",
        label: "Roadmap",
        description: "Milestones, release lanes, and delivery risk",
      },
      {
        href: "/dashboard/work/plan",
        label: "Plan tracker",
        description: "계획 vs 현재 — 페이즈·프로젝트 변동 현황판",
      },
      {
        href: "/dashboard/work/decisions",
        i18nKey: "workDecisions",
        label: "Decisions",
        description: "Calls, review notes, and follow-through",
      },
      {
        href: "/dashboard/work/releases",
        i18nKey: "workReleases",
        label: "Releases",
        description: "Patch notes and weekly shipping log",
      },
    ],
  },
  {
    href: "/dashboard/revenue",
    i18nKey: "revenue",
    label: "Revenue",
    description: "Leads, deals, accounts, and cases",
    group: "core",
    children: [
      {
        href: "/dashboard/revenue",
        i18nKey: "revenueOverview",
        label: "Overview",
        description: "Pipeline health and next moves",
      },
      {
        href: "/dashboard/revenue/leads",
        i18nKey: "revenueLeads",
        label: "Leads",
        description: "Warm inbound and follow-up queue",
      },
      {
        href: "/dashboard/revenue/deals",
        i18nKey: "revenueDeals",
        label: "Deals",
        description: "Opportunity stages and close risk",
      },
      {
        href: "/dashboard/revenue/accounts",
        i18nKey: "revenueAccounts",
        label: "Accounts",
        description: "Customer state and account health",
      },
      {
        href: "/dashboard/revenue/cases",
        i18nKey: "revenueCases",
        label: "Cases",
        description: "Customer work and escalations",
      },
    ],
  },
  {
    href: "/dashboard/content",
    i18nKey: "content",
    label: "Content",
    description: "Queue, studio, assets, and publish",
    group: "core",
    children: [
      {
        href: "/dashboard/content",
        i18nKey: "contentOverview",
        label: "Overview",
        description: "Pipeline health and publishing cadence",
      },
      {
        href: "/dashboard/content/queue",
        i18nKey: "contentQueue",
        label: "Queue",
        description: "Ideas, briefs, and review states",
      },
      {
        href: "/dashboard/content/studio",
        i18nKey: "contentStudio",
        label: "Studio",
        description: "Card-news drafting workspace",
      },
      {
        href: "/dashboard/content/assets",
        i18nKey: "contentAssets",
        label: "Assets",
        description: "Outputs, files, and source material",
      },
      {
        href: "/dashboard/content/publish",
        i18nKey: "contentPublish",
        label: "Publish",
        description: "Distribution history and channel status",
      },
    ],
  },
  {
    href: "/dashboard/automations",
    i18nKey: "automations",
    label: "Automations",
    description: "Runs, webhooks, agents, and sync health",
    group: "core",
    children: [
      {
        href: "/dashboard/automations",
        i18nKey: "automationsOverview",
        label: "Overview",
        description: "Machine status and recent output",
      },
      {
        href: "/dashboard/automations/runs",
        i18nKey: "automationsRuns",
        label: "Runs",
        description: "Execution pulse and failures",
      },
      {
        href: "/dashboard/automations/webhooks",
        i18nKey: "automationsWebhooks",
        label: "Webhooks",
        description: "Endpoint catalog and intake history",
      },
      {
        href: "/dashboard/automations/integrations",
        i18nKey: "automationsIntegrations",
        label: "Integrations",
        description: "Connected systems and sync runs",
      },
      {
        href: "/dashboard/automations/email",
        i18nKey: "automationsEmail",
        label: "Email",
        description: "Templates, queue, and outbound delivery",
      },
    ],
  },
  {
    href: "/dashboard/evolution",
    i18nKey: "evolution",
    label: "Evolution",
    description: "Logs, issues, memos, and activity",
    group: "core",
    children: [
      {
        href: "/dashboard/evolution",
        i18nKey: "evolutionOverview",
        label: "Overview",
        description: "Self-improvement loop and ownership",
      },
      {
        href: "/dashboard/evolution/logs",
        i18nKey: "evolutionLogs",
        label: "Logs",
        description: "Errors, warnings, and fix status",
      },
      {
        href: "/dashboard/evolution/issues",
        i18nKey: "evolutionIssues",
        label: "Issues",
        description: "Operational risk and mitigation state",
      },
      {
        href: "/dashboard/evolution/activity",
        i18nKey: "evolutionActivity",
        label: "Activity",
        description: "Recent changes across the OS",
      },
    ],
  },
  {
    href: "/dashboard/daily-brief",
    i18nKey: "dailyBrief",
    label: "Daily Brief",
    description: "Morning brief, approvals, and next three actions",
    group: "utility",
  },
  {
    href: "/dashboard/playbooks",
    i18nKey: "playbooks",
    label: "Playbooks",
    description: "Recurring SOPs, trigger rules, and handoff recipes",
    group: "utility",
  },
  {
    href: "/dashboard/command",
    i18nKey: "command",
    label: "Command",
    description: "Search, route, and dispatch work from one palette",
    group: "utility",
  },
  {
    href: "/dashboard/ai",
    i18nKey: "ai",
    label: "AI Console",
    description: "Chat, council, and direct orders to Claude and Codex",
    group: "utility",
    children: [
      {
        href: "/dashboard/ai",
        i18nKey: "aiOverview",
        label: "Overview",
        description: "Agent status, OS pulse, and open orders at a glance",
      },
      {
        href: "/dashboard/ai/chat",
        i18nKey: "aiChat",
        label: "Chat",
        description: "Multi-agent chat with Claude and Codex in one rail",
      },
      {
        href: "/dashboard/ai/council",
        i18nKey: "aiCouncil",
        label: "Council",
        description: "Let Claude and Codex review, debate, and converge",
      },
      {
        href: "/dashboard/ai/orders",
        i18nKey: "aiOrders",
        label: "Orders",
        description: "Direct orders, task creation, and execution tracking",
      },
    ],
  },
  {
    href: "/dashboard/settings",
    i18nKey: "settings",
    label: "Settings",
    description: "Environment posture, mappings, and safeguards",
    group: "utility",
  },
];

/**
 * Shell topbar action buttons. `i18nKey` maps into the `shellAction.*`
 * namespace in the hub's translation messages.
 */
export const shellActions = [
  {
    href: "/dashboard/daily-brief",
    i18nKey: "openBrief",
    label: "Open Brief",
    tone: "secondary",
  },
  {
    href: "/dashboard/work",
    i18nKey: "openWork",
    label: "Open Work OS",
    tone: "secondary",
  },
  {
    href: "/dashboard/content/studio",
    i18nKey: "openStudio",
    label: "Open Studio",
    tone: "primary",
  },
  {
    href: "/dashboard/command",
    i18nKey: "openCommand",
    label: "Open Command",
    tone: "ghost",
  },
  {
    href: "/dashboard/ai",
    i18nKey: "openAiConsole",
    label: "Open AI Console",
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

/**
 * Roadmap horizon classifier.
 *
 * Buckets roadmap rows into three time-pressure horizons based on the
 * raw `dueAt` timestamp. Preserved by both `mapGitHubRoadmapRows` and
 * `mapLocalRoadmapRows` in `server-data.js`.
 *
 * Rules (referenceDate defaults to "now"):
 *   - now    : overdue OR due within 14 days
 *   - next   : due 14–45 days out
 *   - later  : due beyond 45 days, or no dueAt set
 *
 * Each returned row is enriched with `daysToDue`, `slipTone`,
 * and `slipLabel` for the Now/Next/Later board UI.
 */
export const ROADMAP_HORIZON_WINDOW = {
  NOW_DAYS: 14,
  NEXT_DAYS: 45,
};

export function bucketRoadmapByHorizon(rows, referenceDate = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { now: [], next: [], later: [] };
  }

  const refMs = referenceDate instanceof Date ? referenceDate.getTime() : Date.now();

  return rows.reduce(
    (acc, row) => {
      const dueMs = row?.dueAt ? new Date(row.dueAt).getTime() : NaN;
      if (!Number.isFinite(dueMs)) {
        acc.later.push({ ...row, daysToDue: null, slipTone: null, slipLabel: null });
        return acc;
      }

      const daysToDue = Math.round((dueMs - refMs) / (24 * 60 * 60 * 1000));
      const enriched = {
        ...row,
        daysToDue,
        slipTone: daysToDue < 0 ? "slip" : daysToDue <= 7 ? "soon" : "ok",
        slipLabel:
          daysToDue < 0
            ? `${Math.abs(daysToDue)}d over`
            : daysToDue === 0
              ? "due today"
              : `D-${daysToDue}`,
      };

      if (daysToDue <= ROADMAP_HORIZON_WINDOW.NOW_DAYS) {
        acc.now.push(enriched);
      } else if (daysToDue <= ROADMAP_HORIZON_WINDOW.NEXT_DAYS) {
        acc.next.push(enriched);
      } else {
        acc.later.push(enriched);
      }
      return acc;
    },
    { now: [], next: [], later: [] },
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

export const integrationCatalog = [
  {
    provider: "Supabase",
    lane: "Source of truth",
    status: "connected",
    tone: "green",
    priority: "P0",
    mode: "REST + database",
    required: [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY",
      "COM_MOON_DEFAULT_WORKSPACE_ID",
    ],
    detail: "The hub, engine, logs, webhook ledger, and sync ledger all read and write through Supabase.",
    nextAction: "Fill the env values and seed one real workspace before wiring more providers.",
  },
  {
    provider: "Telegram",
    lane: "Inbound command lane",
    status: "ready",
    tone: "blue",
    priority: "P0",
    mode: "Webhook intake",
    required: [
      "Public engine URL",
      "Telegram bot webhook registration",
    ],
    detail: "The engine already exposes /api/webhook/telegram and can process slash-style command payloads.",
    nextAction: "Register the Telegram bot webhook against the engine URL and run one smoke test.",
  },
  {
    provider: "Project tools",
    lane: "PM / external progress",
    status: "ready",
    tone: "blue",
    priority: "P0",
    mode: "Webhook intake",
    required: [
      "Public engine URL",
      "Payload mapping to /api/webhook/project",
    ],
    detail: "Any PM tool can report progress and PMS events through the generic project webhook contract.",
    nextAction: "Map one external project system into the webhook payload and verify persistence.",
  },
  {
    provider: "GitHub",
    lane: "Build history and roadmap",
    status: "ready",
    tone: "blue",
    priority: "P0",
    mode: "REST sync",
    required: [
      "GITHUB_TOKEN",
      "GITHUB_REPOSITORIES",
    ],
    detail: "GitHub should feed commit motion, PR state, issue pressure, and milestone progress directly into PMS and roadmap views.",
    nextAction: "Add one token and the tracked repositories, then surface issues, PRs, commits, and milestones inside Work OS.",
  },
  {
    provider: "Notion",
    lane: "Projects, docs, decisions",
    status: "planned",
    tone: "warning",
    priority: "P1",
    mode: "API sync",
    required: [
      "NOTION_TOKEN",
      "Notion database IDs",
    ],
    detail: "Best fit for syncing projects, tasks, decisions, notes, and operating docs into the hub ledger.",
    nextAction: "Create one integration_connections row and define field_mappings for projects and tasks first.",
  },
  {
    provider: "Google Calendar",
    lane: "Cadence and due dates",
    status: "ready",
    tone: "blue",
    priority: "P1",
    mode: "OAuth + sync + event write",
    required: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_CALENDAR_ID",
    ],
    detail: "Google Calendar can now be connected from Work OS, synced into the shared calendar, and used for creating or updating events.",
    nextAction: "Fill Google OAuth env values, connect one calendar, then decide which external events should also write back into tasks or routines.",
  },
  {
    provider: "Samsung Calendar",
    lane: "Device calendar visibility",
    status: "supported via Google sync",
    tone: "muted",
    priority: "P2",
    mode: "Device sync through Google account",
    required: [
      "Google Calendar connected",
      "Samsung Calendar app syncing the same Google account",
    ],
    detail: "Samsung Calendar is best supported by syncing the same Google calendar on the Galaxy device, so hub-created schedules appear in Samsung Calendar too.",
    nextAction: "Connect Google Calendar in the hub first, then enable that Google account inside Samsung Calendar on the device.",
  },
  {
    provider: "Email",
    lane: "Inbox and outbound",
    status: "planned",
    tone: "warning",
    priority: "P1",
    mode: "Inbox sync + send provider",
    required: [
      "Choose Gmail API or IMAP for inbox sync",
      "Choose SMTP, Resend, or Postmark for outbound mail",
    ],
    detail: "Email should support lead follow-up, campaign sends, and inbound message visibility in one lane.",
    nextAction: "Decide whether inbox sync or outbound send is the first milestone, then standardize the provider.",
  },
  {
    provider: "Slack",
    lane: "Alerts and approvals",
    status: "planned",
    tone: "warning",
    priority: "P2",
    mode: "Bot + webhook",
    required: [
      "SLACK_BOT_TOKEN",
      "SLACK_SIGNING_SECRET",
      "Target channel routing",
    ],
    detail: "Slack is best used for failure alerts, approval requests, and lightweight operator commands.",
    nextAction: "Start with error_logs and sync_runs alerts before adding two-way command handling.",
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

export const contentQueueRoster = [
  {
    id: "queue-idea-1",
    title: "브랜딩 운영 구조화",
    stage: "idea",
    brand: "classin",
    owner: "Boss",
    due: "이번 주",
    nextAction: "문제 정의를 한 줄로 줄이기",
    note: "research",
  },
  {
    id: "queue-idea-2",
    title: "실무형 세일즈 리듬",
    stage: "idea",
    brand: "moltbot",
    owner: "Content lane",
    due: "다음 주",
    nextAction: "카드뉴스 첫 장 훅 만들기",
    note: "meeting",
  },
  {
    id: "queue-draft-1",
    title: "콘텐츠 자동화 실전 흐름",
    stage: "draft",
    brand: "classin",
    owner: "Boss",
    due: "내일",
    nextAction: "증거 문장과 CTA 정리",
    note: "brief",
  },
  {
    id: "queue-draft-2",
    title: "문의 전환형 랜딩 구조",
    stage: "draft",
    brand: "classin",
    owner: "Web lane",
    due: "이번 주",
    nextAction: "독자 문제를 더 앞에 배치",
    note: "idea",
  },
  {
    id: "queue-review-1",
    title: "허브 OS 운영 데스크 소개",
    stage: "review",
    brand: "moltbot",
    owner: "Boss",
    due: "오늘",
    nextAction: "퍼블릭 톤과 허브 톤 차이 검수",
    note: "repurpose",
  },
  {
    id: "queue-review-2",
    title: "카드뉴스 템플릿 실험",
    stage: "review",
    brand: "moltbot",
    owner: "Content lane",
    due: "오늘",
    nextAction: "첫 장 문장 리듬 다듬기",
    note: "research",
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
    name: "OpenClaw Shared Intake",
    method: "POST",
    path: "/api/webhook/project/openclaw",
    status: "ready",
    note: "Shared agent route for OpenClaw-style project progress payloads.",
  },
  {
    name: "Moltbot Shared Intake",
    method: "POST",
    path: "/api/webhook/project/moltbot",
    status: "ready",
    note: "Shared agent route for Moltbot project or PMS event payloads.",
  },
  {
    name: "Engine Health",
    method: "GET",
    path: "/api/health",
    status: "active",
    note: "Reports service readiness, active routes, and command support.",
  },
];

export const emailChannels = [
  {
    id: "resend",
    name: "Resend API",
    mode: "Direct send",
    status: "primary",
    tone: "green",
    detail: "Engine calls Resend SDK directly. Sends are recorded into email_sends.",
    envHint: "RESEND_API_KEY, EMAIL_FROM_ADDRESS",
    nextAction: "Verify the sender domain and run one dry-send before promoting to live.",
  },
  {
    id: "n8n",
    name: "n8n Workflow",
    mode: "Trigger forward",
    status: "ready",
    tone: "blue",
    detail: "Engine emits a webhook event; n8n owns the actual provider call and follow-up.",
    envHint: "N8N_EMAIL_WEBHOOK_URL",
    nextAction: "Wire the n8n webhook URL and the workflow that handles delivery.",
  },
  {
    id: "gmail",
    name: "Gmail (Boss)",
    mode: "OAuth send",
    status: "planned",
    tone: "warning",
    detail: "Personal-name sending for warm follow-up. Reuses the existing Google OAuth.",
    envHint: "GOOGLE_CLIENT_ID, GOOGLE_REFRESH_TOKEN_BOSS",
    nextAction: "Reuse the calendar OAuth client and grant gmail.send scope.",
  },
];

export const emailTemplates = [
  {
    id: "lead-followup-warm",
    name: "Warm lead follow-up",
    audience: "Inbound lead",
    channel: "resend",
    purpose: "First-touch reply within an hour of the form submission.",
    subject: "{{lead_name}}님, 문의 주신 내용 확인했습니다",
    cta: "30분 통화 잡기",
    lastUsed: "Today",
    status: "ready",
  },
  {
    id: "weekly-brief",
    name: "Weekly operator brief",
    audience: "Newsletter list",
    channel: "resend",
    purpose: "Friday digest with this week's signal, decisions, and next focus.",
    subject: "이번 주 운영 브리프 — {{week_label}}",
    cta: "전체 브리프 보기",
    lastUsed: "3 days ago",
    status: "ready",
  },
  {
    id: "publish-handoff",
    name: "Publish handoff to client",
    audience: "Client account",
    channel: "n8n",
    purpose: "Send the published card-news pack with usage notes.",
    subject: "{{brand}} 카드뉴스 배포 완료",
    cta: "성과 리포트 보기",
    lastUsed: "Last week",
    status: "ready",
  },
  {
    id: "personal-intro",
    name: "Personal intro from boss",
    audience: "Hand-picked prospect",
    channel: "gmail",
    purpose: "Personal-name intro after a referral or warm intro.",
    subject: "{{lead_name}}님, 잠깐 인사드립니다",
    cta: "다음 주 차 한 잔",
    lastUsed: "Draft",
    status: "draft",
  },
];

export const emailQueue = [
  {
    id: "queue-warm-1",
    template: "Warm lead follow-up",
    recipient: "잠재 고객 A",
    channel: "resend",
    scheduledFor: "Today 10:30",
    status: "scheduled",
    note: "리드 폼에서 들어온 문의 — 한 시간 안에 자동 발송 예정",
  },
  {
    id: "queue-weekly-1",
    template: "Weekly operator brief",
    recipient: "Newsletter list (148)",
    channel: "resend",
    scheduledFor: "Fri 09:00",
    status: "scheduled",
    note: "주간 브리프 — 자동화 큐에서 대기 중",
  },
  {
    id: "queue-publish-1",
    template: "Publish handoff to client",
    recipient: "Client - 브랜드 B",
    channel: "n8n",
    scheduledFor: "Awaiting publish",
    status: "blocked",
    note: "퍼블리시 완료 이벤트가 들어오면 트리거",
  },
  {
    id: "queue-personal-1",
    template: "Personal intro from boss",
    recipient: "잠재 파트너 C",
    channel: "gmail",
    scheduledFor: "Manual",
    status: "draft",
    note: "보스 검수 후 수동 발송",
  },
];

export const emailSends = [
  {
    id: "send-1",
    title: "Warm lead follow-up — 잠재 고객 D",
    channel: "resend",
    status: "delivered",
    time: "08:42",
    detail: "자동화로 즉시 발송, 5분 안에 클라이언트가 열람",
  },
  {
    id: "send-2",
    title: "Weekly operator brief — Newsletter list",
    channel: "resend",
    status: "delivered",
    time: "지난주 금",
    detail: "148명 발송, 오픈율 41%, 답장 3건",
  },
  {
    id: "send-3",
    title: "Publish handoff — 브랜드 A",
    channel: "n8n",
    status: "failed",
    time: "어제",
    detail: "n8n 워크플로 연결 실패, evolution/logs 에 기록",
  },
  {
    id: "send-4",
    title: "Personal intro — 잠재 파트너 B",
    channel: "gmail",
    status: "scheduled",
    time: "오늘 14:00",
    detail: "보스 검수 후 수동 발송 예정",
  },
];

export const emailSegments = [
  {
    id: "all",
    label: "전체 리드",
    count: 148,
    audience: "any",
    tone: "blue",
    note: "뉴스레터·잠재고객·클라이언트가 모두 묶인 기본 리스트",
    sample: {
      lead_name: "잠재 고객",
      brand: "Com_Moon",
      week_label: "이번 주",
      cta_label: "30분 통화 잡기",
      signature: "문준혁 | Com_Moon",
    },
  },
  {
    id: "warm",
    label: "Warm leads",
    count: 12,
    audience: "Inbound lead",
    tone: "warning",
    note: "최근 7일 안에 문의했거나 답장한 사람들",
    sample: {
      lead_name: "잠재 고객 A",
      brand: "ClassIn",
      week_label: "이번 주",
      cta_label: "30분 통화 잡기",
      signature: "문준혁 | Com_Moon",
    },
  },
  {
    id: "newsletter",
    label: "Newsletter list",
    count: 148,
    audience: "Newsletter list",
    tone: "blue",
    note: "주간 운영 브리프 수신 동의 리스트",
    sample: {
      lead_name: "구독자",
      brand: "Com_Moon",
      week_label: "이번 주 (4월 2주차)",
      cta_label: "전체 브리프 보기",
      signature: "Com_Moon Weekly",
    },
  },
  {
    id: "clients",
    label: "Active clients",
    count: 8,
    audience: "Client account",
    tone: "green",
    note: "퍼블리시·운영 핸드오프가 진행 중인 클라이언트",
    sample: {
      lead_name: "클라이언트 담당자",
      brand: "ClassIn",
      week_label: "이번 주",
      cta_label: "성과 리포트 보기",
      signature: "문준혁 | Com_Moon",
    },
  },
  {
    id: "personal",
    label: "Hand-picked",
    count: 3,
    audience: "Hand-picked prospect",
    tone: "muted",
    note: "보스 직접 발송 — 소개·인사 메일 전용",
    sample: {
      lead_name: "OOO님",
      brand: "Com_Moon",
      week_label: "이번 주",
      cta_label: "다음 주 차 한 잔",
      signature: "준혁 드림",
    },
  },
];

export const emailVariables = [
  {
    token: "{{lead_name}}",
    label: "Lead 이름",
    description: "수신자 이름. 세그먼트 샘플로 미리보기에서 즉시 치환됩니다.",
  },
  {
    token: "{{brand}}",
    label: "브랜드",
    description: "현재 운영 중인 브랜드 컨텍스트.",
  },
  {
    token: "{{week_label}}",
    label: "주차 라벨",
    description: "주간 브리프 발송 시 자동으로 채워집니다.",
  },
  {
    token: "{{cta_label}}",
    label: "CTA 라벨",
    description: "버튼 또는 마무리 문장의 행동 라벨.",
  },
  {
    token: "{{signature}}",
    label: "서명",
    description: "발송 채널에 맞춘 보스/팀 서명.",
  },
];

export const emailBlocks = [
  {
    id: "block-greeting",
    label: "인사",
    body: "{{lead_name}}님, 안녕하세요.\nCom_Moon 운영팀입니다.\n",
  },
  {
    id: "block-followup",
    label: "후속 본문",
    body: "지난번 남겨주신 문의 잘 확인했습니다.\n이번 주 안에 짧게 통화 한 번 가능하실까요?\n",
  },
  {
    id: "block-weekly",
    label: "주간 브리프 본문",
    body: "{{week_label}} 운영 브리프입니다.\n\n- 이번 주 가장 강하게 움직인 신호 한 가지\n- 그에 따라 결정된 다음 액션\n- 다음 주 우선순위\n\n",
  },
  {
    id: "block-cta",
    label: "CTA 문단",
    body: "\n[ {{cta_label}} ]\n\n링크가 어렵게 느껴지시면 이 메일에 그대로 답장 주셔도 좋습니다.\n",
  },
  {
    id: "block-signature",
    label: "서명",
    body: "\n— {{signature}}\n",
  },
];

export const emailRules = [
  {
    title: "Provider lock by template",
    detail:
      "Each template should declare its delivery channel so the operator never sends a personal-name email through Resend by mistake.",
  },
  {
    title: "Dry-run before live",
    detail:
      "Any template moved to ready must pass one dry-run send to a control inbox before its first real recipient.",
  },
  {
    title: "Failure surfaces immediately",
    detail:
      "Failed sends must show up in this lane and in evolution/logs, never silently retried in the background.",
  },
];

// ── Plan tracker (master-roadmap.md vs current state) ────────────
// Today reference: 2026-04-11. Variance is in days; negative = ahead.

export const planSnapshot = {
  asOf: "2026-04-11",
  source: "docs/master-roadmap.md + docs/master-plan.md",
  note: "현재 페이즈 진척과 마스터 로드맵 계획치를 비교한 운영자용 스냅샷.",
};

export const planPhases = [
  {
    id: "phase-0",
    label: "Phase 0",
    title: "Foundation",
    plannedPct: 100,
    actualPct: 100,
    plannedEnd: "2025-12-31",
    actualEnd: "2025-12-22",
    varianceDays: -9,
    status: "ahead",
    scope: "Turborepo + PWA + Supabase + hub-gateway / content-manager 패키지 골격",
    note: "9일 빠른 완료. 셋업이 작게 잘렸고 다른 페이즈를 지원하기에 충분한 형태로 마감됨.",
  },
  {
    id: "phase-1",
    label: "Phase 1",
    title: "Hub OS 가동",
    plannedPct: 90,
    actualPct: 78,
    plannedEnd: "2026-04-04",
    actualEnd: "2026-04-25",
    varianceDays: 21,
    status: "behind",
    scope: "Dashboard / Daily Brief / Playbooks / Settings / Command + error_logs",
    note: "Settings 폴리싱과 Supabase live read 연결이 잔량. 현재 페이스로는 4월 말 마감 예상.",
  },
  {
    id: "phase-2",
    label: "Phase 2",
    title: "Content / Sales 모듈",
    plannedPct: 55,
    actualPct: 48,
    plannedEnd: "2026-05-09",
    actualEnd: "2026-05-16",
    varianceDays: 7,
    status: "watch",
    scope: "ClassIn 콘텐츠 매니저 이식 + Sales/Branding 지표 시각화",
    note: "Studio + Queue 골격 완료, 백엔드 swap 슬라이스 대기 중.",
  },
  {
    id: "phase-3",
    label: "Phase 3",
    title: "AI 오케스트레이션",
    plannedPct: 15,
    actualPct: 8,
    plannedEnd: "2026-06-13",
    actualEnd: "2026-06-22",
    varianceDays: 9,
    status: "watch",
    scope: "n8n 파이프라인 + Strategist AI + 자가 발전 루프",
    note: "이메일 자동발송 UI 스켈레톤만 존재. provider 어댑터 작업 미시작.",
  },
];

export const planProjects = [
  {
    id: "hub-os",
    name: "Hub OS activation",
    owner: "Boss",
    plannedPct: 88,
    actualPct: 78,
    plannedDate: "2026-04-04",
    expectedDate: "2026-04-25",
    varianceDays: 21,
    status: "behind",
    nextMilestone: "Live Supabase reads in dashboard blocks",
    blocker: "Settings 폴리싱 + Supabase swap",
  },
  {
    id: "content-engine",
    name: "Content engine rollout",
    owner: "Content lane",
    plannedPct: 60,
    actualPct: 58,
    plannedDate: "2026-04-25",
    expectedDate: "2026-05-02",
    varianceDays: 7,
    status: "watch",
    nextMilestone: "Card-news export pipeline",
    blocker: "HTML/PNG/ZIP 자동화 미구성",
  },
  {
    id: "email-automation",
    name: "Email auto-send",
    owner: "Engine lane",
    plannedPct: 35,
    actualPct: 22,
    plannedDate: "2026-05-02",
    expectedDate: "2026-05-16",
    varianceDays: 14,
    status: "behind",
    nextMilestone: "Resend route + dry-run 큐",
    blocker: "Provider 어댑터 미작성",
  },
  {
    id: "public-funnel",
    name: "Public funnel fit",
    owner: "Web lane",
    plannedPct: 40,
    actualPct: 34,
    plannedDate: "2026-04-30",
    expectedDate: "2026-05-09",
    varianceDays: 9,
    status: "watch",
    nextMilestone: "Trust + cases + contact 페이지",
    blocker: "Proof block 카피 부재",
  },
  {
    id: "project-webhook",
    name: "Project webhook intake",
    owner: "Engine lane",
    plannedPct: 60,
    actualPct: 64,
    plannedDate: "2026-04-11",
    expectedDate: "2026-04-09",
    varianceDays: -2,
    status: "ahead",
    nextMilestone: "외부 PM 도구 한 개 매핑",
    blocker: null,
  },
];

export const planMilestones = [
  {
    id: "ms-1",
    title: "Hub Dashboard live read",
    project: "Hub OS activation",
    plannedDate: "2026-03-28",
    actualDate: "2026-04-15",
    varianceDays: 18,
    status: "behind",
  },
  {
    id: "ms-2",
    title: "Content Studio + Queue 골격",
    project: "Content engine rollout",
    plannedDate: "2026-04-09",
    actualDate: "2026-04-08",
    varianceDays: -1,
    status: "ahead",
  },
  {
    id: "ms-3",
    title: "Email composer UI",
    project: "Email auto-send",
    plannedDate: "2026-04-25",
    actualDate: "2026-04-11",
    varianceDays: -14,
    status: "ahead",
  },
  {
    id: "ms-4",
    title: "Resend dry-run route",
    project: "Email auto-send",
    plannedDate: "2026-04-30",
    actualDate: "2026-05-14",
    varianceDays: 14,
    status: "behind",
  },
  {
    id: "ms-5",
    title: "Public homepage 정렬",
    project: "Public funnel fit",
    plannedDate: "2026-04-18",
    actualDate: "2026-04-25",
    varianceDays: 7,
    status: "watch",
  },
  {
    id: "ms-6",
    title: "Project webhook normalization",
    project: "Project webhook intake",
    plannedDate: "2026-04-04",
    actualDate: "2026-04-02",
    varianceDays: -2,
    status: "ahead",
  },
];

export const planDriftItems = [
  {
    id: "drift-hub-supabase",
    title: "Hub Dashboard live read 18일 지연",
    detail: "Supabase 환경 변수 정리가 우선 — SUPABASE_URL / SERVICE_ROLE_KEY 확정 후 대시보드 블록의 시드를 차례로 떼어낼 수 있다.",
    severity: "danger",
    nextMove: "Settings → Environment 페이지에서 키 확정",
    href: "/dashboard/settings",
  },
  {
    id: "drift-resend",
    title: "Resend dry-run 라우트 14일 지연",
    detail: "Provider 어댑터가 없는 게 가장 큰 막힘. 어댑터 모듈 1개만 만들면 자동발송 큐가 풀린다.",
    severity: "warning",
    nextMove: "apps/engine/lib/email/resend.ts 신규",
    href: "/dashboard/automations/email",
  },
  {
    id: "drift-public-proof",
    title: "Public funnel proof block 카피 부재",
    detail: "페이지 골격은 이미 있다. 필요한 건 짧은 신뢰 카피 한 세트와 케이스 1~2개.",
    severity: "warning",
    nextMove: "/dashboard/content/queue 에서 'public-proof' draft 만들기",
    href: "/dashboard/content/queue",
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

/**
 * AI Console fallback data. Wires the new /dashboard/ai surfaces with enough
 * signal to render a meaningful mock: agent posture, live chat, council turns,
 * open orders, and the OS/automation pulse the operator wants to keep in view.
 */
export const aiAgents = [
  {
    id: "claude",
    name: "Claude",
    role: "Opus 4.6 · Planner & reviewer",
    status: "ready",
    latency: "220ms",
    load: "2 / 8",
    focus: "Hub UX revision for AI console tab",
    tone: "green",
  },
  {
    id: "codex",
    name: "Codex",
    role: "GPT-5 · Implementation lane",
    status: "working",
    latency: "310ms",
    load: "5 / 8",
    focus: "Engine webhook provider split refactor",
    tone: "blue",
  },
  {
    id: "engine",
    name: "Engine",
    role: "Com_Moon automation worker",
    status: "live",
    latency: "180ms",
    load: "3 / 6",
    focus: "Card-news run queue drain",
    tone: "green",
  },
];

export const aiChatThreads = [
  {
    id: "thread-ai-console",
    title: "AI console tab scaffolding",
    target: "Claude + Codex",
    updated: "방금",
    preview: "네비게이션과 i18n에 ai 탭을 추가하고 챗/카운슬/오더 뷰를 배선합니다.",
    unread: 2,
    status: "active",
  },
  {
    id: "thread-webhook",
    title: "Engine webhook provider split",
    target: "Codex",
    updated: "14분 전",
    preview: "/api/webhook/project/[provider] 라우트로 분기 로직을 옮기는 중입니다.",
    unread: 0,
    status: "in-progress",
  },
  {
    id: "thread-studio-qa",
    title: "Studio 카피 톤 교정",
    target: "Claude",
    updated: "오늘 09:12",
    preview: "카드뉴스 톤을 '조용한 프리미엄'으로 다시 맞추는 편집 제안입니다.",
    unread: 0,
    status: "paused",
  },
];

export const aiChatMessages = [
  {
    id: "msg-1",
    author: "operator",
    authorLabel: "You",
    time: "09:41",
    body: "Hub에 AI 콘솔 탭을 새로 붙일 거야. Moonstone 미학 지키면서 챗, 카운슬, 오더 뷰 구조 잡아줘.",
  },
  {
    id: "msg-2",
    author: "claude",
    authorLabel: "Claude",
    time: "09:41",
    body: "탭은 utility 그룹에 넣고 children 4개(overview/chat/council/orders)로 쪼개겠습니다. Overview는 signal-first KPI + 에이전트 상태, Chat은 단일 대화, Council은 멀티-에이전트 턴, Orders는 직접 명령 투입과 생성된 작업 추적입니다.",
  },
  {
    id: "msg-3",
    author: "codex",
    authorLabel: "Codex",
    time: "09:42",
    body: "구조 동의. 라우팅은 app/dashboard/ai/{page.jsx,chat/page.jsx,council/page.jsx,orders/page.jsx} 네 파일로 가는 게 깔끔합니다. navigationItems children 순서만 지키면 쉘이 탭 스위처를 자동으로 렌더링합니다.",
  },
  {
    id: "msg-4",
    author: "claude",
    authorLabel: "Claude",
    time: "09:43",
    body: "server-data.js에 getAiConsolePageData를 추가해서 에이전트 · 스레드 · 오더 · 자동화 상태를 한 번에 내려주면 각 서브 페이지가 같은 fetch를 재사용할 수 있어요.",
  },
];

export const aiChatComposerSuggestions = [
  "/order claude plan=AI 콘솔 chat UI 최종 Moonstone 준수 검토",
  "/order codex task=engine webhook 분기 로직 /api/webhook/project/[provider] 추출",
  "/council topic='AI 콘솔 탭 구조' members=claude,codex",
  "/status automations lane=live",
];

export const aiCouncilSessions = [
  {
    id: "council-ai-console",
    topic: "AI 콘솔 탭 범위와 오픈 오더 UX",
    members: ["Claude", "Codex"],
    status: "수렴 중",
    tone: "blue",
    turns: [
      {
        author: "Claude",
        stance: "제안",
        time: "09:44",
        body: "챗과 오더를 한 화면에 합치면 Moonstone 원칙인 'signal first'가 깨집니다. Chat은 대화에, Orders는 작업 디스패치에 각각 집중시켜 서브 탭을 유지하는 걸 추천합니다.",
      },
      {
        author: "Codex",
        stance: "보완",
        time: "09:44",
        body: "동의. 다만 Overview에 두 surface를 연결하는 '오픈 오더 5건 → 챗으로 점프' 링크를 두면 왕복 동선을 줄일 수 있습니다.",
      },
      {
        author: "Claude",
        stance: "결정",
        time: "09:45",
        body: "Overview = KPI + 에이전트 상태 + 오픈 오더 · 자동화 스냅샷. Chat = 스레드 레일 + 메시지 + 컴포저. Council = 주제별 턴 로그. Orders = 오더 큐 + 작업 생성 폼. 합의 완료.",
      },
    ],
  },
  {
    id: "council-webhook-split",
    topic: "엔진 웹훅 프로바이더 분리 경로",
    members: ["Claude", "Codex"],
    status: "완료",
    tone: "green",
    turns: [
      {
        author: "Codex",
        stance: "제안",
        time: "08:58",
        body: "/api/webhook/project 아래 [provider] 동적 세그먼트로 옮기고, 공통 핸들러는 lib/shared-webhook.ts에서 재사용합니다.",
      },
      {
        author: "Claude",
        stance: "검토",
        time: "08:59",
        body: "공유 핸들러가 provider 검증을 전담하는지 확인 필요. 공유 모듈 쪽에 보안 검사를 집중시키는 게 맞습니다.",
      },
      {
        author: "Codex",
        stance: "결정",
        time: "09:01",
        body: "검증 로직을 shared-webhook.ts에 통합했고 단위 테스트 스터브를 만들었습니다. 이관 완료.",
      },
    ],
  },
];

export const aiOpenOrders = [
  {
    id: "order-101",
    title: "AI 콘솔 탭 뷰 4종 스캐폴드",
    target: "Claude + Codex",
    status: "실행 중",
    tone: "blue",
    priority: "P1",
    lane: "Hub UX",
    due: "오늘 17:00",
    note: "navigationItems 등록 후 4개 라우트에 mock 데이터 렌더링을 완료해야 합니다.",
  },
  {
    id: "order-102",
    title: "Engine webhook 프로바이더 분기 이관",
    target: "Codex",
    status: "리뷰 대기",
    tone: "warning",
    priority: "P1",
    lane: "Engine",
    due: "내일 오전",
    note: "shared-webhook.ts 통합 후 provider=notion/linear 경로의 회귀 테스트가 필요합니다.",
  },
  {
    id: "order-103",
    title: "카드뉴스 톤 가이드 재정렬",
    target: "Claude",
    status: "큐 대기",
    tone: "muted",
    priority: "P2",
    lane: "Content",
    due: "이번 주",
    note: "Studio에서 최근 3주 발행 카피를 샘플링해 'quiet premium' 기준을 다시 잡습니다.",
  },
  {
    id: "order-104",
    title: "자동화 실패 알림 라우트 정비",
    target: "Codex",
    status: "완료",
    tone: "green",
    priority: "P2",
    lane: "Automations",
    due: "어제",
    note: "실패 시 Slack + 이메일 이중 알림이 발행되도록 확인됨.",
  },
];

export const aiOrderTemplates = [
  {
    id: "tpl-plan",
    title: "Plan → Review → Ship",
    target: "Claude",
    prompt: "Plan the following task, list risks, and return a 5-step execution outline: {{task}}",
  },
  {
    id: "tpl-implement",
    title: "Implement to spec",
    target: "Codex",
    prompt: "Implement the change described below against the current repo. Keep diffs minimal and run lint/typecheck before finishing: {{task}}",
  },
  {
    id: "tpl-council",
    title: "Joint review",
    target: "Claude + Codex",
    prompt: "Open a council on {{topic}}. Claude leads the plan, Codex challenges the implementation path, converge on one decision.",
  },
];

export const aiOsPulse = [
  {
    label: "Work OS",
    value: "12 / 16",
    detail: "활성 프로젝트 12개, 블로커 2개, 마감 임박 4개.",
    tone: "blue",
  },
  {
    label: "Automations",
    value: "3 live",
    detail: "실행 3건, 실패 0건, 마지막 실행 4분 전.",
    tone: "green",
  },
  {
    label: "Content",
    value: "5 큐",
    detail: "초안 3, 리뷰 1, 발행 대기 1.",
    tone: "warning",
  },
  {
    label: "Revenue",
    value: "7 딜",
    detail: "웜 리드 3, 클로즈 임박 2.",
    tone: "muted",
  },
];
