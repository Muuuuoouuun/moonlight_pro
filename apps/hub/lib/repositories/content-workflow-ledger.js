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
    const variants = await fetchRows("content_variants", { select: "*", filters, order: "created_at.asc,id.asc", limit: VARIANT_LIMIT + 1, dedupe: false });
    if (variants.error || !Array.isArray(variants.rows)) return { status: "error", error: "content-workflow-read-failed", ...empty };
    return {
      status: "live", item,
      variants: variants.rows.slice(0, VARIANT_LIMIT), variantsHasMore: variants.rows.length > VARIANT_LIMIT,
      revisions: [], historyHasMore: false,
    };
  } catch {
    return { status: "error", error: "content-workflow-read-failed", ...empty };
  }
}

export async function getContentHistory(contentId, variantId, {
  workspaceId = resolveDefaultWorkspaceId(), fetchRows = fetchSupabaseRowsDetailed, before = null, beforeId = null,
} = {}) {
  const empty = { revisions: [], nextCursor: null };
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!UUID.test(contentId || "") || !UUID.test(variantId || "") ||
      Boolean(before) !== Boolean(beforeId) || (before && (!timestamp.test(before) || !Number.isFinite(Date.parse(before)) || !UUID.test(beforeId)))) {
    return { status: "invalid-input", error: "invalid-history-reference", ...empty };
  }
  if (!UUID.test(workspaceId || "")) return { status: "preview", ...empty };
  const filters = [["workspace_id", `eq.${workspaceId}`], ["content_id", `eq.${contentId}`], ["variant_id", `eq.${variantId}`]];
  if (before) filters.push(["or", `(created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId}))`]);
  try {
    const read = await fetchRows("content_revisions", { select: "id,variant_id,reason,snapshot,created_at", filters,
      order: "created_at.desc,id.desc", limit: HISTORY_LIMIT + 1, dedupe: false });
    if (!read.configured) return { status: "preview", ...empty };
    if (read.error || !Array.isArray(read.rows)) return { status: "error", error: "content-history-read-failed", ...empty };
    const revisions = read.rows.slice(0, HISTORY_LIMIT), last = revisions.at(-1);
    return { status: "live", revisions, nextCursor: read.rows.length > HISTORY_LIMIT ? { before: last.created_at, beforeId: last.id } : null };
  } catch { return { status: "error", error: "content-history-read-failed", ...empty }; }
}
