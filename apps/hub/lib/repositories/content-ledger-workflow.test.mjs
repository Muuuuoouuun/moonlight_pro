import assert from "node:assert/strict";
import { test } from "node:test";
import { getContentLedger } from "./content-ledger.js";

test("projects exact source/brief metadata and stored channel with a legacy channel fallback", async () => {
  const env = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { COM_MOON_DEFAULT_WORKSPACE_ID: "11111111-1111-1111-1111-111111111111", SUPABASE_URL: "https://projection.example.test", SUPABASE_SERVICE_ROLE_KEY: "test" });
  const sourceRefs = [{ kind: "note", id: "note-1" }];
  const item = { id: "content-1", title: "제목", source_idea: " 원문\n ", updated_at: "2026-09-12T00:00:00Z", meta: { brief: { audience: "독자" }, blocker: "근거 부족", primary_variant_id: "variant-2", source_refs: sourceRefs } };
  globalThis.fetch = async (url) => {
    const table = new URL(url).pathname.split("/").at(-1);
    const rows = table === "content_items" ? [item] : table === "content_variants" ? [
      { id: "variant-1", content_id: "content-1", variant_type: "x_thread", channel: null },
      { id: "variant-2", content_id: "content-1", variant_type: "x_thread", channel: "threads" },
    ] : [];
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  try {
    const ledger = await getContentLedger();
    assert.equal(ledger.items[0].sourceIdea, item.source_idea);
    assert.deepEqual(ledger.items[0].brief, item.meta.brief);
    assert.equal(ledger.items[0].blocker, "근거 부족");
    assert.equal(ledger.items[0].primaryVariantId, "variant-2");
    assert.deepEqual(ledger.items[0].sourceRefs, sourceRefs);
    assert.equal(ledger.items[0].variantId, "variant-2");
    assert.equal(ledger.items[0].channel, "Threads");
    assert.equal(ledger.variants[0].channel, "X");
    assert.equal(ledger.variants[1].channel, "Threads");
  } finally { process.env = env; globalThis.fetch = originalFetch; }
});
