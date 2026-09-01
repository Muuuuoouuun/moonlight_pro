// Workspace map — org_scope-driven membership for the Moonlight Pro Hub.
//
// Two live workspaces scope the pages by the *real* org_scope split that live brands carry:
//   1. classin (클래스인)  — company sales / pipeline / CRM lane
//   2. brand   (브랜드)     — brand / content / publishing work
//
import { canonicalOrgScopeForKey } from "@/lib/brand-org-scope";

// Membership resolution mirrors the backend's resolveBrandOrgScope
// (lib/repositories/operating-ledger.js): a live brand object's `orgScope` wins;
// unresolved records default to the personal lane.
// The 'personal' default routes untagged/unknown-brand records into the 브랜드 lane
// instead of dropping them from both workspaces — same default as the backend.
// This is the SINGLE SOURCE OF TRUTH and SUPERSEDES real_v1's hardcoded per-workspace
// `brands` arrays — re-home a brand by flipping its orgScope, not by editing lists here.
//
// Pages read these filters against live records and render explicit preview/empty
// states when the source is unavailable.

export const WORKSPACES = {
  classin: {
    key: 'classin',
    label: '클래스인',
    icon: 'classin',
    desc: '회사 영업 · 파이프라인 · 고객관리',
    // Legacy deals/leads/accounts carry `type: 'company' | 'personal'`; classin === company line.
    revenueTypes: ['company'],
    accountKeywords: [
      'classin',
      'class in',
      '클래스인',
      '설명회',
      '전자칠판',
      '충전',
      '소진',
      '광고',
      'meta',
      '캠페인',
      'cohort',
    ],
  },
  brand: {
    key: 'brand',
    label: '브랜드',
    icon: 'brand',
    desc: '브랜드 · 콘텐츠 · 발행',
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

// Legacy callers still need a finite brand-key catalog while live records move
// to org_scope. Keep this compatibility list out of membership resolution: live
// brand objects remain authoritative in brandInWorkspace/filter functions.
const LEGACY_WORKSPACE_BRANDS = {
  classin: ['classmoon', 'studyseagull', 'bridgemaker', 'moonpm'],
  brand: ['sinabro', 'gore', 'holyfuncollector', '22nomad', 'politicofficer'],
};

export function brandsForWorkspace(ws) {
  return [...(LEGACY_WORKSPACE_BRANDS[ws] || [])];
}

// Resolve a brand KEY to its org scope with live-object priority: a brand object in
// `brandObjects` carrying a string orgScope wins (live Supabase brands may use slugs the
// static set has never seen), else the static classin set, else 'personal'. An 'all' or
// missing key therefore resolves to 'personal' — untagged records land in the 브랜드 lane
// rather than disappearing.
function resolveOrgScopeForKey(key, brandObjects) {
  if (key && Array.isArray(brandObjects)) {
    const hit = brandObjects.find((b) => b && b.key === key);
    if (hit && typeof hit.orgScope === 'string') return hit.orgScope;
  }
  // 라이브 객체가 없을 때의 문자열 키 폴백 — 정본 테이블(lib/brand-org-scope) 판정.
  // 이전엔 무조건 'personal'이라 위 주석("else the static classin set")이 약속한 폴백이
  // 실제로는 없었고, ClassIn 콘텐츠 큐가 상시 0건으로 걸러졌다 (2609 감사 #6).
  return key ? canonicalOrgScopeForKey(key) : 'personal';
}

// classin ⇔ orgScope 'classin'; brand ⇔ anything else.
function scopeMatchesWorkspace(orgScope, ws) {
  return ws === 'classin' ? orgScope === 'classin' : orgScope !== 'classin';
}

// Does a brand belong to this workspace? Accepts either a brand KEY string or a brand
// OBJECT. Objects prefer their resolved `orgScope`; both paths fall back through the
// static classin set to the 'personal' default (never "in neither workspace").
export function brandInWorkspace(brand, ws) {
  if (!getWorkspace(ws) || !brand) return false;
  if (typeof brand === 'string') {
    return scopeMatchesWorkspace(resolveOrgScopeForKey(brand, null), ws);
  }
  const scope = typeof brand.orgScope === 'string'
    ? brand.orgScope
    : resolveOrgScopeForKey(brand.key, null);
  return scopeMatchesWorkspace(scope, ws);
}

function matchAccountKeyword(name, keywords) {
  if (!name || !keywords?.length) return false;
  const lower = String(name).toLowerCase();
  return keywords.some((kw) => lower.includes(String(kw).toLowerCase()));
}

// Keyword rescue only applies when the record's type doesn't contradict the workspace's
// revenue lane — a type:'personal' deal named "광고 카피 자문" must NOT leak into classin
// just because '광고' is a classin keyword. Typeless records can still be rescued.
function keywordRescue(record, w) {
  if (record.type && w.revenueTypes.length && !w.revenueTypes.includes(record.type)) return false;
  return matchAccountKeyword(record.name, w.accountKeywords);
}

// ── Pure filters — pages call these against their live OR fallback arrays ─────
// Each returns a NEW array; an unknown/absent workspace returns the input unchanged
// so non-scoped (global) pages keep working. A valid project workspace is authoritative;
// legacy projects fall back to brand org scope and classin keywords. Revenue records keep
// their existing workspace/type/brand/keyword matching behavior.

export function filterBrandsByWorkspace(brands, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(brands)) return brands || [];
  return brands.filter((b) => b.key === 'all' || brandInWorkspace(b, ws));
}

// `brands` = the unfiltered live brand objects array the page already holds. It lets
// records whose brand slug is unknown to local routing configuration
// follow their live brand's resolved orgScope when no valid explicit workspace exists.
export function filterProjectsByWorkspace(projects, ws, brands) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(projects)) return projects || [];
  return projects.filter((p) => {
    if (isWorkspace(p.workspace)) return p.workspace === ws;
    return scopeMatchesWorkspace(resolveOrgScopeForKey(p.brand, brands), ws)
      || matchAccountKeyword(p.name || p.title, w.accountKeywords);
  });
}

