// Sidebar navigation contract — the *visible* information architecture.
//
// Deliberately separate from NAV_TREE in hub-data.js, which stays the full
// 40-destination catalog behind ⌘K search. Adding a route there must not add a
// sidebar row; the sidebar only grows when an anchor is added here. That split
// is the whole point — the old accordion mixed two organizing principles
// (workspace × function) and repeated Projects / Revenue / Follow-ups / Content
// in both, so the operator had to answer "where does this live?" before
// "what am I doing?".
//
// Nine primary + two utility anchors (SIDEBAR_PRIMARY / SIDEBAR_UTILITIES;
// hub-nav.test.mjs pins both counts). Overview was added 2026-07-15 per direct
// operator instruction; the anchor set is not a fixed contract and may change —
// 2026-09-24 the separate 고객 연락 anchor folded into 영업·매출 as its first tab
// (오늘 연락), taking the count from ten back to nine. Organizational context
// moves into one scope control.

export const DEFAULT_SCOPE = 'all';

// Futura 텍스처 라우트는 페이지 헤더 안에 pill 탭을 직접 그린다(§15 2026-09-18).
// 탑바가 같은 탭을 또 그리면 한 화면에 탭 줄이 두 개가 된다. 목록은 여기 한 곳이
// 정본이고, 탭 데이터 자체(topNavigationForRoute)는 그대로 — 위치만 페이지로 옮긴다.
export const PAGE_OWNS_TABS = new Set([
  'dashboard/work/decisions',
]);

export function pageOwnsTabs(activePath) {
  return PAGE_OWNS_TABS.has(pathnameOf(activePath));
}

export const SIDEBAR_SCOPES = [
  { key: 'all', label: '전체' },
  { key: 'classin', label: 'ClassIn' },
  { key: 'personal', label: '개인' },
];

const SCOPE_KEYS = new Set(SIDEBAR_SCOPES.map((s) => s.key));

export function normalizeScope(scope) {
  return SCOPE_KEYS.has(scope) ? scope : DEFAULT_SCOPE;
}

// `owns` lists route prefixes that light the anchor. Resolution is
// longest-prefix-wins (e.g. `dashboard/work/goals` lands on 내 작업 even though
// `dashboard/work` belongs to 프로젝트). Every route therefore maps to at most
// one anchor.
//
// 할 일 and 프로젝트·기획 share the Projects surface: the same route is split by
// the `view` query (`todos` → 할 일, anything else → 프로젝트·기획), which is why
// 할 일 owns no prefix of its own.
//
// `children` is the second navigation level (2026-07-15 spec): a manual
// accordion under each anchor, keyed by scope because the *composition* can
// differ per scope (e.g. 세그먼트 exists only in the ClassIn CRM). Every child
// path must be owned by its parent anchor so navigating a child never moves
// the highlight elsewhere. Scope lists with fewer than two entries render no
// sub-list — the anchor itself is the destination.

// Second-level destinations, defined once so the per-scope tables stay readable.
// ?scope=personal은 실제로 소비하는 표면에만 붙인다 — 소비자가 없는 표면에 붙이면
// 같은 데이터를 두고 개인 필터가 걸린 척하는 과약속이다(5차 재감사 S). 2026-09-24 실측:
// 거래(Deals의 useScopeFilter)·문의(inquiryScopeForWorkspace)·고객(Customers의 ?scope= 목록
// 범위, 2026-09-24 고객 탭 재구성)이 읽는다. 오늘 연락(followups 전역 큐)은 아직 읽지 않는다 —
// 읽게 되면 여기에 키를 더한다.
const SCOPE_CONSUMING_CHILD_KEYS = new Set(['rev-customers', 'rev-deals', 'rev-inquiries']);
function personalScoped(children) {
  return children.map((c) => (
    SCOPE_CONSUMING_CHILD_KEYS.has(c.key) ? { ...c, path: `${c.path}?scope=personal` } : c
  ));
}

