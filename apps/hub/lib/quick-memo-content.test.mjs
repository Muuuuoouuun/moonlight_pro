import assert from "node:assert/strict";
import { test } from "node:test";
import { newMemoDraft } from "./memo-capture.js";
import { prepareMemoIdea, saveMemoAsIdeaAndVerify } from "./quick-memo-content.js";
import { readQuickMemoDraft, writeQuickMemoDraft } from "./quick-memo.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const input = () => prepareMemoIdea({ ...newMemoDraft(), body: "  메모 원문\n소재로 연결  ", scope: "company" });

function server(draft, overrides = {}) {
  return async (url, options) => {
    if (url.startsWith("/api/hub/memo-capture")) {
      if (options.method === "POST") return overrides.memo?.() || json({ status: "saved", id: draft.id });
      return json({ status: "live", memo: { id: draft.id, body: draft.body } });
    }
    if (options.method === "POST") {
      overrides.onIdea?.(JSON.parse(options.body));
      return overrides.idea?.() || json({ status: "saved", contentId: draft.ideaContentId, variantId: draft.ideaVariantId });
    }
    return overrides.read?.() || json({
      status: "live", source: "supabase",
      items: [{ id: draft.ideaContentId, sourceIdea: draft.body, sourceNoteId: draft.id, orgScope: draft.scope }],
      variants: [{ id: draft.ideaVariantId, contentId: draft.ideaContentId, body: draft.body }],
    });
  };
}

test("explicit handoff preserves original note, verbatim body and chosen company scope", async () => {
  const draft = input();
  let payload;
  const receipt = await saveMemoAsIdeaAndVerify(draft, server(draft, { onIdea: value => { payload = value; } }));
  assert.equal(receipt.id, draft.id);
  assert.equal(receipt.contentId, draft.ideaContentId);
  assert.deepEqual(payload, {
    action: "idea", contentId: draft.ideaContentId, variantId: draft.ideaVariantId,
    body: draft.body, sourceNoteId: draft.id, orgScope: "company",
  });
});

test("unverified note never creates a content copy", async () => {
  const draft = input();
  let writes = 0;
  await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, {
    memo: () => json({ status: "preview" }), onIdea: () => { writes++; },
  })));
  assert.equal(writes, 0);
});

test("content preview, conflicts, unknown receipts and missing readback retain note receipt", async () => {
  for (const overrides of [
    { idea: () => json({ status: "preview" }) },
    { idea: () => json({ status: "conflict" }, 409) },
    { idea: () => { throw new TypeError("lost reply"); } },
    { read: () => json({ status: "partial", source: "supabase", items: [], variants: [] }) },
    { read: () => json({ status: "preview", source: "preview" }) },
  ]) {
    const draft = input();
    await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, overrides)), error =>
      error.id === draft.id && error.message.includes("원문 메모는 저장"));
  }
});

test("retry after lost content reply keeps both IDs across tab draft restoration", async () => {
  const draft = input();
  const writes = [];
  await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, {
    onIdea: value => writes.push(value), idea: () => { throw new TypeError("lost"); },
  })));
  let stored;
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  writeQuickMemoDraft(storage, "quick", draft);
  const restored = prepareMemoIdea(readQuickMemoDraft(storage, "quick"));
  assert.deepEqual(restored, draft);
  await saveMemoAsIdeaAndVerify(restored, server(restored, {
    onIdea: value => writes.push(value),
    idea: () => json({ status: "duplicate", contentId: draft.ideaContentId, variantId: draft.ideaVariantId }),
  }));
  assert.deepEqual(writes[0], writes[1]);
});

test("wrong source linkage, scope or variant does not count as verified", async () => {
  const draft = input();
  for (const patch of [{ sourceNoteId: crypto.randomUUID() }, { orgScope: "personal" }, { sourceIdea: draft.body.trim() }]) {
    await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, { read: () => json({
      status: "live", source: "supabase",
      items: [{ id: draft.ideaContentId, sourceNoteId: draft.id, orgScope: draft.scope, sourceIdea: draft.body, ...patch }],
      variants: [{ id: draft.ideaVariantId, contentId: draft.ideaContentId, body: draft.body }],
    }) })));
  }
});
