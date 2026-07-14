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
// Eight stable anchors. Organizational context moves into one scope control.

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
    key: 'tasks',
    label: '할 일',
    icon: 'check',
    scopeAware: true,
    owns: [],
    paths: {
      all: 'dashboard/work/projects?view=todos',
      classin: 'dashboard/classin/projects?view=todos',
      personal: 'dashboard/brand/projects?view=todos',
    },
  },
  {
    key: 'revenue',
    label: '매출·고객',
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
  },
  {
    key: 'followups',
    label: '연락·후속',
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
    label: '프로젝트·기획',
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
