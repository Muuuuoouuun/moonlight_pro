import assert from "node:assert/strict";
import { test } from "node:test";
import { contentQueueScope, contentQueueTabs, studioVariantMode, manualPublicationFields, publicationIsVerified } from "./content-workflow.js";
import { createContentLedgerCache } from "./content-ledger-cache.js";

const response = (items, source = "supabase") => ({ ok: true, json: async () => ({ source, items, status: source === "supabase" ? "live" : "preview" }) });

test("manual publication validates empty and future dates before any write", () => {
  const now = Date.parse("2026-09-14T12:00:00Z");
  const url = "https://www.threads.net/@example/post/abc";
  for (const date of ["", "invalid", "2026-09-15T12:00:00Z"])
    assert.throws(() => manualPublicationFields(url, date, now), /발행 일시/);
  for (const address of ["", "javascript:alert(1)", "https://user:pass@example.com"])
    assert.throws(() => manualPublicationFields(address, "2026-09-14T11:00:00Z", now), /URL/);
  assert.deepEqual(manualPublicationFields(url, "2026-09-14T11:00:00Z", now), {
    targetUrl: url, publishedAt: "2026-09-14T11:00:00.000Z",
  });
});

test("publication needs matching provenance and both persisted statuses, not just log ID", () => {
  const command = { logId: "log", contentId: "item", variantId: "variant", targetUrl: "https://example.com/post", publishedAt: "2026-09-14T11:00:00Z" };
  const ledger = { source: "supabase", items: [{ id: "item", status: "published" }], variants: [{ id: "variant", status: "published" }], publishLogs: [{ ...command, id: "log", status: "published", provider: "manual", event: "operator_published", provenance: "operator_confirmed" }] };
  assert.equal(publicationIsVerified(ledger, command), true);
  assert.equal(publicationIsVerified({ ...ledger, items: [{ id: "item", status: "draft" }] }, command), false);
  assert.equal(publicationIsVerified({ ...ledger, publishLogs: [{ ...ledger.publishLogs[0], targetUrl: "https://example.com/wrong" }] }, command), false);
  assert.equal(publicationIsVerified({ ...ledger, publishLogs: [{ ...ledger.publishLogs[0], provenance: null }] }, command), false);
});

test("queue summary counts use the selected brand and keep unassigned ideas in all", () => {
  const queue = [{ id: "1", brandId: "a", statusKey: "idea" }, { id: "2", brandId: "b", statusKey: "draft" }, { id: "3", brandId: null, statusKey: "idea" }];
  const scoped = contentQueueScope(queue, "a");
  assert.equal(scoped.length, 1);
  assert.deepEqual(contentQueueTabs(scoped).map((tab) => tab.count), [1, 1, 0, 0, 0, 0]);
  assert.equal(contentQueueScope(queue).length, 3);
});

test("Threads is distinct from X thread; unsupported variants cannot choose an editable mode", () => {
  assert.equal(studioVariantMode("threads_post"), "threads");
  assert.equal(studioVariantMode("blog_insight"), "blog");
  assert.equal(studioVariantMode("card_news"), "carousel");
  assert.equal(studioVariantMode("x_thread"), null);
});

test("concurrent readers deduplicate and a post-write invalidation ignores older reads", async () => {
  const resolvers = [];
  const cache = createContentLedgerCache(() => new Promise((resolve) => resolvers.push(resolve)));
  const original = cache.refresh();
  assert.equal(cache.refresh(), original);
  const afterWrite = cache.invalidate();
  assert.equal(resolvers.length, 2);
  resolvers[1](response([{ id: "new" }]));
  await afterWrite;
  resolvers[0](response([{ id: "old" }]));
  await original;
  assert.equal(cache.getSnapshot().items[0].id, "new");
});

test("preview clears previous live rows; failures retain rows only with partial label", async () => {
  let next = response([{ id: "live" }]);
  const cache = createContentLedgerCache(async () => { if (next instanceof Error) throw next; return next; });
  await cache.refresh();
  next = new Error("offline");
  await cache.refresh();
  assert.equal(cache.getSnapshot().syncState, "partial");
  assert.equal(cache.getSnapshot().items.length, 1);
  next = response([], "preview");
  await cache.refresh();
  assert.equal(cache.getSnapshot().syncState, "preview");
  assert.equal(cache.getSnapshot().items.length, 0);
  next = new Error("offline");
  await cache.refresh();
  assert.equal(cache.getSnapshot().syncState, "error");
});
