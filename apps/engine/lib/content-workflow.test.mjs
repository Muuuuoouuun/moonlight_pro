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

const reelScene = (patch = {}) => ({ id: "scene-1", visual: "화면", spoken: "대사", subtitle: "자막", duration: 10, notes: "", ...patch });
const reelVariant = (body) => ({ body, variantType: "reels_script", channel: "youtube_shorts" });
const withoutReceipt = (read = async () => assert.fail("unexpected variant read")) => async (table, options) =>
  table === "content_workflow_receipts" ? { configured: true, rows: [] } : read(table, options);

test("manual reel saves reject malformed JSON and invalid scene durations before persistence", async () => {
  for (const [body, reason] of [
    ["JSON이 아닌 대본", "invalid-reels-script-json"],
    [JSON.stringify({ scenes: [reelScene({ duration: 0 })] }), "invalid-reels-script-duration"],
    [JSON.stringify({ scenes: [reelScene({ duration: -1 })] }), "invalid-reels-script-duration"],
    [JSON.stringify({ scenes: [reelScene({ duration: 601 })] }), "invalid-reels-script-duration"],
  ]) {
    const input = create({ variant: reelVariant(body) });
    const result = normalize(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    let calls = 0;
    const response = await workflow.executeContentWorkflow(input, { workspaceId }, { read: withoutReceipt(), rpc: async () => { calls += 1; } });
    assert.equal(response.status, "invalid-input");
    assert.equal(response.error, reason);
    assert.equal(calls, 0);
  }
});

test("manual reel saves keep valid boundaries and empty drafts without changing their text", () => {
  for (const body of ["", "  ", JSON.stringify({ scenes: [] }), JSON.stringify({ scenes: [reelScene({ duration: 0.5 })] }),
    JSON.stringify({ scenes: [reelScene({ duration: 600 })] })]) {
    const result = normalize(create({ variant: reelVariant(body) }));
    assert.equal(result.ok, true, body);
    assert.equal(result.command.variant.body, body);
  }
});

const savedVariant = (patch = {}) => ({ id: variantId, workspace_id: workspaceId, content_id: contentId,
  variant_type: "reels_script", body: JSON.stringify({ scenes: [reelScene()] }), updated_at: timestamp, ...patch });

test("partial body updates use the saved scoped variant type instead of bypassing scene validation", async () => {
  let writes = 0;
  const invalidBody = JSON.stringify({ scenes: [reelScene({ duration: 0 })] });
  const input = update({ variant: { body: invalidBody } });
  const dependencies = {
    rpc: async () => { writes += 1; return { ok: true, data: { status: "saved" } }; },
    read: withoutReceipt(async (table, options) => {
      assert.equal(table, "content_variants");
      assert.deepEqual(options.filters, [["id", `eq.${variantId}`], ["workspace_id", `eq.${workspaceId}`], ["content_id", `eq.${contentId}`]]);
      return { configured: true, rows: [savedVariant()] };
    }),
  };
  assert.deepEqual(await workflow.executeContentWorkflow(input, { workspaceId }, dependencies),
    { status: "invalid-input", error: "invalid-reels-script-duration", sceneNumber: 1 });
  assert.equal(writes, 0);
  const plain = { ...dependencies, read: withoutReceipt(async () => ({ configured: true, rows: [savedVariant({ variant_type: "blog_insight" })] })) };
  assert.equal((await workflow.executeContentWorkflow(update({ variant: { body: "보통 글" } }), { workspaceId }, plain)).status, "saved");
  assert.equal(writes, 1);
});

test("branching or changing to reels validates an inherited body without converting the source", async () => {
  const saved = savedVariant({ variant_type: "blog_insight", body: "원문 텍스트 그대로" });
  const before = structuredClone(saved);
  for (const action of ["save", "create_variant"]) {
    const result = await workflow.executeContentWorkflow(update({ action, variant: { variantType: "reels_script", channel: "reels" } }), { workspaceId }, {
      read: withoutReceipt(async () => ({ configured: true, rows: [saved] })), rpc: async () => assert.fail("must not persist an inherited invalid body"),
    });
    assert.equal(result.error, "invalid-reels-script-json");
    assert.deepEqual(saved, before);
  }
});

test("metadata edits and restoring legacy revisions leave old bodies untouched", async () => {
  for (const input of [update({ variant: { title: "새 제목" } }), update({ action: "restore_revision", revisionId: requestId })]) {
    const result = await workflow.executeContentWorkflow(input, { workspaceId }, {
      read: async () => assert.fail("must not inspect or rewrite an unchanged legacy body"),
      rpc: async (_name, params) => {
        assert.equal(Object.hasOwn(params.p_command.variant || {}, "body"), false);
        return { ok: true, data: { status: "saved", variant: { body: "이전 JSON 원문" } } };
      },
    });
    assert.equal(result.variant.body, "이전 JSON 원문");
  }
});

test("branching an inherited reel validates the copy and preserves the original body", async () => {
  for (const body of ["old non-JSON body", JSON.stringify({ scenes: [reelScene()] })]) {
    const saved = savedVariant({ body });
    let writes = 0;
    const result = await workflow.executeContentWorkflow(update({ action: "create_variant", variant: { title: "복사본" } }), { workspaceId }, {
      read: withoutReceipt(async () => ({ configured: true, rows: [saved] })),
      rpc: async () => { writes += 1; return { ok: true, data: { status: "saved" } }; },
    });
    assert.equal(result.status, body.startsWith("old") ? "invalid-input" : "saved");
    assert.equal(writes, body.startsWith("old") ? 0 : 1);
    assert.equal(saved.body, body);
  }
});

test("failed or foreign partial-update reads never reach persistence", async () => {
  const input = update({ variant: { body: "not JSON" } });
  for (const read of [
    async () => ({ configured: false, rows: null }),
    async () => ({ configured: true, rows: null, error: "read failed" }),
    async () => { throw new Error("offline"); },
    async () => ({ configured: true, rows: [savedVariant({ workspace_id: requestId })] }),
    async () => ({ configured: true, rows: [savedVariant({ id: requestId })] }),
    async () => ({ configured: true, rows: [savedVariant({ content_id: requestId })] }),
    async () => ({ configured: true, rows: [savedVariant(), savedVariant()] }),
    async () => ({ configured: true, rows: [savedVariant({ variant_type: undefined })] }),
  ]) {
    const result = await workflow.executeContentWorkflow(input, { workspaceId }, { read: withoutReceipt(read), rpc: async () => assert.fail("must not write") });
    assert.ok(["error", "preview"].includes(result.status));
  }
});

test("stale partial updates preserve the RPC's version check and idempotent receipt result", async () => {
  const input = update({ variant: { body: "not JSON" } });
  for (const status of ["duplicate", "conflict"]) {
    const result = await workflow.executeContentWorkflow(input, { workspaceId }, {
      read: withoutReceipt(async () => ({ configured: true, rows: [savedVariant({ updated_at: "2026-09-12T10:20:30.123457+00:00" })] })),
      rpc: async (_name, params) => {
        assert.equal(params.p_command.expectedVariantUpdatedAt, timestamp);
        assert.equal(params.p_command.variant.body, "not JSON");
        return { ok: true, data: { status } };
      },
    });
    assert.equal(result.status, status);
  }
});

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
    const body = variantType === "reels_script" ? JSON.stringify({ scenes: [reelScene()] }) : "x";
    assert.equal(normalize(create({ variant: { body, variantType, channel } })).ok, true);
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

// Captures from the Windows branch must remain editable in the versioned Studio.
test("Threads captures use the Threads channel without changing legacy X variants", () => {
  assert.equal(normalize(create({ variant: { body: "captured idea", variantType: "threads_post", channel: "threads" } })).ok, true);
  assert.equal(normalize(create({ variant: { body: "captured idea", variantType: "threads_post", channel: "x" } })).ok, false);
  assert.equal(normalize(create({ variant: { body: "legacy", variantType: "x_thread", channel: "x" } })).ok, true);
});

test("keeps research source drafts channel neutral while editing", () => {
  assert.equal(normalize(update({ variant: { body: "검토 원고", variantType: "base_text", channel: "unassigned" } })).ok, true);
  assert.equal(normalize(update({ variant: { body: "검토 원고", variantType: "base_text", channel: "threads" } })).ok, false);
  assert.equal(normalize(update({ variant: { body: "검토 원고", variantType: "threads_post", channel: "unassigned" } })).ok, false);
});
