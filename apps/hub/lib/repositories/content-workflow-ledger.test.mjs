import assert from "node:assert/strict";
import { test } from "node:test";
let repository;
try { repository = await import("./content-workflow-ledger.js"); } catch {}
const workspaceId = "11111111-1111-1111-1111-111111111111";
const contentId = "33333333-3333-3333-3333-333333333333";
const variantId = "44444444-4444-4444-4444-444444444444";
const item = { id: contentId, workspace_id: workspaceId, source_idea: " 원문 ", meta: { brief: { audience: "독자" } } };
const detailed = (rows) => ({ rows, configured: true, error: null });

test("reads one exact workspace item with raw variants and bounded revision history", async () => {
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
  assert.equal(result.revisions.length, 50);
  assert.equal(result.historyHasMore, true);
  assert.deepEqual(calls[0].options.filters, [["workspace_id", `eq.${workspaceId}`], ["id", `eq.${contentId}`]]);
  assert.equal(calls[0].options.limit, 1);
  for (const call of calls.slice(1)) assert.deepEqual(call.options.filters, [["workspace_id", `eq.${workspaceId}`], ["content_id", `eq.${contentId}`]]);
  assert.equal(calls.find((call) => call.table === "content_revisions").options.limit, 51);
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