export function filterTodosByWorkspace(todos, ws, brands) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(todos)) return todos || [];
  return todos.filter(
    (t) =>
      t.workspace === ws ||
      scopeMatchesWorkspace(resolveOrgScopeForKey(t.brand, brands), ws) ||
      matchAccountKeyword(t.title || t.name, w.accountKeywords),
  );
}

export function filterDealsByWorkspace(deals, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(deals)) return deals || [];
  return deals.filter(
    (d) =>
      d.workspace === ws || // explicit tag wins (set on records created in-workspace)
      (w.revenueTypes.length && w.revenueTypes.includes(d.type)) ||
      brandInWorkspace(d.brand, ws) ||
      keywordRescue(d, w),
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
      keywordRescue(l, w),
  );
}

// Accounts carry the same `type: 'company' | 'personal'` field as deals/leads but no
// brand tag — scope on explicit workspace → type lane → tightened keyword rescue.
export function filterAccountsByWorkspace(accounts, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(accounts)) return accounts || [];
  return accounts.filter(
    (a) =>
      a.workspace === ws ||
      (w.revenueTypes.length && w.revenueTypes.includes(a.type)) ||
      keywordRescue(a, w),
  );
}

// Content items rarely carry a brand field yet; scope on whatever brand/program tag
// exists (field names vary across live sources: brand / brandKey / brandId / program),
// plus an explicit `workspace` tag. Untagged items are dropped so the page shows an
// honest preview/empty state for that workspace.
export function filterContentByWorkspace(items, ws) {
  const w = getWorkspace(ws);
  if (!w || !Array.isArray(items)) return items || [];
  return items.filter((c) => {
    if (c.workspace === ws) return true;
    const tag = c.brand || c.brandKey || c.brandId || c.program;
    return brandInWorkspace(tag, ws) || tag === ws;
  });
}
