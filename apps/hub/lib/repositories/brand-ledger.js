import { fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { resolveSupabaseConfig, resolveDefaultWorkspaceId } from "@/lib/server-write";
import { mapBrandIdentity } from "@/lib/brand-identity";

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
    brands: rows.map(mapBrandIdentity), metricsAvailable: false };
}