// 영업·매출 4탭 — 2026-09-24 운영자 확정(목업 검토 뒤 "진행"). 이전 9개 목적지(개요·문의
// 내역·고객 DB·매출 히트맵·Leads·Deals·Accounts·Cases + 별도 앵커 고객 연락)를 매일 여는
// 한 탭(오늘 연락)과 찾아볼 때 가는 세 탭으로 줄였다. docs/superpowers/specs/
// 2026-09-24-revenue-four-tabs-design.md가 정본이다.
//
// `tab`은 탭의 역할 이름이다. 스코프마다 경로가 달라도(ClassIn의 거래 = classin/pipeline)
// 역할이 같으면 같은 탭이다 — 탭에서 내려온 옛 화면이 가장 가까운 탭을 켜는 것
// (REVENUE_ROUTE_TABS)과 스코프 전환 때 같은 탭으로 재진입하는 것(tabForRouteRole)이
// 모두 이 역할로 맞춘다.
const REVENUE_CHILDREN = [
  { key: 'rev-followups', tab: 'followups', label: '오늘 연락', path: 'dashboard/revenue/followups' },
  { key: 'rev-customers', tab: 'customers', label: '고객', path: 'dashboard/revenue/customers' },
  { key: 'rev-deals', tab: 'deals', label: '거래', path: 'dashboard/revenue/deals' },
  { key: 'rev-inquiries', tab: 'inquiries', label: '문의', path: 'dashboard/revenue/inquiries' },
];
// 개인 스코프 다섯 번째 탭 — 30일 현금 흐름 로드맵(2026-08-31 개인 매출 로드맵, 운영자 확정
// 기능)은 개요 라우트의 scope=personal이 연다. 개요 자체는 탭에서 내려갔지만 이 로드맵은
// 계속 한 번에 닿아야 한다.
const REVENUE_PERSONAL_CHILDREN = [
  ...personalScoped(REVENUE_CHILDREN),
  { key: 'rev-cashflow', tab: 'cashflow', label: '현금 흐름', path: 'dashboard/revenue/overview?scope=personal' },
];
// ClassIn 스코프: 거래는 workspace="classin" Deals(classin/pipeline). 고객 목록(Customers)은
// 아직 scope를 읽지 않으므로 ClassIn으로 걸러진 가장 가까운 표면인 classin Leads 별칭을
// 고객 탭으로 쓴다 — Customers가 scope=classin을 소비하게 되면 그 경로로 바꾼다(스펙 미정 항목).
// 세그먼트는 ClassIn CRM에만 있는 표면이라 이 스코프에서만 다섯 번째 탭이다.
const REVENUE_CLASSIN_CHILDREN = [
  { key: 'rev-followups', tab: 'followups', label: '오늘 연락', path: 'dashboard/revenue/followups' },
  { key: 'rev-ci-customers', tab: 'customers', label: '고객', path: 'dashboard/revenue/customers?scope=classin' },
  { key: 'rev-ci-deals', tab: 'deals', label: '거래', path: 'dashboard/classin/pipeline' },
  { key: 'rev-ci-inquiries', tab: 'inquiries', label: '문의', path: 'dashboard/revenue/inquiries?scope=classin' },
  { key: 'rev-ci-segments', tab: 'segments', label: '세그먼트', path: 'dashboard/classin/segments' },
];

// 영업·매출의 각 라우트가 켜는 탭 역할. 탭 경로와 정확히 같은 라우트는 그 탭이 먼저 이기고
// (예: 개인 스코프의 개요 = 현금 흐름), 여기 역할은 그 밖의 경우에만 쓴다 — 다른 스코프의
// 같은 역할 경로와, 탭에서 내려왔지만 PAGE_MAP·⌘K로 계속 열리는 옛 화면이다.
// Leads·Accounts는 고객의 단계, 개요·히트맵은 거래의 보기라서 그 탭을 켠다. Cases는 켤 탭이
// 없다(⌘K 전용) — 역할 없음.
export const REVENUE_ROUTE_TABS = {
  'dashboard/revenue/followups': 'followups',
  'dashboard/classin/followups': 'followups',
  'dashboard/revenue/customers': 'customers',
  'dashboard/classin/revenue': 'customers',
  'dashboard/revenue/leads': 'customers',
  'dashboard/revenue/accounts': 'customers',
  'dashboard/classin/accounts': 'customers',
  'dashboard/revenue/deals': 'deals',
  'dashboard/classin/pipeline': 'deals',
  'dashboard/revenue/overview': 'deals',
  'dashboard/revenue/heatmap': 'deals',
  'dashboard/revenue/inquiries': 'inquiries',
  'dashboard/classin/segments': 'segments',
};

