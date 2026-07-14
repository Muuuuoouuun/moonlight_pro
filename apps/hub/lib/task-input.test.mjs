import assert from "node:assert/strict";
import { test } from "node:test";

let taskInput = null;

try {
  taskInput = await import("./task-input.js");
} catch {
  // First red run: the task write contract does not exist yet.
}

test("task input module exists", () => {
  assert.ok(taskInput, "task-input.js must exist");
});

test("normalizes a minimal MCP task into the shared task ledger shape", () => {
  assert.deepEqual(
    taskInput.normalizeTaskInput(
      {
        title: "  후속 미팅 준비  ",
        projectId: "33333333-3333-3333-3333-333333333333",
        dueAt: "2026-07-16T09:00:00+09:00",
        source: "mcp",
      },
      "11111111-1111-1111-1111-111111111111",
    ),
    {
      ok: true,
      record: {
        workspace_id: "11111111-1111-1111-1111-111111111111",
        project_id: "33333333-3333-3333-3333-333333333333",
        area_id: null,
        title: "후속 미팅 준비",
        status: "todo",
        priority: "medium",
        next_action: null,
        due_at: "2026-07-16T00:00:00.000Z",
        meta: { source: "mcp" },
      },
    },
  );
});

test("rejects missing workspace and title", () => {
  assert.deepEqual(taskInput.normalizeTaskInput({ title: "Task" }, ""), {
    ok: false,
    reason: "missing-workspace",
  });
  assert.deepEqual(taskInput.normalizeTaskInput({ title: "  " }, "workspace"), {
    ok: false,
    reason: "missing-title",
  });
});

test("rejects unsupported task state and invalid due dates", () => {
  assert.deepEqual(
    taskInput.normalizeTaskInput({ title: "Task", status: "approved" }, "workspace"),
    { ok: false, reason: "invalid-status" },
  );
  assert.deepEqual(
    taskInput.normalizeTaskInput({ title: "Task", dueAt: "tomorrow-ish" }, "workspace"),
    { ok: false, reason: "invalid-due-at" },
  );
});
