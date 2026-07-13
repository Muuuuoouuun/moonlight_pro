import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTaskLanes,
  resolveTaskLane,
  sortTasksForAttention,
} from "./task-attention.js";

const SEOUL = "Asia/Seoul";
const SEOUL_JULY_14_0030 = new Date("2026-07-13T15:30:00.000Z");

function task(overrides = {}) {
  return {
    id: "task-default",
    title: "후속 연락",
    status: "todo",
    priority: "medium",
    dueAt: null,
    duePrecision: "none",
    createdAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

test("lane precedence separates timed, waiting, today, inbox, excluded, and done tasks", () => {
  assert.equal(resolveTaskLane(task({
    dueAt: "2026-07-13T15:29:59.000Z",
    duePrecision: "timed",
  }), SEOUL_JULY_14_0030, SEOUL), "missed");
  assert.equal(resolveTaskLane(task({
    status: "blocked",
    dueAt: "2026-07-20T00:00:00.000Z",
    duePrecision: "timed",
  }), SEOUL_JULY_14_0030, SEOUL), "waiting");
  assert.equal(resolveTaskLane(task({
    dueAt: "2026-07-14T03:00:00.000Z",
    duePrecision: "timed",
  }), SEOUL_JULY_14_0030, SEOUL), "today");
  assert.equal(resolveTaskLane(task({ status: "inbox" }), SEOUL_JULY_14_0030, SEOUL), "inbox");
  assert.equal(resolveTaskLane(task(), SEOUL_JULY_14_0030, SEOUL), null);
  assert.equal(resolveTaskLane(task({ status: "done" }), SEOUL_JULY_14_0030, SEOUL), null);
});

test("date-only due becomes missed only at the next local midnight", () => {
  const dateOnly = task({
    dueAt: "2026-07-13T15:00:00.000Z",
    duePrecision: "date",
  });

  assert.equal(
    resolveTaskLane(dateOnly, new Date("2026-07-14T14:59:59.999Z"), SEOUL),
    "today",
  );
  assert.equal(
    resolveTaskLane(dateOnly, new Date("2026-07-14T15:00:00.000Z"), SEOUL),
    "missed",
  );
});

test("invalid workspace timezone falls back to Asia/Seoul", () => {
  const dateOnly = task({
    dueAt: "2026-07-13T15:00:00.000Z",
    duePrecision: "date",
  });

  assert.equal(
    resolveTaskLane(dateOnly, new Date("2026-07-14T15:00:00.000Z"), "not/a-zone"),
    "missed",
  );
});

test("attention sort is deterministic by lane, priority, due, created, then id", () => {
  const tasks = [
    task({ id: "inbox", status: "inbox", priority: "critical" }),
    task({ id: "today-low", priority: "low", dueAt: "2026-07-14T04:00:00.000Z", duePrecision: "timed" }),
    task({ id: "missed-high", priority: "high", dueAt: "2026-07-13T14:00:00.000Z", duePrecision: "timed" }),
    task({ id: "missed-critical-new", priority: "critical", dueAt: "2026-07-13T14:00:00.000Z", duePrecision: "timed", createdAt: "2026-07-11T00:00:00.000Z" }),
    task({ id: "missed-critical-old-b", priority: "critical", dueAt: "2026-07-13T14:00:00.000Z", duePrecision: "timed", createdAt: "2026-07-09T00:00:00.000Z" }),
    task({ id: "missed-critical-old-a", priority: "critical", dueAt: "2026-07-13T14:00:00.000Z", duePrecision: "timed", createdAt: "2026-07-09T00:00:00.000Z" }),
    task({ id: "waiting", status: "doing", priority: "medium" }),
    task({ id: "excluded", status: "todo", priority: "critical" }),
  ];

  assert.deepEqual(
    sortTasksForAttention(tasks, SEOUL_JULY_14_0030, SEOUL).map((item) => item.id),
    [
      "missed-critical-old-a",
      "missed-critical-old-b",
      "missed-critical-new",
      "missed-high",
      "today-low",
      "waiting",
      "inbox",
    ],
  );

  const lanes = buildTaskLanes(tasks, SEOUL_JULY_14_0030, SEOUL);
  assert.deepEqual(Object.keys(lanes), ["missed", "today", "waiting", "inbox"]);
  assert.deepEqual(lanes.missed.map((item) => item.id), [
    "missed-critical-old-a",
    "missed-critical-old-b",
    "missed-critical-new",
    "missed-high",
  ]);
});