// 탭이 아닌 화면의 탑바 제목. 옛 화면에 서 있으면 가장 가까운 탭이 켜지되 제목은 그 화면
// 자신의 이름으로 남는다 — Leads를 보면서 제목이 '고객'이라고 말하거나, 켤 탭이 없는
// Cases에서 브레드크럼이 '영업·매출' 한 칸으로 무너지지 않게.
export const REVENUE_ROUTE_LABELS = {
  'dashboard/revenue/leads': 'Leads',
  'dashboard/revenue/accounts': 'Accounts',
  'dashboard/classin/revenue': 'Leads',
  'dashboard/classin/accounts': 'Accounts',
  'dashboard/revenue/overview': '개요',
  'dashboard/revenue/heatmap': '매출 히트맵',
  'dashboard/revenue/cases': 'Cases',
  // ClassIn에서만 탭인 화면 — classin/* 경로는 스코프를 ClassIn으로 끌어오지만(deriveSidebarScope),
  // 다른 스코프로 계산돼도 제목은 남긴다.
  'dashboard/classin/segments': '세그먼트',
};

// Calendar · Roadmap · Decisions · Rhythm are global routes today — scope only
// swaps the Projects entry. Scope filtering of these surfaces is Phase 2.
const PLANNING_TAIL = [
  { key: 'prj-calendar', label: 'Calendar', path: 'dashboard/work/calendar' },
  { key: 'prj-roadmap', label: 'Roadmap', path: 'dashboard/work/roadmap' },
  { key: 'prj-decisions', label: 'Decisions', path: 'dashboard/work/decisions' },
  { key: 'prj-rhythm', label: 'Rhythm', path: 'dashboard/work/rhythm' },
];

// 브랜드 탭의 두 번째 레벨 — 목록(정체성·리듬)과 로그(발행 기록)는 별개 표면이라
// 스코프 전환은 목록 쪽에만 의미가 있다(로그는 아직 workspace/scope 인지가 없다 —
// 2026-09-01 브랜드 컨텐츠 로그 스펙). 로그 목적지는 세 스코프에서 동일하게 유지한다.
const BRAND_LOG_CHILD = { key: 'brand-log', label: '컨텐츠 로그', path: 'dashboard/brands/log' };
const BRAND_CHILDREN = {
  all: [{ key: 'brand-list', label: '브랜드 목록', path: 'dashboard/brands' }, BRAND_LOG_CHILD],
  classin: [{ key: 'brand-list', label: '브랜드 목록', path: 'dashboard/brands?scope=classin' }, BRAND_LOG_CHILD],
  personal: [{ key: 'brand-list', label: '브랜드 목록', path: 'dashboard/brands?scope=personal' }, BRAND_LOG_CHILD],
};

const CONTENT_CHILDREN = [
  { key: 'ct-performance', label: '성과', path: 'dashboard/content/performance' },
  { key: 'ct-queue', label: '소재·제작', path: 'dashboard/content/queue' },
  { key: 'ct-studio', label: '원고 작성', path: 'dashboard/content/studio' },
  { key: 'ct-campaigns', label: 'Campaigns', path: 'dashboard/content/campaigns' },
];

