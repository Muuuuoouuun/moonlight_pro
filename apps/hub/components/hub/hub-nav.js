// Sidebar navigation contract — the *visible* information architecture.
//
// Deliberately separate from NAV_TREE in hub-data.js, which stays the full
// 36-destination catalog behind ⌘K search. Adding a route there must not add a
// sidebar row; the sidebar only grows when an anchor is added here. That split
// is the whole point — the old accordion mixed two organizing principles
// (workspace × function) and repeated Projects / Revenue / Follow-ups / Content
// in both, so the operator had to answer "where does this live?" before
// "what am I doing?".
//
// Nine stable anchors — Overview added 2026-07-15 per direct operator
// instruction; the prior "eight anchors, fixed" reading of the 2026-07-15
// sidebar spec is not final and may still change. Organizational context
// moves into one scope control.

export const DEFAULT_SCOPE = 'all';

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
// longest-prefix-wins, so `dashboard/revenue/followups` lands on 연락·후속 even
// though `dashboard/revenue` belongs to 매출·고객. Every route therefore maps to
// at most one anchor.
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
function personalScoped(children) {
  return children.map((c) => ({ ...c, path: `${c.path}?scope=personal` }));
}

const REVENUE_CHILDREN = [
  // '개요', not 'Overview' — the global Overview anchor (dashboard/overview)
  // owns that name; the revenue child keeps a distinct label to avoid two
  // identical rows in one sidebar.
  { key: 'rev-overview', label: '개요', path: 'dashboard/revenue/overview' },
  // 고객 DB · 매출 히트맵 — implemented pages (PAGE_MAP + NAV_TREE search) that
  // had no sidebar row until 2026-07-17. Both are global aggregate views
  // (Customers/RevenueHeatmap take no workspace prop), so they live only here,
  // not in REVENUE_CLASSIN_CHILDREN.
  { key: 'rev-customers', label: '고객 DB', path: 'dashboard/revenue/customers' },
  { key: 'rev-heatmap', label: '매출 히트맵', path: 'dashboard/revenue/heatmap' },
  { key: 'rev-leads', label: 'Leads', path: 'dashboard/revenue/leads' },
  { key: 'rev-deals', label: 'Deals', path: 'dashboard/revenue/deals' },
  { key: 'rev-accounts', label: 'Accounts', path: 'dashboard/revenue/accounts' },
  { key: 'rev-cases', label: 'Cases', path: 'dashboard/revenue/cases' },
];
// Same components as the global CRM (Deals/Leads/Accounts with
// workspace="classin") — so they carry the SAME names. The old scope-specific
// labels (파이프라인·결제·리드·고객·계정) renamed identical surfaces and were the
// operator's top naming confusion (2026-07-15 naming decision).
const REVENUE_CLASSIN_CHILDREN = [
  { key: 'rev-ci-pipeline', label: 'Deals', path: 'dashboard/classin/pipeline' },
  { key: 'rev-ci-revenue', label: 'Leads', path: 'dashboard/classin/revenue' },
  { key: 'rev-ci-segments', label: '세그먼트', path: 'dashboard/classin/segments' },
  { key: 'rev-ci-accounts', label: 'Accounts', path: 'dashboard/classin/accounts' },
];

// Calendar · Roadmap · Decisions · Rhythm are global routes today — scope only
// swaps the Projects entry. Scope filtering of these surfaces is Phase 2.
const PLANNING_TAIL = [
  { key: 'prj-calendar', label: 'Calendar', path: 'dashboard/work/calendar' },
  { key: 'prj-roadmap', label: 'Roadmap', path: 'dashboard/work/roadmap' },
  { key: 'prj-decisions', label: 'Decisions', path: 'dashboard/work/decisions' },
  { key: 'prj-rhythm', label: 'Rhythm', path: 'dashboard/work/rhythm' },
];

const CONTENT_CHILDREN = [
  { key: 'ct-queue', label: 'Queue', path: 'dashboard/content/queue' },
  { key: 'ct-studio', label: 'Studio', path: 'dashboard/content/studio' },
  { key: 'ct-campaigns', label: 'Campaigns', path: 'dashboard/content/campaigns' },
];

