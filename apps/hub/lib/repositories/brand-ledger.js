import { fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { resolveSupabaseConfig, resolveDefaultWorkspaceId } from "@/lib/server-write";
import { mapBrandIdentity } from "@/lib/brand-identity";

// 제품 컨테이너는 같은 brands 테이블에 살지만 브랜드가 아니다 — 프로젝트 탭 `제품` 보기가
// 소유한다(제품 개발 기획 §3.1). 브랜드 탭 목록에서 뺀다.
export function isBrandRow(row) {
  return row?.meta?.category !== "product";
}

// Identity never depends on variants, assets, campaign reads, or publication summaries.
export async function getBrandLedger({ fetchRows = fetchSupabaseRows } = {}) {
  if (!resolveSupabaseConfig() || !resolveDefaultWorkspaceId()) {
    return { source: "preview", status: "preview", brands: [], metricsAvailable: false };
  }
  const rows = await fetchRows("brands", {
    filters: withWorkspaceFilter([["status", "eq.active"]]), order: "name.asc", limit: 1000,
  });
  if (rows === null) return { source: "error", status: "error", brands: [], metricsAvailable: false };
  return { source: "supabase", status: rows.length >= 1000 ? "partial" : "ok",
    brands: rows.filter(isBrandRow).map(mapBrandIdentity), metricsAvailable: false };
}