// AI·자동화 renders its nine children under two eyebrow group labels.
// Sheets is the one scope-dependent entry (ClassIn owns 시트 동기화).
// `deferred: true` — docs/README §4 보류 스코프(작업·실행/브랜드 자문, Flow 캔버스, Email, 시트
// 동기화 하드게이트, Evolution). 페이지는 접근 가능하되 탭에 '준비 중' 마커를 달아
// 코어와 동일한 완성 표면처럼 보이지 않게 한다(2026-08-05 system-eval — 비핵심 표면이
// 전부 코어 가중치로 노출되던 문제의 정직성 조치). Runs·Webhooks·자동화 개요는 Engine
// 실행 피드백(§1 계약)이라 코어 유지.
function aiChildren(sheetsPath) {
  return [
    { key: 'ai-office', label: 'Office', path: 'dashboard/agents/office-council', group: 'Agents' },
    { key: 'ai-orders', label: '작업·실행', path: 'dashboard/agents/orders', group: 'Agents', deferred: true },
    { key: 'ai-chat', label: '코칭·대화', path: 'dashboard/agents/chat', group: 'Agents' },
    { key: 'ai-council', label: '브랜드 자문', path: 'dashboard/agents/council', group: 'Agents', deferred: true },
    // AutomationsIndex — implemented page (PAGE_MAP) with no sidebar/search row until
    // 2026-07-17. Global (unscoped), so it appears identically in every scope.
    { key: 'ai-automations-overview', label: '자동화 개요', path: 'dashboard/automations', group: 'Automations' },
    { key: 'ai-runs', label: 'Runs', path: 'dashboard/automations/runs', group: 'Automations' },
    { key: 'ai-flows', label: 'Flows', path: 'dashboard/automations/flows', group: 'Automations', deferred: true },
    { key: 'ai-email', label: 'Email', path: 'dashboard/automations/email', group: 'Automations', deferred: true },
    { key: 'ai-webhooks', label: 'Webhooks', path: 'dashboard/automations/webhooks', group: 'Automations' },
    { key: 'ai-sheets', label: 'Sheets', path: sheetsPath, group: 'Automations', deferred: true },
  ];
}

const SETTINGS_CHILDREN = [
  { key: 'sys-settings', label: 'Settings', path: 'dashboard/settings' },
  { key: 'sys-evolution', label: 'Evolution', path: 'dashboard/evolution', deferred: true },
];

const MY_WORK_CHILDREN = [
  { key: 'my-work-list', label: '실행 목록', path: 'dashboard/work/my' },
  { key: 'memos', label: '메모', path: 'dashboard/work/memos' },
  { key: 'daily-review', label: '하루 리뷰', path: 'dashboard/work/daily-review' },
  // OKR·KPI 추적의 본체(2026-09-23 운영자 "위치는 내 작업 하위로, 현황에도 띄우기") —
  // 현황의 같은 이름 탭과 요약 카드는 같은 Goals 기록을 보여 주는 두 번째 입구다.
  { key: 'my-okr', label: 'OKR·KPI', path: 'dashboard/work/goals' },
];

const OVERVIEW_CHILDREN = Object.fromEntries(SIDEBAR_SCOPES.map(({ key }) => [key, [
  { key: 'overview-summary', label: '집계', path: 'dashboard/overview' },
  { key: 'overview-goals', label: 'OKR·KPI', path: `dashboard/overview?view=goals&scope=${key}` },
]]));

