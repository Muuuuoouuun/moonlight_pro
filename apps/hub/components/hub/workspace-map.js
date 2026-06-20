// Workspace map — the real operating layer for Moonlight Pro Hub.
//
// The sidebar is organized around the three workstreams that actually run first:
//   1. classin  (클래스인)    — my education / class business line
//   2. company  (회사)        — agency + product company operations
//   3. brand    (브랜드 업무)  — brand / content publishing work
//
// Each workspace declares which REAL records belong to it. Pages read these
// membership sets to scope their live data (and fall back to an explicit
// preview/empty state when a workspace has no data yet — never mock+live mix).
//
// ── TUNING ──────────────────────────────────────────────────────────────────
// The `brands` arrays below are the single source of truth for which brand
// belongs to which workspace. Move a brand key between arrays to re-home it.
// Brand keys come from BRANDS in hub-data.js:
//   sinabro · gore · holyfuncollector · bridgemaker · moonpm
//   classmoon · studyseagull · politicofficer · 22nomad
//
// NOTE: `glyph` (🎓🏢🎨) is intentionally NON-RENDERED metadata for reference
// only — the UI uses the monochrome `icon` field. Do not surface the emoji on
// operator surfaces (DESIGN.md: no novelty glyphs).

export const WORKSPACES = {
  classin: {
    key: 'classin',
    label: '클래스인',
    glyph: '🎓',
    icon: 'classin',
    desc: '교육 · 코호트 · 수강생',
    // Education brands — class business runs through these labels.
    brands: ['classmoon', 'studyseagull'],
    // Revenue lens: education deals/leads. No dedicated field in the current
    // schema, so this matches by brand association / account keyword and is
    // empty (preview) until real education revenue is tagged.
    // Keywords are intentionally specific — the bare English token 'class' was
    // dropped because it substring-matches unrelated names (e.g. "Classic Co").
    revenueTypes: [],
    accountKeywords: ['클래스', '코호트', '수강', '강의', 'cohort'],
  },
  company: {
    key: 'company',
    label: '회사',
    glyph: '🏢',
    icon: 'building',
    desc: '딜 · 파이프라인 · 운영',
    // Agency (BridgeMaker), the hub tool itself (MoonPM), research (Politic_Officer).
    brands: ['bridgemaker', 'moonpm', 'politicofficer'],
    // Company pipeline = all company-type deals/leads.
    revenueTypes: ['company'],
    accountKeywords: [],
  },
  brand: {
    key: 'brand',
    label: '브랜드 업무',
    glyph: '🎨',
    icon: 'brand',
    desc: '브랜드 · 콘텐츠 · 발행',
    // Content / product / community / personal brands.
    brands: ['sinabro', 'gore', 'holyfuncollector', '22nomad'],
    // Personal-line revenue (coaching, advisory) rides with brand work.
    revenueTypes: ['personal'],
    accountKeywords: [],
  },
};

export const WORKSPACE_KEYS = Object.keys(WORKSPACES);

export function isWorkspace(ws) {
  return Boolean(ws) && Object.prototype.hasOwnProperty.call(WORKSPACES, ws);
}

export function getWorkspace(ws) {
  return isWorkspace(ws) ? WORKSPACES[ws] : null;
}

// Brand keys that belong to a workspace (empty array for unknown ws).
export function brandsForWorkspace(ws) {
  const w = getWorkspace(ws);
  return w ? w.brands.slice() : [];
}

// Does a brand key belong to this workspace?
export function brandInWorkspace(brandKey, ws) {
  const w = getWorkspace(ws);
  if (!w || !brandKey) return false;
  return w.brands.includes(brandKey);
}

// ── Pure filters — pages call these against their live OR fallback arrays ─────
// Each returns a NEW array; an unknown/absent workspace returns the input
// unchanged so non-scoped (global) pages keep working.

export function filterProjectsByWorkspace(projects, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(projects)) return projects || [];
  return projects.filter((p) => w.brands.includes(p.brand));
}

export function filterTodosByWorkspace(todos, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(todos)) return todos || [];
  return todos.filter((t) => w.brands.includes(t.brand));
}

export function filterBrandsByWorkspace(brands, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(brands)) return brands || [];
  return brands.filter((b) => b.key === 'all' || w.brands.includes(b.key));
}

function matchAccountKeyword(name, keywords) {
  if (!name || !keywords?.length) return false;
  const lower = String(name).toLowerCase();
  return keywords.some((kw) => lower.includes(String(kw).toLowerCase()));
}

export function filterDealsByWorkspace(deals, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(deals)) return deals || [];
  return deals.filter(
    (d) =>
      d.workspace === ws || // explicit tag wins (set on records created in-workspace)
      (w.revenueTypes.length && w.revenueTypes.includes(d.type)) ||
      brandInWorkspace(d.brand, ws) ||
      matchAccountKeyword(d.name, w.accountKeywords),
  );
}

export function filterLeadsByWorkspace(leads, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(leads)) return leads || [];
  return leads.filter(
    (l) =>
      l.workspace === ws || // explicit tag wins (set on records created in-workspace)
      (w.revenueTypes.length && w.revenueTypes.includes(l.type)) ||
      brandInWorkspace(l.brand, ws) ||
      matchAccountKeyword(l.name, w.accountKeywords),
  );
}

// Content items rarely carry a brand field yet; scope on whatever brand/program
// tag exists (field names vary across mock + live: brand / brandKey / brandId /
// program), plus an explicit `workspace` tag. Otherwise return [] so the page
// shows an honest preview/empty state for that workspace.
export function filterContentByWorkspace(items, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(items)) return items || [];
  return items.filter((c) => {
    if (c.workspace === ws) return true;
    const tag = c.brand || c.brandKey || c.brandId || c.program;
    return Boolean(tag) && (w.brands.includes(tag) || tag === ws);
  });
}
