// Xiaoshouyi (销售易/EEO) ownerId -> name resolution.
//
// CRM records carry only a numeric ownerId. This resolves it to display/Korean
// names + team. The static map is the offline fallback; `fetchOwnerNames()` reads
// the curated `crm_xiaoshouyi_owner_names` table (seeded by migration 0006) and
// merges it over the static map (DB wins). Mirrors classin_home's owner-names.ts.

import { fetchSupabaseRows } from "@/lib/server-read";

// The operator this moonlight instance belongs to. CRM queries filter on this.
export const CURRENT_OWNER_ID = "3935704427463307"; // 문준혁 (Mun Junhyuk)

// Offline fallback — ONLY the current operator (the one mapping the user gave).
// Other ownerIds resolve from the live CRM User object at sync time, or from the
// curated `crm_xiaoshouyi_owner_names` table (fetchOwnerNames below). We do not
// hardcode colleagues' names/codes here.
export const XIAOSHOUYI_OWNER_NAMES = {
  "3935704427463307": { displayName: "Mun Junhyuk (문준혁)", koreanName: "문준혁", eeoCode: "EEO04186", team: "KR", isExcluded: false },
};

function normalizeId(ownerId) {
  return String(ownerId ?? "").trim();
}

// Synchronous resolve against the static map. Unknown ids return a numeric fallback.
export function resolveOwnerName(ownerId, table = XIAOSHOUYI_OWNER_NAMES) {
  const id = normalizeId(ownerId);
  const hit = table[id];
  if (hit) return { externalId: id, ...hit };
  return { externalId: id, displayName: id || "(unknown)", koreanName: null, eeoCode: null, team: null, isExcluded: false };
}

// Reads the curated DB table and merges over the static fallback (DB wins).
// Returns a map keyed by external_id. Falls back to the static map if no DB.
export async function fetchOwnerNames() {
  const rows = await fetchSupabaseRows("crm_xiaoshouyi_owner_names", { limit: 500 });
  if (!rows) return { ...XIAOSHOUYI_OWNER_NAMES };

  const merged = { ...XIAOSHOUYI_OWNER_NAMES };
  for (const row of rows) {
    const id = normalizeId(row.external_id);
    if (!id) continue;
    merged[id] = {
      displayName: row.display_name || id,
      koreanName: row.korean_name || null,
      eeoCode: row.eeo_code || null,
      team: row.team || null,
      isExcluded: Boolean(row.is_excluded),
    };
  }
  return merged;
}

// DB-backed resolve for a single ownerId.
export async function resolveOwnerNameLive(ownerId) {
  const table = await fetchOwnerNames();
  return resolveOwnerName(ownerId, table);
}