export const SIDEBAR_PRIMARY = [
  {
    // Home — Futura 텍스처의 첫 화면(§15 2026-09-18). 같은 daily-brief 기록을 다른
    // 렌즈로 본다. 기본 착지(dashboard → daily-brief)는 아직 바꾸지 않았다.
    key: 'home',
    label: '홈',
    icon: 'navHome',
    scopeAware: false,
    owns: ['dashboard/home'],
    paths: {
      all: 'dashboard/home',
      classin: 'dashboard/home',
      personal: 'dashboard/home',
    },
  },
  {
    key: 'today',
    label: '오늘',
    icon: 'navToday',
    scopeAware: false,
    owns: ['dashboard/daily-brief'],
    paths: {
      all: 'dashboard/daily-brief',
      classin: 'dashboard/daily-brief',
      personal: 'dashboard/daily-brief',
    },
  },
  {
    key: 'overview',
    label: '현황',
    icon: 'navOverview',
    scopeAware: true,
    owns: ['dashboard/overview'],
    children: OVERVIEW_CHILDREN,
    paths: {
      all: 'dashboard/overview',
      classin: 'dashboard/overview',
      personal: 'dashboard/overview',
    },
  },
  {
    // 내 작업 — cross-lane operating surface (tasks + deals + calendar lenses). Owns its
    // own route now; the old Projects ?view=todos split below stays only as bookmark
    // back-compat in isSidebarAnchorActive.
    key: 'tasks',
    label: '내 작업',
    icon: 'navTasks',
    scopeAware: false,
    owns: ['dashboard/work/my', 'dashboard/work/memos', 'dashboard/work/daily-review', 'dashboard/work/goals'],
    children: { all: MY_WORK_CHILDREN, classin: MY_WORK_CHILDREN, personal: MY_WORK_CHILDREN },
    paths: {
      all: 'dashboard/work/my',
      classin: 'dashboard/work/my',
      personal: 'dashboard/work/my',
    },
  },
  {
    key: 'revenue',
    label: '영업·매출',
    icon: 'navRevenue',
    scopeAware: true,
    // 고객 연락 앵커가 2026-09-24 이 앵커의 첫 탭(오늘 연락)으로 들어왔다 — `dashboard/revenue`
    // 접두사가 followups를 덮는다. classin/followups 페이지는 제거됨(LEGACY_REDIRECTS) — owns는
    // 옛 딥링크의 액티브 판정용으로만 유지한다.
    owns: [
      'dashboard/revenue',
      'dashboard/classin/followups',
      'dashboard/classin/pipeline',
      'dashboard/classin/revenue',
      'dashboard/classin/segments',
      'dashboard/classin/accounts',
    ],
    // 착지는 세 스코프 모두 오늘 연락 — 매일 여는 탭이 이것 하나다(2026-09-24). 오늘 연락은
    // 전역 큐라 scope 쿼리를 붙이지 않는다(소비자 없음 — 과약속 금지).
    paths: {
      all: 'dashboard/revenue/followups',
      classin: 'dashboard/revenue/followups',
      personal: 'dashboard/revenue/followups',
    },
    children: {
      all: REVENUE_CHILDREN,
      classin: REVENUE_CLASSIN_CHILDREN,
      personal: REVENUE_PERSONAL_CHILDREN,
    },
    routeTabs: REVENUE_ROUTE_TABS,
    routeLabels: REVENUE_ROUTE_LABELS,
  },
  {
    key: 'discovery', label: '기회 탐색', icon: 'navDiscovery', scopeAware: true,
    owns: ['dashboard/discovery'],
    paths: { all: 'dashboard/discovery', classin: 'dashboard/discovery?scope=classin', personal: 'dashboard/discovery?scope=personal' },
  },
  {
    key: 'projects',
    label: '프로젝트',
    icon: 'navProjects',
    scopeAware: true,
    owns: [
      'dashboard/work',
      'dashboard/projects',
      'dashboard/classin/projects',
      'dashboard/classin/cohorts',
      'dashboard/brand/projects',
    ],
    paths: {
      all: 'dashboard/work/projects',
      classin: 'dashboard/classin/projects',
      personal: 'dashboard/brand/projects',
    },
    children: {
      all: [{ key: 'prj-projects', label: 'Projects', path: 'dashboard/work/projects' }, ...PLANNING_TAIL],
      classin: [{ key: 'prj-projects', label: 'Projects', path: 'dashboard/classin/projects' }, ...PLANNING_TAIL],
      personal: [{ key: 'prj-projects', label: 'Projects', path: 'dashboard/brand/projects' }, ...PLANNING_TAIL],
    },
  },
  {
    // 브랜드 — 정체성·리듬·기록을 소유한다. 콘텐츠 바로 앞에 두어 제작 흐름과
    // 인접하게 하되 표면은 분리한다 (2026-08-29 브랜드 탭 설계 §3·§5.2).
    // 앵커 세트는 고정 계약이 아니다 (2026-07-15 스펙 §3.1) — 비효율이 파악되면 추가한다.
    key: 'brands',
    label: '브랜드',
    icon: 'navBrand',
    scopeAware: true,
    // 라우트가 복수형인 이유: `dashboard/brand/*`는 이미 개인 스코프 별칭이 점유했다.
    owns: ['dashboard/brands'],
    paths: {
      all: 'dashboard/brands',
      classin: 'dashboard/brands?scope=classin',
      personal: 'dashboard/brands?scope=personal',
    },
    children: BRAND_CHILDREN,
  },
  {
    key: 'content',
    label: '콘텐츠',
    icon: 'navContent',
    scopeAware: true,
    owns: [
      'dashboard/content',
      'dashboard/classin/content',
      'dashboard/brand/studio',
      'dashboard/brand/queue',
    ],
    paths: {
      all: 'dashboard/content/queue',
      classin: 'dashboard/classin/content',
      personal: 'dashboard/brand/queue',
    },
    children: {
      all: CONTENT_CHILDREN,
      // ClassIn 콘텐츠 is a single surface — the anchor is the destination.
      classin: [],
      personal: [
        { key: 'ct-queue', label: '소재·제작', path: 'dashboard/brand/queue' },
        { key: 'ct-studio', label: '원고 작성', path: 'dashboard/brand/studio' },
      ],
    },
  },
];

