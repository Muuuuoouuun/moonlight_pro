import assert from "node:assert/strict";
import { test } from "node:test";

let taskToday = null;

try {
  taskToday = await import("./task-today.js");
} catch {
  // Red phase: the task-only Today adapter does not exist yet.
}

test("builds task-only Today lanes without completed or future backlog tasks", () => {
  assert.ok(taskToday, "task-today.js must exist");

  const result = taskToday.buildTaskToday([
    { id: "done", title: "완료", status: "done", dueAt: "2026-07-15", priority: "high" },
    { id: "missed", title: "놓침", status: "todo", dueAt: "2026-07-14", priority: "low" },
    { id: "today", title: "오늘", status: "todo", dueAt: "2026-07-15", priority: "high" },
    { id: "doing", title: "진행 중", status: "doing", dueAt: "", priority: "med" },
    { id: "waiting", title: "대기", status: "blocked", dueAt: "2026-07-20", priority: "high" },
    { id: "inbox", title: "빠른 입력", status: "inbox", dueAt: "", priority: "med", updatedAt: "2026-07-15T00:10:00Z" },
    { id: "future", title: "미래 계획", status: "todo", dueAt: "2026-07-20", priority: "high" },
  ], {
    now: new Date("2026-07-15T00:00:00Z"),
    timeZone: "Asia/Seoul",
  });

  assert.deepEqual(result.items.map(({ id, lane }) => ({ id, lane })), [
    { id: "missed", lane: "missed" },
    { id: "today", lane: "today" },
    { id: "doing", lane: "today" },
    { id: "waiting", lane: "waiting" },
    { id: "inbox", lane: "inbox" },
  ]);
  assert.deepEqual(result.counts, {
    total: 5,
    shown: 5,
    missed: 1,
    today: 2,
    waiting: 1,
    inbox: 1,
  });
  assert.equal(result.hiddenCount, 0);
});

test("keeps the newest quick captures first and reports capped rows", () => {
  assert.ok(taskToday, "task-today.js must exist");

  const result = taskToday.buildTaskToday([
    { id: "older", title: "먼저 입력", status: "inbox", priority: "medium", updatedAt: "2026-07-15T00:00:00Z" },
    { id: "newer", title: "나중 입력", status: "inbox", priority: "medium", updatedAt: "2026-07-15T00:05:00Z" },
  ], {
    now: new Date("2026-07-15T00:00:00Z"),
    timeZone: "Asia/Seoul",
    limit: 1,
  });

  assert.deepEqual(result.items.map((item) => item.id), ["newer"]);
  assert.equal(result.counts.total, 2);
  assert.equal(result.counts.shown, 1);
  assert.equal(result.hiddenCount, 1);
});

test("accepts only durable task completion responses", () => {
  assert.ok(taskToday, "task-today.js must exist");
  assert.equal(taskToday.isDurableTaskUpdateResult({ status: "saved" }), true);
  assert.equal(taskToday.isDurableTaskUpdateResult({ status: "duplicate" }), false);
  assert.equal(taskToday.isDurableTaskUpdateResult({ status: "preview" }), false);
  assert.equal(taskToday.isDurableTaskUpdateResult({ status: "error" }), false);
});
