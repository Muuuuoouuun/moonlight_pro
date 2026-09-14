import { fetchSupabaseRowsDetailed } from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { mapBrands } from "./content-ledger.js";

// The editor needs brand identity, not the publishing, asset and campaign ledgers.
export async function getContentStudioCatalog({ workspaceId = resolveDefaultWorkspaceId(), fetchRows = fetchSupabaseRowsDetailed } = {}) {
  const empty = { brands: [] };
  if (!workspaceId) return { status: "preview", source: "preview", ...empty };
  try {
    const read = await fetchRows("brands", {
      select: "id,name,slug,kind,meta", limit: 81, order: "name.asc,id.asc",
      filters: [["workspace_id", `eq.${workspaceId}`], ["status", "eq.active"]],
    });
    if (!read.configured) return { status: "preview", source: "preview", ...empty };
    if (read.error || !Array.isArray(read.rows)) return { status: "error", source: "error", ...empty };
    return { status: read.rows.length > 80 ? "partial" : "live", source: "supabase",
      brands: mapBrands(read.rows.slice(0, 80)).map(({ id, key, name, orgScope }) => ({ id, key, name, orgScope })) };
  } catch { return { status: "error", source: "error", ...empty }; }
}