export const SIDEBAR_UTILITIES = [
  {
    key: 'ai',
    label: 'AI·자동화',
    icon: 'navAI',
    scopeAware: false,
    owns: ['dashboard/agents', 'dashboard/automations', 'dashboard/classin/automations'],
    // 대표 경로는 Office — 2026-09-23 운영자 확정. Runs는 하위 탭으로 한 단계 아래에 남고,
    // 보류 스코프(agents/chat·council)는 여전히 착지 지점이 아니다(2026-08-05 re-audit).
    paths: {
      all: 'dashboard/agents/office-council',
      classin: 'dashboard/agents/office-council',
      personal: 'dashboard/agents/office-council',
    },
    children: {
      all: aiChildren('dashboard/automations/sheets'),
      classin: aiChildren('dashboard/classin/automations'),
      personal: aiChildren('dashboard/automations/sheets'),
    },
  },
  {
    key: 'settings',
    label: '설정',
    icon: 'navSettings',
    scopeAware: false,
    owns: ['dashboard/settings', 'dashboard/evolution'],
    paths: {
      all: 'dashboard/settings',
      classin: 'dashboard/settings',
      personal: 'dashboard/settings',
    },
    children: {
      all: SETTINGS_CHILDREN,
      classin: SETTINGS_CHILDREN,
      personal: SETTINGS_CHILDREN,
    },
  },
];

export const SIDEBAR_ANCHORS = [...SIDEBAR_PRIMARY, ...SIDEBAR_UTILITIES];

// Projects renders 'tree' | 'todos' | 'board'. The sidebar links `?view=todos`;
// `?view=tasks` is accepted as an alias so the spec's wording also resolves.
const TASK_VIEWS = new Set(['todos', 'tasks']);

export function isTaskView(view) {
  return TASK_VIEWS.has(String(view || ''));
}

export function resolveSidebarPath(anchorKey, scope) {
  const anchor = SIDEBAR_ANCHORS.find((a) => a.key === anchorKey);
  if (!anchor) return null;
  return anchor.paths[normalizeScope(scope)] || anchor.paths[DEFAULT_SCOPE];
}

// Anchors expanded when no stored preference exists — the operator's daily
// loop (2026-07-15 spec §3.1). Everything else starts collapsed.
export const DEFAULT_EXPANDED_ANCHORS = ['revenue', 'content'];

// Sub-list for an anchor in a scope. Lists with fewer than two entries return
// empty — the anchor itself is the destination, no accordion is rendered.
export function sidebarChildren(anchorKey, scope) {
  const anchor = SIDEBAR_ANCHORS.find((a) => a.key === anchorKey);
  const list = anchor?.children?.[normalizeScope(scope)] || [];
  return list.length > 1 ? list : [];
}

