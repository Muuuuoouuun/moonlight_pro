import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoIntake, prepareMemoIntakeTasks, memoIntakeTaskSummary, saveMemoIntakeTasks, restoreMemoIntake } from "./memo-intake-tasks.js";
import { normalizePmsCommand } from "../../engine/lib/pms-command.ts";

const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
function preparedIntake(count = 1) {
  const data = { title: "추출", summary: "요약", transcription: "원문", keyDecisions: [], suggestedTags: [], actionItems: Array.from({ length: count }, (_, index) => ({ task: `검토 ${index}`, priority: "medium", suggestedDue: "2026-09-23" })) };
  return prepareMemoIntakeTasks(createMemoIntake(data), { id: crypto.randomUUID(), title: "원문" });
}

test("task commands use the real PMS dueAt contract and stable task identities", () => {
  const intake = preparedIntake();
  const command = intake.actions[0].command;
  const actual = normalizePmsCommand({ ...command, action: "create_task" }, { workspaceId: crypto.randomUUID(), ownerId: crypto.randomUUID() });
  assert.equal(actual.ok, true);
  assert.equal(actual.record.due_at, "2026-09-23T00:00:00.000Z");
  assert.equal(actual.record.status, "todo");
  assert.deepEqual(prepareMemoIntakeTasks(intake, { id: intake.memoId, title: "이후 제목" }).actions[0].command, command);
});

test("preview, errors, bare 2xx and mismatched receipts are never counted as saved", async () => {
  for (const mode of ["preview", "error", "bare", "wrong-id", "not-persisted"]) {
    const intake = preparedIntake();
    const completed = await saveMemoIntakeTasks(intake, async () => {
      if (mode === "preview") return response({ status: "preview" }, 202);
      if (mode === "error") return response({ status: "error" });
      if (mode === "bare") return response({});
      return response({ status: "saved", persisted: mode === "not-persisted" ? false : true, task: { id: mode === "wrong-id" ? crypto.randomUUID() : intake.actions[0].id } });
    });
    assert.deepEqual(memoIntakeTaskSummary(completed), { total: 1, saved: 0, remaining: 1 });
    assert.equal(completed.actions[0].selected, true);
    assert.deepEqual(completed.actions[0].command, intake.actions[0].command);
  }
});

test("partial failure persists unknown before POST and replays only unresolved tasks after restore", async () => {
  const intake = preparedIntake(3);
  intake.actions[2].selected = false;
  const sent = [], progress = [];
  const failed = await saveMemoIntakeTasks(intake, async (_url, options) => {
    const command = JSON.parse(options.body);
    sent.push(command);
    assert.equal(progress.at(-1).actions.find((item) => item.id === command.id).status, "unknown");
    if (command.id === intake.actions[1].id) throw new TypeError("response lost after persistence");
    return response({ status: "saved", task: { id: command.id } }, 201);
  }, (snapshot) => progress.push(structuredClone(snapshot)));
  assert.deepEqual(memoIntakeTaskSummary(failed), { total: 2, saved: 1, remaining: 1 });
  assert.equal(failed.actions[1].status, "unknown");
  assert.equal(failed.actions[2].selected, false);
  const restored = restoreMemoIntake(JSON.parse(JSON.stringify(failed)));
  const retried = await saveMemoIntakeTasks(restored, async (_url, options) => {
    const command = JSON.parse(options.body);
    assert.deepEqual(command, sent[1]);
    sent.push(command);
    return response({ status: "duplicate", entity: { id: command.id } });
  });
  assert.equal(sent.length, 3);
  assert.deepEqual(memoIntakeTaskSummary(retried), { total: 2, saved: 2, remaining: 0 });
});
