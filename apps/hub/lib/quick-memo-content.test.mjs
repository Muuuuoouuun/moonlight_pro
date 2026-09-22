import assert from "node:assert/strict";
import { test } from "node:test";
import { newMemoDraft } from "./memo-capture.js";
import { prepareMemoIdea, saveMemoAsIdeaAndVerify } from "./quick-memo-content.js";
import { readQuickMemoDraft, writeQuickMemoDraft } from "./quick-memo.js";
import { validateJournalInput } from "./journal.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const input = () => prepareMemoIdea({ ...newMemoDraft(), body: "  메모 원문\n소재로 연결  ", scope: "company" });

function server(draft, overrides = {}) {
  const contentId = crypto.randomUUID(), variantId = crypto.randomUUID();
  const target = { type: "content", id: contentId, variantId, title: "메모 원문", href: `/dashboard/content/studio?item=${contentId}&variant=${variantId}` };
  const link = { id: crypto.randomUUID(), targetType: "content", targetId: contentId, href: target.href, excerpt: draft.body, sourceRevision: 1 };
  const sourceRef = { type: "journal", journal_id: draft.id, revision: 1, excerpt: draft.body, href: `/dashboard/work/memos?note=${draft.id}` };
  const entry = () => ({ id: draft.id, body: draft.body, revision: 1, occurredAt: draft.occurredAt, links: created ? [link] : [] });
  const ledger = () => ({
    status: "live", source: "supabase",
    items: [{ id: contentId, sourceIdea: draft.body, sourceRefs: [sourceRef] }],
    variants: [{ id: variantId, contentId, body: "" }],
  });
  let created = false;
  const requests = new Map();
  const fetch = async (url, options = {}) => {
    if (url === "/api/hub/journal" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      assert.equal(validateJournalInput(payload).ok, true, "use the existing journal command contract");
      if (payload.action === "save") return overrides.memo?.() || json({ status: "saved", entry: entry() });
      assert.equal(payload.action, "create_content");
      overrides.onIdea?.(payload);
      const prior = requests.get(payload.requestId);
      if (prior) assert.deepEqual(payload, prior, "a retried journal command must be byte-for-byte equivalent");
      requests.set(payload.requestId, payload);
      created = true;
      return overrides.idea?.({ target, link, entry: entry(), duplicate: Boolean(prior) })
        || json({ status: prior ? "duplicate" : "saved", target, link, entry: entry() });
    }
    if (url === `/api/hub/journal?note=${draft.id}` && !options.method)
      return created && overrides.journalRead ? overrides.journalRead(entry()) : json({ status: "live", entry: entry() });
    assert.equal(url, "/api/hub/content");
    assert.equal(options.method, undefined, "journal IDs must never be sent to the legacy notes-backed content writer");
    return overrides.read?.(ledger()) || json(ledger());
  };
  return Object.assign(fetch, { target });
}

test("quick memo uses the canonical journal handoff and returns server-issued content IDs", async () => {
  const draft = input();
  let payload;
  const fetch = server(draft, { onIdea: value => { payload = value; } });
  const receipt = await saveMemoAsIdeaAndVerify(draft, fetch);
  assert.deepEqual(receipt, { id: draft.id, contentId: fetch.target.id, variantId: fetch.target.variantId });
  assert.notEqual(receipt.contentId, draft.ideaContentId);
  assert.deepEqual(payload, {
    action: "create_content", requestId: draft.ideaContentId, entryId: draft.id, expectedRevision: 1,
    selection: { prefix: "", text: draft.body, suffix: "" },
    target: { title: "메모 원문", brandId: null, channel: "threads" },
  });
});

test("unverified memo never creates a content copy", async () => {
  const draft = input();
  let writes = 0;
  await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, {
    memo: () => json({ status: "preview" }), onIdea: () => { writes++; },
  })));
  assert.equal(writes, 0);
});

test("content preview, conflicts, unknown receipts and missing readback retain the memo receipt", async () => {
  for (const overrides of [
    { idea: () => json({ status: "preview" }) },
    { idea: () => json({ status: "conflict" }, 409) },
    { idea: () => { throw new TypeError("lost reply"); } },
    { read: () => json({ status: "partial", source: "supabase", items: [], variants: [] }) },
    { read: () => json({ status: "error", source: "error" }) },
    { read: () => json({ status: "preview", source: "preview" }) },
    { journalRead: entry => json({ status: "live", entry: { ...entry, links: [] } }) },
  ]) {
    const draft = input();
    await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, overrides)), error =>
      error.id === draft.id && error.message.includes("원문 메모는 저장"));
  }
});

test("a lost handoff reply can be retried after tab restoration without creating another target", async () => {
  const draft = input();
  const writes = [];
  const fetch = server(draft, {
    onIdea: value => writes.push(value),
    idea: ({ target, link, entry, duplicate }) => {
      if (!duplicate) throw new TypeError("lost");
      return json({ status: "duplicate", target, link, entry });
    },
  });
  await assert.rejects(saveMemoAsIdeaAndVerify(draft, fetch));
  let stored;
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  writeQuickMemoDraft(storage, "quick", draft);
  const restored = prepareMemoIdea(readQuickMemoDraft(storage, "quick"));
  assert.deepEqual(restored, draft);
  const receipt = await saveMemoAsIdeaAndVerify(restored, fetch);
  assert.deepEqual(receipt, { id: draft.id, contentId: fetch.target.id, variantId: fetch.target.variantId });
  assert.deepEqual(writes[0], writes[1]);
});

test("wrong source linkage or variant does not count as a verified handoff", async () => {
  const draft = input();
  for (const mutate of [
    ledger => { ledger.items[0].sourceRefs[0].journal_id = crypto.randomUUID(); },
    ledger => { ledger.items[0].sourceRefs[0].revision = 2; },
    ledger => { ledger.items[0].sourceRefs[0].excerpt = draft.body.trim(); },
    ledger => { ledger.items[0].sourceIdea = draft.body.trim(); },
    ledger => { ledger.variants[0].contentId = crypto.randomUUID(); },
  ]) {
    await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, { read: ledger => {
      mutate(ledger);
      return json(ledger);
    } })));
  }
});

test("malformed handoff targets are rejected before content readback", async () => {
  const draft = input();
  for (const patch of [{ id: "not-a-uuid" }, { variantId: "missing" }, { type: "task" }]) {
    let reads = 0;
    await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, {
      idea: ({ target, link, entry }) => json({ status: "saved", target: { ...target, ...patch }, link, entry }),
      read: ledger => { reads++; return json(ledger); },
    })));
    assert.equal(reads, 0);
  }
});

test("long memo is saved intact and explains the journal excerpt limit before creating content", async () => {
  const draft = prepareMemoIdea({ ...newMemoDraft(), body: "가".repeat(3501) });
  let writes = 0;
  await assert.rejects(saveMemoAsIdeaAndVerify(draft, server(draft, {
    onIdea: () => { writes++; },
  })), error => error.id === draft.id && error.message.includes("3,500") && error.message.includes("발췌"));
  assert.equal(writes, 0);
});