// The tab a route stands for when it is not itself a tab in this scope: another
// scope's path for the same role (ClassIn 거래 = classin/pipeline) or a screen
// that left the tab row but stays routable (Leads → 고객). Anchors without a
// `routeTabs` table have no aliases, so this returns null for them.
export function tabForRouteRole(anchorKey, activePath, scope = DEFAULT_SCOPE) {
  const anchor = SIDEBAR_ANCHORS.find((a) => a.key === anchorKey);
  const role = anchor?.routeTabs?.[pathnameOf(activePath)];
  if (!role) return null;
  return sidebarChildren(anchorKey, scope).find((tab) => tab.tab === role) || null;
}

// Second-level destinations live in the top bar, not in a nested sidebar.
// Keeping this derivation beside the sidebar contract prevents the two shells
// from inventing different labels, scope paths, or active-state rules.
//
// An exact pathname match always wins; the role alias above only applies when
// no tab in this scope is the route itself. `routeLabel` names a screen that is
// not a tab (or only borrows one) so the top bar title stays the screen's own
// name instead of collapsing to the anchor.
export function topNavigationForRoute(activePath, scope = DEFAULT_SCOPE, view) {
  let anchorKey = ownerAnchorKey(activePath);
  // Projects 표면의 To-dos 뷰는 사이드바 소유가 '내 작업'으로 넘어간다 — 탑바도 같은
  // 앵커를 따라가야 한다. 경로 소유자(projects)로 두면 자식 활성 판정(view 인지)과
  // 어긋나 탭 전부 비활성 + 브레드크럼 붕괴가 된다 (2609 감사 #4).
  if (anchorKey === 'projects' && isTaskView(view)) anchorKey = 'tasks';
  const anchor = SIDEBAR_ANCHORS.find((item) => item.key === anchorKey) || null;
  if (!anchor) return { anchor: null, tabs: [], activeTab: null, routeLabel: null };

  const tabs = sidebarChildren(anchor.key, scope);
  const exactTab = tabs.find((tab) => (
    isSidebarChildActive(anchor.key, tab.path, activePath, view)
  )) || null;
  if (exactTab) return { anchor, tabs, activeTab: exactTab, routeLabel: null };

  const activeTab = isSidebarAnchorActive(anchor.key, activePath, view)
    ? tabForRouteRole(anchor.key, activePath, scope)
    : null;
  const routeLabel = anchor.routeLabels?.[pathnameOf(activePath)] || null;
  return { anchor, tabs, activeTab, routeLabel };
}

