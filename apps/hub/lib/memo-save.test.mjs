import assert from "node:assert/strict";
import { test } from "node:test";
import { memoCapturePayload, newMemoDraft, MEMO_DRAFT_KEY } from "./memo-capture.js";
import { journalSaveCommand, saveMemoAndVerify } from "./memo-save.js";
import { quickMemoDraftKey, readQuickMemoDraft, writeQuickMemoDraft } from "./quick-memo.js";

const payload = () => memoCapturePayload({ ...newMemoDraft(), body: "급한 생각\n두 번째 줄" });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });

// 2026-09-20 통합: 빠른 메모가 `/api/hub/memo-capture` → notes 가 아니라
// `/api/hub/journal` → journal_entries 로 간다. 영수증·되읽기 계약의 의도는 그대로이고
// 와이어 형태만 바뀐다(영수증 `{status, entry}`, 되읽기 `{status:'live', entry}`).
const ok = (input, status = "saved") => response({ status, entry: { id: input.id, body: input.body } });
const readOk = (input) => response({ status: "live", entry: { id: input.id, body: input.body } });

test("successful and duplicate receipts both require an exact ID/body read-back", async () => {
  for (const status of ["saved", "duplicate"]) {
    const input = payload();
    const calls = [];
    const saved = await saveMemoAndVerify(input, async (url, options) => {
      calls.push([url, options]);
      return options.method === "POST" ? ok(input, status) : readOk(input);
    });
    assert.equal(saved.memo.body, input.body);
    assert.equal(calls.length, 2);
    // 통합된 경로로만 쓴다 — notes 로 돌아가면 메모 페이지에서 다시 사라진다.
    assert.ok(calls.every(([url]) => String(url).startsWith("/api/hub/journal")), "journal 경로를 쓰지 않는다");
    const sent = JSON.parse(calls[0][1].body);
    assert.equal(sent.action, "save");
    assert.equal(sent.requestId, input.id);
    assert.equal(sent.entryId, input.id);
    assert.equal(sent.body, input.body);
    assert.equal(sent.noteMeta.kind, "note");
    assert.equal(calls[1][1].cache, "no-store");
    assert.ok(calls.every(([, options]) => options.signal));
  }
});

test("rejected, preview and malformed receipts never trigger read-back or success", async () => {
  for (const receipt of [{ status: "preview" }, { status: "error" }, { status: "saved" }, { status: "saved", entry: { id: "다른-id" } }]) {
    let count = 0;
    await assert.rejects(saveMemoAndVerify(payload(), async () => { count++; return response(receipt, receipt.entry ? 500 : 200); }));
    assert.equal(count, 1);
  }
});

test("a conflict keeps a link to the original receipt without overwriting it", async () => {
  const input = payload();
  await assert.rejects(saveMemoAndVerify(input, async () => response({ status: "conflict", entry: { id: input.id, body: input.body } }, 409)), error => error.id === input.id);
});

test("read-back mismatch, preview, HTTP and transport failure retain the known receipt", async () => {
  const input = payload();
  for (const read of [
    () => response({ status: "live", entry: { id: input.id, body: "different" } }),
    () => response({ status: "live", entry: { id: "different", body: input.body } }),
    () => response({ status: "preview" }),
    () => response({}, 502),
    () => { throw new TypeError("offline"); },
  ]) {
    await assert.rejects(saveMemoAndVerify(input, async (_url, options) => options.method === "POST" ? ok(input) : read()), error => error.id === input.id && error.message.includes("재확인"));
  }
});

test("lost acknowledgement is retried with the same immutable payload, not automatically", async () => {
  const input = payload();
  const posted = [];
  let failed = false;
  const fetchImpl = async (_url, options) => {
    if (options.method === "POST") {
      posted.push(JSON.parse(options.body));
      if (!failed) { failed = true; throw new DOMException("timeout", "TimeoutError"); }
      return ok(input, "duplicate");
    }
    return readOk(input);
  };
  await assert.rejects(saveMemoAndVerify(input, fetchImpl));
  assert.equal(posted.length, 1);
  assert.equal((await saveMemoAndVerify(input, fetchImpl)).status, "duplicate");
  // 멱등 키(requestId)와 본문은 재시도에도 그대로다. occurredAt 은 호출 시각이라 달라질 수
  // 있고, 중복 판정은 requestId 가 하므로 그 차이는 계약에 영향이 없다.
  assert.equal(posted.length, 2);
  for (const sent of posted) {
    assert.equal(sent.requestId, input.id);
    assert.equal(sent.entryId, input.id);
    assert.equal(sent.body, input.body);
    assert.equal(sent.expectedRevision, 0);
  }
});

test("quick draft storage is separated from full memo and other contexts", () => {
  const entries = new Map([[MEMO_DRAFT_KEY, "full memo untouched"]]);
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const key = quickMemoDraftKey("workspace/operator-a");
  const draft = { ...newMemoDraft(), body: "한글 초안\n줄바꿈" };
  writeQuickMemoDraft(storage, key, draft);
  assert.deepEqual(readQuickMemoDraft(storage, key), draft);
  assert.equal(readQuickMemoDraft(storage, quickMemoDraftKey("workspace/operator-b")), null);
  assert.equal(readQuickMemoDraft(storage, MEMO_DRAFT_KEY), null);
  writeQuickMemoDraft(storage, key, newMemoDraft());
  assert.equal(readQuickMemoDraft(storage, key), null);
  assert.equal(entries.get(MEMO_DRAFT_KEY), "full memo untouched");
});

test("invalid or file draft cannot be silently submitted through the quick entry point", () => {
  const draft = { ...newMemoDraft(), body: "memo" };
  for (const patch of [{ id: "bad" }, { source: { type: "file" } }, { body: "bad\0text" }, { labels: "unexpected" }, { title: "unexpected" }]) {
    assert.equal(readQuickMemoDraft({ getItem: () => JSON.stringify({ version: 1, draft: { ...draft, ...patch } }) }, "quick"), null);
  }
});
