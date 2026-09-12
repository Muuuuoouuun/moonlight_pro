import { fetchSupabaseRowsDetailed } from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_LIMIT = 50;
const VARIANT_LIMIT = 250;

// Studio loads one parent exactly. Global ledger pagination must never decide
// whether a deep-linked draft exists, and failed reads must remain visible.
export async function getContentWorkflow(contentId, {
  workspaceId = resolveDefaultWorkspaceId(),
  fetchRows = fetchSupabaseRowsDetailed,
} = {}) {
  const empty = { item: null, variants: [], revisions: [], historyHasMore: false };
  if (!UUID.test(contentId || "")) return { status: "invalid-input", error: "invalid-content-id", ...empty };
  if (!UUID.test(workspaceId || "")) return { status: "preview", error: "missing-workspace", ...empty };
  try {
    const itemRead = await fetchRows("content_items", {
      select: "*", limit: 1, dedupe: false,
      filters: [["workspace_id", `eq.${workspaceId}`], ["id", `eq.${contentId}`]],
    });
    if (!itemRead.configured) return { status: "preview", error: "missing-config", ...empty };
    if (itemRead.error || !Array.isArray(itemRead.rows)) return { status: "error", error: "content-item-read-failed", ...empty };
    const item = itemRead.rows[0];
    if (!item) return { status: "not-found", error: "content-not-found", ...empty };
    const filters = [["workspace_id", `eq.${workspaceId}`], ["content_id", `eq.${contentId}`]];
    const [variants, revisions] = await Promise.all([
      fetchRows("content_variants", { select: "*", filters, order: "created_at.asc,id.asc", limit: VARIANT_LIMIT + 1, dedupe: false }),
      fetchRows("content_revisions", { select: "*", filters, order: "created_at.desc,id.desc", limit: HISTORY_LIMIT + 1, dedupe: false }),
    ]);
    if ([variants, revisions].some((read) => read.error || !Array.isArray(read.rows))) return { status: "error", error: "content-workflow-read-failed", ...empty };
    return {
      status: "live", item,
      variants: variants.rows.slice(0, VARIANT_LIMIT), variantsHasMore: variants.rows.length > VARIANT_LIMIT,
      revisions: revisions.rows.slice(0, HISTORY_LIMIT), historyHasMore: revisions.rows.length > HISTORY_LIMIT,
    };
  } catch {
    return { status: "error", error: "content-workflow-read-failed", ...empty };
  }
}
