import assert from "node:assert/strict";
import { test } from "node:test";

let workflow;
try { workflow = await import("./content-workflow.ts"); } catch {}
const workspaceId = "11111111-1111-1111-1111-111111111111";
const requestId = "22222222-2222-2222-2222-222222222222";
const contentId = "33333333-3333-3333-3333-333333333333";
const variantId = "44444444-4444-4444-4444-444444444444";
const timestamp = "2026-09-12T10:20:30.123456+00:00";
const create = (patch = {}) => ({ action: "save", requestId, contentId: null, variantId: null, item: {}, variant: { body: "본문", variantType: "x_thread", channel: "threads" }, ...patch });
const update = (patch = {}) => create({ contentId, variantId, expectedItemUpdatedAt: timestamp, expectedVariantUpdatedAt: timestamp, ...patch });
function normalize(input) {
  assert.ok(workflow, "content-workflow.ts must implement the transactional workflow");
  return workflow.normalizeContentWorkflow(input, { workspaceId });
}

test("preserves absent source fields and explicit empty values without copying a title", () => {
  const titleOnly = normalize(update({ item: { title: "새 제목" }, variant: {} }));
  assert.equal(titleOnly.ok, true);
  assert.deepEqual(titleOnly.command.item, { title: "새 제목" });
  const clear = normalize(update({ item: { sourceIdea: "", nextAction: "", blocker: "", brief: { audience: "" } } }));
  assert.deepEqual(clear.command.item, { sourceIdea: "", nextAction: "", blocker: "", brief: { audience: "" } });
  assert.equal(titleOnly.command.expectedVariantUpdatedAt, timestamp, "Postgres microsecond precision must survive");
});

test("allows source-only and body-only creation without a title, leaving IDs to the transaction", () => {
  for (const input of [create({ item: { sourceIdea: "  원문\n그대로  " }, variant: {} }), create()]) {
    const result = normalize(input);
    assert.equal(result.ok, true);
    assert.equal(result.command.contentId, null);
    assert.equal(result.command.variantId, null);
    assert.equal(result.command.item.title, undefined);
  }
  assert.equal(normalize(create({ item: { sourceIdea: "  원문\n그대로  " } })).command.item.sourceIdea, "  원문\n그대로  ");
});

test("validates actions, IDs, expected versions, strings and channel/format combinations", () => {
  const invalid = [
    create({ action: "publish" }), create({ requestId: "bad" }), create({ contentId: "bad" }),
    create({ variantId }), update({ expectedItemUpdatedAt: null }), update({ expectedVariantUpdatedAt: "today" }),
    create({ item: { sourceIdea: 123 } }), create({ item: { brief: [] } }), create({ variant: { body: {} } }),
    create({ variant: { body: "x", variantType: "unknown", channel: "threads" } }),
    create({ variant: { body: "x", variantType: "card_news", channel: "x" } }),
    create({ variant: { body: "x", variantType: "x_thread", channel: "unknown" } }),
    update({ action: "apply_candidate", runId: requestId, candidateId: "x", mode: "publish" }),
    update({ action: "restore_revision", revisionId: "bad" }),
  ];
  for (const input of invalid) assert.equal(normalize(input).ok, false, JSON.stringify(input));
  for (const [variantType, channel] of [["x_thread", "x"], ["reels_script", "youtube_shorts"], ["newsletter", "email"], ["blog", "blog"]]) {
    assert.equal(normalize(create({ variant: { body: "x", variantType, channel } })).ok, true);
  }
});

test("ignores browser workspace input and hashes semantically equal objects deterministically", () => {
  const first = normalize(create({ workspaceId: "55555555-5555-5555-5555-555555555555", item: { title: "t", sourceIdea: "s" } }));
  const second = normalize(create({ item: { sourceIdea: "s", title: "t" } }));
  assert.equal(first.workspaceId, workspaceId);
  assert.equal(first.requestHash, second.requestHash);
  assert.notEqual(first.requestHash, normalize(create({ item: { title: "t", sourceIdea: "" } })).requestHash);
});

test("uses exactly one RPC and returns authoritative rows and replay/conflict states", async () => {
  assert.ok(workflow);
  const calls = [];
  const raw = { status: "saved", contentId, variantId, item: { id: contentId, source_idea: "" }, variant: { id: variantId, body: "본문" } };
  const result = await workflow.executeContentWorkflow(update(), { workspaceId }, { rpc: async (...args) => { calls.push(args); return { ok: true, data: raw }; } });
  assert.deepEqual(result, raw);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "content_workflow_v1");
  assert.equal(calls[0][1].p_workspace_id, workspaceId);
  assert.equal(calls[0][1].p_request_id, requestId);
  assert.equal(calls[0][1].p_request_hash.length, 64);
  for (const status of ["duplicate", "conflict"]) {
    const replay = await workflow.executeContentWorkflow(update(), { workspaceId }, { rpc: async () => ({ ok: true, data: { ...raw, status } }) });
    assert.equal(replay.status, status);
  }
});

test("invalid commands never call persistence and unavailable persistence is explicit", async () => {
  assert.ok(workflow);
  let called = false;
  const invalid = await workflow.executeContentWorkflow(create({ requestId: "bad" }), { workspaceId }, { rpc: async () => { called = true; } });
  assert.equal(invalid.status, "invalid-input");
  assert.equal(called, false);
  const preview = await workflow.executeContentWorkflow(create(), { workspaceId }, { rpc: async () => ({ ok: false, error: "missing-config" }) });
  assert.equal(preview.status, "preview");
  const failed = await workflow.executeContentWorkflow(create(), { workspaceId }, { rpc: async () => ({ ok: false, error: "http-500" }) });
  assert.equal(failed.status, "error");
});


test("allows an existing idea with no variant to create its first draft with only the item version", () => {
  const result = normalize(create({ contentId, variantId: null, expectedItemUpdatedAt: timestamp, expectedVariantUpdatedAt: null }));
  assert.equal(result.ok, true);
  assert.equal(result.command.contentId, contentId);
  assert.equal(result.command.variantId, null);
  assert.equal(result.command.expectedItemUpdatedAt, timestamp);
  assert.equal(normalize(create({ contentId, variantId: null })).ok, false);
});
