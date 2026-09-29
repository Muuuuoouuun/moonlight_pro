import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCodexDraft, readSaveOutcome, summarizeSyncResult } from "./product-client.js";

test("save envelopes: preview is never a success", () => {
  assert.deepEqual(readSaveOutcome(201, { status: "saved", entity: { id: "p" } }), { ok: true, status: "saved", entity: { id: "p" } });
  assert.equal(readSaveOutcome(200, { status: "duplicate" }).ok, true);
  const preview = readSaveOutcome(202, { status: "preview", error: "engine-not-configured" });
  assert.equal(preview.ok, false);
  assert.match(preview.message, /저장되지 않았어요/);
  assert.equal(readSaveOutcome(202, { status: "error", error: "missing-config" }).ok, false);
  const conflict = readSaveOutcome(409, { status: "conflict", error: "repository-owned-by-other-product" });
  assert.equal(conflict.status, "conflict");
  assert.match(conflict.message, /제품 하나에만/);
  assert.match(readSaveOutcome(502, null).message, /http-502/);
});

test("sync results name what happened without a green success", () => {
  assert.equal(summarizeSyncResult(200, { status: "synced", repositories: [{}, {}] }).message, "저장소 2개를 동기화했어요.");
  assert.equal(summarizeSyncResult(202, { status: "preview", configured: false }).message, "제품에 연결된 저장소가 없어요.");
  assert.equal(summarizeSyncResult(502, { status: "error" }).tone, "danger");
});

test("codex draft carries the failing check and log link, not secrets", () => {
  const draft = buildCodexDraft({ name: "OMR" }, { fullName: "o/omr", defaultBranch: "main", summary: { ci: { failed: ["test"], url: "https://github.com/o/omr/actions/runs/1" } } });
  assert.match(draft, /o\/omr 기본 브랜치\(main\) CI가 실패/);
  assert.match(draft, /실패한 check: test/);
  assert.match(draft, /actions\/runs\/1/);
});