// AI·자동화 renders its nine children under two eyebrow group labels.
// Sheets is the one scope-dependent entry (ClassIn owns 시트 동기화).
function aiChildren(sheetsPath) {
  return [
    { key: 'ai-chat', label: 'Chat', path: 'dashboard/agents/chat', group: 'Agents' },
    { key: 'ai-orders', label: 'Orders', path: 'dashboard/agents/orders', group: 'Agents' },
    { key: 'ai-council', label: 'Council', path: 'dashboard/agents/council', group: 'Agents' },
    // AutomationsIndex — implemented page (PAGE_MAP) with no sidebar/search row until
    // 2026-07-17. Global (unscoped), so it appears identically in every scope.
    { key: 'ai-automations-overview', label: '자동화 개요', path: 'dashboard/automations', group: 'Automations' },
    { key: 'ai-runs', label: 'Runs', path: 'dashboard/automations/runs', group: 'Automations' },
    { key: 'ai-flows', label: 'Flows', path: 'dashboard/automations/flows', group: 'Automations' },
    { key: 'ai-email', label: 'Email', path: 'dashboard/automations/email', group: 'Automations' },
    { key: 'ai-webhooks', label: 'Webhooks', path: 'dashboard/automations/webhooks', group: 'Automations' },
    { key: 'ai-sheets', label: 'Sheets', path: sheetsPath, group: 'Automations' },
  ];
}

const SETTINGS_CHILDREN = [
  { key: 'sys-settings', label: 'Settings', path: 'dashboard/settings' },
  { key: 'sys-evolution', label: 'Evolution', path: 'dashboard/evolution' },
];

export const SIDEBAR_PRIMARY = [
  {
    key: 'today',
    label: '오늘',
    icon: 'brief',
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
    icon: 'signal',
    scopeAware: false,
    owns: ['dashboard/overview'],
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
    icon: 'inbox',
    scopeAware: false,
    owns: ['dashboard/work/my'],
    paths: {
      all: 'dashboard/work/my',
      classin: 'dashboard/work/my',
      personal: 'dashboard/work/my',
    },
  },
  {
    key: 'revenue',
    label: '영업·매출',
    icon: 'revenue',
    scopeAware: true,
    owns: [
      'dashboard/revenue',
      'dashboard/classin/pipeline',
      'dashboard/classin/revenue',
      'dashboard/classin/segments',
      'dashboard/classin/accounts',
    ],
    paths: {
      all: 'dashboard/revenue/overview',
      classin: 'dashboard/classin/pipeline',
      personal: 'dashboard/revenue/overview?scope=personal',
    },
    children: {
      all: REVENUE_CHILDREN,
      classin: REVENUE_CLASSIN_CHILDREN,
      personal: personalScoped(REVENUE_CHILDREN),
    },
  },
  {
    key: 'followups',
    label: '고객 연락',
    icon: 'bell',
    scopeAware: true,
    owns: ['dashboard/revenue/followups', 'dashboard/classin/followups'],
    paths: {
      all: 'dashboard/revenue/followups',
      classin: 'dashboard/classin/followups',
      personal: 'dashboard/revenue/followups?scope=personal',
    },
  },
  {
    key: 'projects',
    label: '프로젝트',
    icon: 'projects',
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
    key: 'content',
    label: '콘텐츠',
    icon: 'content',
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
        { key: 'ct-queue', label: 'Queue', path: 'dashboard/brand/queue' },
        { key: 'ct-studio', label: 'Studio', path: 'dashboard/brand/studio' },
      ],
    },
  },
];

export const SIDEBAR_UTILITIES = [
  {
    key: 'ai',
    label: 'AI·자동화',
    icon: 'sparkle',
    scopeAware: false,
    owns: ['dashboard/agents', 'dashboard/automations', 'dashboard/classin/automations'],
    paths: {
      all: 'dashboard/agents/chat',
      classin: 'dashboard/agents/chat',
      personal: 'dashboard/agents/chat',
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
    icon: 'settings',
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

// Second-level destinations live in the top bar, not in a nested sidebar.
// Keeping this derivation beside the sidebar contract prevents the two shells
// from inventing different labels, scope paths, or active-state rules.
export function topNavigationForRoute(activePath, scope = DEFAULT_SCOPE, view) {
  const anchorKey = ownerAnchorKey(activePath);
  const anchor = SIDEBAR_ANCHORS.find((item) => item.key === anchorKey) || null;
  if (!anchor) return { anchor: null, tabs: [], activeTab: null };

  const tabs = sidebarChildren(anchor.key, scope);
  const activeTab = tabs.find((tab) => (
    isSidebarChildActive(anchor.key, tab.path, activePath, view)
  )) || null;

  return { anchor, tabs, activeTab };
}

function pathnameOf(path) {
  return String(path || '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
}

// A child is active only when its parent anchor is (so the shared Projects
// surface never lights a 프로젝트·기획 child while 할 일 owns the view) and its
// pathname matches exactly. Queries (?scope=personal) don't affect matching.
export function isSidebarChildActive(anchorKey, childPath, activePath, view) {
  if (!isSidebarAnchorActive(anchorKey, activePath, view)) return false;
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

export function shouldMobileNavigationHandleEscape({ open, paletteOpen, tweaksOpen }) {
  return Boolean(open && !paletteOpen && !tweaksOpen);
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
