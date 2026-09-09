import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeMemoLinkCommand,
  executeMemoLinkCommand,
} from "./memo-link-command.ts";
const id = "11111111-1111-1111-1111-111111111111";
const create = {
  action: "create",
  sourceKind: "note",
  sourceId: id,
  projectId: id,
  title: " 초안 작성 ",
  dueAt: "2026-09-09T23:59:00+09:00",
};
test("memo conversion validates scope, source and exact target before RPC", () => {
  for (const input of [
    { ...create, sourceKind: "lead" },
    { ...create, sourceId: "bad" },
    { ...create, title: "" },
    { ...create, title: "x".repeat(301) },
    { ...create, projectId: null },
    { ...create, dueAt: "invalid" },
    { action: "link", sourceKind: "note", sourceId: id, taskId: "bad" },
  ])
    assert.equal(normalizeMemoLinkCommand(input, id).ok, false);
  assert.equal(normalizeMemoLinkCommand(create, "").ok, false);
  const normalized = normalizeMemoLinkCommand(create, id);
  assert.equal(normalized.params.p_title, "초안 작성");
  assert.equal(normalized.params.p_due_at, "2026-09-09T14:59:00.000Z");
});
test("linking an existing task does not require new-task fields", () => {
  const normalized = normalizeMemoLinkCommand(
    { action: "link", sourceKind: "work_order", sourceId: id, taskId: id },
    id,
  );
  assert.equal(normalized.ok, true);
  assert.equal(normalized.params.p_task_id, id);
  assert.equal(normalized.params.p_project_id, null);
});
test("RPC failure and uncertain responses never report saved", async () => {
  assert.equal(
    (
      await executeMemoLinkCommand(create, id, async () => ({
        ok: false,
        error: "missing-config",
      }))
    ).status,
    "preview",
  );
  assert.equal(
    (
      await executeMemoLinkCommand(create, id, async () => ({
        ok: false,
        error: "db-failed",
      }))
    ).status,
    "error",
  );
  assert.equal(
    (
      await executeMemoLinkCommand(create, id, async () => ({
        ok: true,
        data: null,
      }))
    ).status,
    "error",
  );
  assert.equal(
    (
      await executeMemoLinkCommand(create, id, async (name) => {
        assert.equal(name, "link_memo_task_v1");
        return { ok: true, data: { status: "duplicate", taskId: id } };
      })
    ).status,
    "duplicate",
  );
});
