import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const stubs = {
  "@/lib/server-read": `
    export function inFilter(values) { return 'in.(' + values.join(',') + ')'; }
    export function withWorkspaceFilter(filters = []) { return [['workspace_id','eq.workspace'], ...filters]; }
    export async function fetchSupabaseRows(table) { return globalThis.__captureRows[table] ?? []; }
  `,
  "@/lib/server-write": `
    export function resolveDefaultWorkspaceId() { return 'workspace'; }
    export function resolveSupabaseConfig() { return { url: 'https://example.invalid' }; }
  `,
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { buildContentIdeaRecords, buildContentDraftRecords, buildContentDraftUpdateRecords, buildContentPublicationRecord, getContentLedger } = await import("./repositories/content-ledger.js");
beforeEach(() => { globalThis.__captureRows = {}; });

test("minimal unbranded idea preserves raw memo text and explicit scope through readback", async () => {
  const body = "  갑자기 떠오른 생각\n두 번째 줄  ";
  const capture = buildContentIdeaRecords({ contentId: "content", variantId: "variant", body, sourceNoteId: "note", orgScope: "personal" });
  assert.equal(capture.itemRecord.brand_id, null);
  assert.equal(capture.itemRecord.status, "idea");
  assert.equal(capture.variantRecord.variant_type, "threads_post");
  assert.equal(capture.variantRecord.channel, "threads");
  globalThis.__captureRows = { content_items: [capture.itemRecord], content_variants: [capture.variantRecord] };
  const ledger = await getContentLedger();
  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].sourceIdea, body);
  assert.equal(ledger.items[0].sourceNoteId, "note");
  assert.equal(ledger.items[0].orgScope, "personal");
  assert.equal(ledger.queue[0].orgScope, "personal");
  assert.equal(ledger.variants[0].body, body);
  assert.equal(ledger.variants[0].channel, "Threads");
});

test("URL-only idea is a durable body and keeps company scope without a brand", () => {
  const capture = buildContentIdeaRecords({ sourceUrl: "https://example.com/reference", orgScope: "company" });
  assert.equal(capture.itemRecord.source_idea, "https://example.com/reference");
  assert.equal(capture.variantRecord.body, "https://example.com/reference");
  assert.equal(capture.itemRecord.meta.org_scope, "company");
});

test("idea validation rejects empty input, unsafe links and absent scope", () => {
  assert.throws(() => buildContentIdeaRecords({ orgScope: "personal" }), TypeError);
  assert.throws(() => buildContentIdeaRecords({ body: "idea", sourceUrl: "javascript:alert(1)", orgScope: "personal" }), TypeError);
  assert.throws(() => buildContentIdeaRecords({ body: "idea" }), TypeError);
});

test("Threads is a distinct write/read type from legacy X thread aliases", () => {
  assert.equal(buildContentDraftRecords({ variantType: "threads_post" }).variantRecord.variant_type, "threads_post");
  assert.equal(buildContentDraftRecords({ variantType: "thread" }).variantRecord.variant_type, "x_thread");
  assert.equal(buildContentDraftRecords({ variantType: "social_post" }).variantRecord.variant_type, "x_thread");
});

test("draft update omits source idea unless explicitly provided and permits clearing brand", () => {
  const draft = buildContentDraftUpdateRecords({ title: "New title", body: "Changed", brandId: null, variantType: "threads_post" });
  assert.equal("source_idea" in draft.itemPatch, false);
  assert.equal("source_note_id" in draft.itemPatch.meta, false);
  assert.equal(draft.itemPatch.brand_id, null);
});

test("publication records are operator confirmations rather than verified provider publications", async () => {
  const publication = buildContentPublicationRecord({ contentId: "content", variantId: "variant", logId: "log", targetUrl: "https://www.threads.com/@example/post/123", publishedAt: "2026-09-01T00:00:00Z", channel: "Threads" });
  assert.equal(publication.action, "record_publication");
  assert.equal(publication.logRecord.provider, "manual");
  assert.equal(publication.logRecord.payload.external_verified, false);
  assert.equal(publication.logRecord.payload.provenance, "operator_confirmed");
  globalThis.__captureRows = { publish_logs: [publication.logRecord], content_variants: [{ id: "variant", content_id: "content", variant_type: "threads_post" }] };
  const ledger = await getContentLedger();
  assert.equal(ledger.publishLogs[0].targetUrl, publication.logRecord.target_url);
  assert.equal(ledger.publishLogs[0].provenance, "operator_confirmed");
});