export function pathnameOf(path) {
  return String(path || '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
}

// A child is active only when its parent anchor is (so the shared Projects
// surface never lights a 프로젝트·기획 child while 할 일 owns the view) and its
// pathname matches exactly. Queries (?scope=personal) don't affect matching.
export function isSidebarChildActive(anchorKey, childPath, activePath, view) {
  if (!isSidebarAnchorActive(anchorKey, activePath, view)) return false;
  if (anchorKey === 'overview') {
    const childView = new URLSearchParams(String(childPath).split('?')[1] || '').get('view') || '';
    const currentView = view || new URLSearchParams(String(activePath).split('?')[1] || '').get('view') || '';
    if ((childView === 'goals') !== (currentView === 'goals')) return false;
  }
  return pathnameOf(childPath) === pathnameOf(activePath);
}

function matchLength(prefix, path) {
  if (path === prefix) return prefix.length;
  if (path.startsWith(prefix + '/')) return prefix.length;
  return -1;
}

// The single anchor that owns a route, by longest matching prefix. Unknown
// routes return null so nothing is falsely highlighted.
export function ownerAnchorKey(activePath) {
  const path = String(activePath || '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  if (!path) return null;

  let winner = null;
  let best = -1;
  for (const anchor of SIDEBAR_ANCHORS) {
    for (const prefix of anchor.owns) {
      const len = matchLength(prefix, path);
      if (len > best) {
        best = len;
        winner = anchor.key;
      }
    }
  }
  return winner;
}

export function isSidebarAnchorActive(anchorKey, activePath, view) {
  const owner = ownerAnchorKey(activePath);
  if (!owner) return false;
  // Projects surface is shared: the view query decides which of the two
  // anchors owns it, so exactly one lights up.
  if (owner === 'projects') {
    return anchorKey === (isTaskView(view) ? 'tasks' : 'projects');
  }
  return owner === anchorKey;
}

// Entering a scoped route directly (bookmark, ⌘K, deep link) should move the
// scope control to match what's on screen. Global routes return null — keep
// whatever the operator last chose.
export function deriveSidebarScope(activePath) {
  const path = String(activePath || '').split(/[?#]/)[0].replace(/^\/+/, '');
  if (path.startsWith('dashboard/classin/')) return 'classin';
  if (path.startsWith('dashboard/brand/')) return 'personal';
  return null;
}

// Mobile navigation is a modal drawer only below the shell breakpoint. Keep
// this state derivation executable outside React so desktop accessibility and
// mobile inert ownership cannot drift independently in JSX.
export function getMobileNavigationState({ isMobileViewport, navOpen }) {
  const open = Boolean(isMobileViewport && navOpen);
  return {
    open,
    navHidden: Boolean(isMobileViewport && !navOpen),
    mainHidden: open,
  };
}

export function setElementInert(element, inert) {
  if (!element?.toggleAttribute) return false;
  element.toggleAttribute('inert', Boolean(inert));
  return element.hasAttribute?.('inert') ?? Boolean(inert);
}

// Dismissal focus must move before React makes the drawer inert. The opener is
// deliberately outside the inert <main>, so this synchronous order is safe.
export function dismissMobileNavigation({ active, focusTarget, close }) {
  if (!active) return false;
  focusTarget?.focus?.();
  close?.();
  return true;
}

// Route navigation has a different final-focus policy. Leave the soon-to-be
// hidden drawer synchronously, then let the shell focus the refreshed <main>
// after the close commit.
export function beginMobileNavigationRoute({ active, markMainFocus, focusTarget, close }) {
  if (!active) return false;
  markMainFocus?.();
  focusTarget?.focus?.();
  close?.();
  return true;
}

export function getMobileNavigationTabTarget({ focusables, activeElement, shiftKey }) {
  if (!Array.isArray(focusables) || focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export function shouldMobileNavigationHandleEscape({ open, paletteOpen, tweaksOpen, helpOpen }) {
  // 치트시트(helpOpen)가 떠 있으면 ESC는 그 레이어 몫 — 한 번에 두 레이어가 닫히지 않게.
  return Boolean(open && !paletteOpen && !tweaksOpen && !helpOpen);
}

export function shouldFocusMainAfterMobileNavigation({ pending, currentPath, navOpen }) {
  if (!pending || navOpen) return false;
  const fromPath = String(pending.fromPath || '');
  const targetPath = String(pending.targetPath || '');
  const visiblePath = String(currentPath || '');
  if (!fromPath || !targetPath || !visiblePath) return false;
  if (targetPath === fromPath) return visiblePath === fromPath;
  // A different committed path is either the requested target or its eventual
  // redirect. The old path must never consume the pending focus handoff.
  return visiblePath !== fromPath;
}

// Dashboard paths share the same HubApp implementation but Next.js remounts
// the page component when a catch-all segment changes. Keep this short-lived
// handoff at module scope so the destination mount can consume it. It is only
// written by browser event handlers and is cleared as soon as focus lands.
let pendingMobileNavigationRouteFocus = null;

export function rememberMobileNavigationRouteFocus({ fromPath, targetPath } = {}) {
  const from = String(fromPath || '');
  const target = String(targetPath || '');
  pendingMobileNavigationRouteFocus = from && target
    ? { fromPath: from, targetPath: target }
    : null;
  return pendingMobileNavigationRouteFocus;
}

export function readMobileNavigationRouteFocus() {
  return pendingMobileNavigationRouteFocus;
}

export function clearMobileNavigationRouteFocus() {
  pendingMobileNavigationRouteFocus = null;
}

export function completeMobileNavigationDesktopHandoff({ active, close, focusTarget }) {
  if (!active) return false;
  close?.();
  focusTarget?.focus?.();
  return true;
}
