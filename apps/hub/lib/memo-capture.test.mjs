import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readMemoFile,
  newMemoDraft,
  memoCapturePayload,
  restoreMemoDraft,
} from "./memo-capture.js";
import { selectMemos } from "./memo-view.js";
import { forwardMemoCapture } from "./memo-capture-engine-client.js";
import { validateJournalInput } from "./journal.js";
import { journalSaveCommand } from "./memo-save.js";
test("UTF-8 Markdown keeps line breaks, source name and original text; labels stay optional", async () => {
  const file = new File(
    ["# 제목\r\n\n[[참고]]\n<script>no execution</script>"],
    "생각.md",
    { lastModified: 1000 },
  );
  const read = await readMemoFile(file);
  assert.equal(read.body, await file.text());
  assert.equal(read.source.originalBody, read.body);
  assert.equal(read.source.name, "생각.md");
  assert.deepEqual(
    memoCapturePayload({ ...newMemoDraft(), ...read }).labels,
    [],
  );
});
test("rejects unsupported, oversized, empty and invalid UTF-8 files without silent truncation", async () => {
  for (const file of [
    new File(["x"], "x.pdf"),
    new File(["x".repeat(262145)], "x.txt"),
    new File([" "], "x.md"),
    new File([new Uint8Array([255, 254])], "x.txt"),
  ])
    await assert.rejects(() => readMemoFile(file));
});
test("draft restore and label parsing preserve the immutable request ID", () => {
  const draft = {
    ...newMemoDraft(),
    body: "draft",
    labels: "#고객질문, 아이디어, 고객질문",
  };
  assert.deepEqual(
    restoreMemoDraft(JSON.stringify({ version: 1, draft })),
    draft,
  );
  assert.deepEqual(memoCapturePayload(draft).labels, ["고객질문", "아이디어"]);
  assert.equal(restoreMemoDraft("{broken"), null);
  assert.equal(restoreMemoDraft(JSON.stringify({ version: 0, draft })), null);
});
test("memo capture boundaries match the journal save contract without dropping input", () => {
  const draft = { ...newMemoDraft(), body: "본문", title: "제".repeat(200), labels: Array.from({ length: 8 }, (_, n) => `${n}${"태".repeat(31)}`).join(",") };
  const accepted = memoCapturePayload(draft);
  assert.equal(validateJournalInput(journalSaveCommand(accepted)).ok, true);
  for (const patch of [{ title: "제".repeat(201) }, { labels: "태".repeat(33) }, { labels: Array.from({ length: 9 }, (_, n) => `태그${n}`).join(",") }]) {
    const oversized = { ...draft, ...patch };
    const before = structuredClone(oversized);
    assert.throws(() => memoCapturePayload(oversized));
    assert.deepEqual(oversized, before);
  }
  // Existing overlong titles remain recoverable so the operator can shorten them.
  const legacy = { ...draft, title: "제".repeat(300) };
  assert.equal(restoreMemoDraft(JSON.stringify({ version: 1, draft: legacy })).title, legacy.title);
  assert.deepEqual(memoCapturePayload({ ...draft, labels: "#Follow   up, follow up, ##검토" }).labels, ["Follow up", "검토"]);
});
test("rediscovery uses saved date, matches labels and file names, excludes unknown dates", () => {
  const old = {
    id: "old",
    labels: ["기획"],
    source: { name: "사업.md" },
    createdAt: "2026-01-01",
  };
  const data = {
    memos: [old, { id: "unknown" }, { id: "new", createdAt: "2026-09-08" }],
    links: [],
  };
  assert.deepEqual(selectMemos(data, { query: "기획" }), [old]);
  assert.deepEqual(selectMemos(data, { query: "사업.md" }), [old]);
  assert.deepEqual(
    selectMemos(data, { filter: "older", now: Date.parse("2026-09-09") }),
    [old],
  );
});
test("Hub relay is authenticated, bounded and never retries a write", async () => {
  const env = {
    COM_MOON_ENGINE_URL: "http://engine.test",
    COM_MOON_SHARED_WEBHOOK_SECRET: "test",
  };
  let calls = 0;
  const result = await forwardMemoCapture(
    { body: "memo" },
    {
      env,
      fetchImpl: async (url, opts) => {
        calls++;
        assert.equal(url, "http://engine.test/api/memos/capture");
        assert.equal(opts.headers["x-com-moon-shared-secret"], "test");
        assert.equal(opts.redirect, "error");
        assert.ok(opts.signal);
        throw new Error("private detail");
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.data.status, "error");
  assert.equal(JSON.stringify(result).includes("private detail"), false);
});
