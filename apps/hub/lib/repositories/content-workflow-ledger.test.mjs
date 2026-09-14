import assert from "node:assert/strict";
import { test } from "node:test";
let repository;
try { repository = await import("./content-workflow-ledger.js"); } catch {}
const workspaceId = "11111111-1111-1111-1111-111111111111";
const contentId = "33333333-3333-3333-3333-333333333333";
const variantId = "44444444-4444-4444-4444-444444444444";
const item = { id: contentId, workspace_id: workspaceId, source_idea: " 원문 ", meta: { brief: { audience: "독자" } } };
const detailed = (rows) => ({ rows, configured: true, error: null });

test("opens the exact item without reading history, even if history is unavailable", async () => {
  assert.ok(repository, "exact content workflow repository must exist");
  const calls = [];
  const revisions = Array.from({ length: 51 }, (_, i) => ({ id: String(i), workspace_id: workspaceId, content_id: contentId, variant_id: variantId, snapshot: { body: "old" } }));
  const variant = { id: variantId, workspace_id: workspaceId, content_id: contentId, body: "body", channel: "threads" };
  const result = await repository.getContentWorkflow(contentId, { workspaceId, fetchRows: async (table, options) => {
    calls.push({ table, options });
    return detailed(table === "content_items" ? [item] : table === "content_variants" ? [variant] : revisions);
  } });
  assert.equal(result.status, "live");
  assert.deepEqual(result.item, item);
  assert.deepEqual(result.variants, [variant]);
  assert.deepEqual(result.revisions, []);
  assert.equal(result.historyHasMore, false);
  assert.deepEqual(calls[0].options.filters, [["workspace_id", `eq.${workspaceId}`], ["id", `eq.${contentId}`]]);
  assert.equal(calls[0].options.limit, 1);
  for (const call of calls.slice(1)) assert.deepEqual(call.options.filters, [["workspace_id", `eq.${workspaceId}`], ["content_id", `eq.${contentId}`]]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.table !== "content_revisions"));
});

test("does not turn missing or failed reads into empty live data", async () => {
  assert.ok(repository);
  let calls = 0;
  const missing = await repository.getContentWorkflow(contentId, { workspaceId, fetchRows: async () => { calls++; return detailed([]); } });
  assert.equal(missing.status, "not-found");
  assert.equal(calls, 1);
  const error = await repository.getContentWorkflow(contentId, { workspaceId, fetchRows: async () => ({ rows: null, configured: true, error: { reason: "http-500" } }) });
  assert.equal(error.status, "error");
  const preview = await repository.getContentWorkflow(contentId, { workspaceId, fetchRows: async () => ({ rows: null, configured: false, error: null }) });
  assert.equal(preview.status, "preview");
  const invalid = await repository.getContentWorkflow("bad", { workspaceId, fetchRows: async () => { throw new Error("must not read"); } });
  assert.equal(invalid.status, "invalid-input");
});

test("history is scoped to the selected variant and pages by exact timestamp and id", async () => {
  const before = "2026-09-14T04:00:00.123456+00:00";
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: i === 49 ? variantId : String(i), created_at: before, variant_id: variantId, snapshot: { body: "old" } }));
  let query;
  const result = await repository.getContentHistory(contentId, variantId, { workspaceId, before, beforeId: variantId, fetchRows: async (table, options) => {
    assert.equal(table, "content_revisions"); query = options; return detailed(rows);
  } });
  assert.equal(result.status, "live");
  assert.equal(result.revisions.length, 50);
  assert.deepEqual(result.nextCursor, { before, beforeId: variantId });
  assert.deepEqual(query.filters.slice(0, 3), [["workspace_id", "eq." + workspaceId], ["content_id", "eq." + contentId], ["variant_id", "eq." + variantId]]);
  assert.deepEqual(query.filters[3], ["or", `(created_at.lt.${before},and(created_at.eq.${before},id.lt.${variantId}))`]);
});

test("history rejects malformed cursors before reading and keeps failed reads distinct from empty history", async () => {
  for (const options of [{ before: "invalid", beforeId: variantId }, { before: "2026-09-14T00:00:00Z" }, { beforeId: variantId }]) {
    const result = await repository.getContentHistory(contentId, variantId, { workspaceId, ...options, fetchRows: () => { throw Error("must not read"); } });
    assert.equal(result.status, "invalid-input");
  }
  const error = await repository.getContentHistory(contentId, variantId, { workspaceId, fetchRows: async () => ({ configured: true, rows: null, error: { reason: "http-404" } }) });
  assert.equal(error.status, "error");
  const empty = await repository.getContentHistory(contentId, variantId, { workspaceId, fetchRows: async () => detailed([]) });
  assert.equal(empty.status, "live"); assert.equal(empty.nextCursor, null);
});
