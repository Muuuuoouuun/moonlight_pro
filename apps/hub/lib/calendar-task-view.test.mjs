import assert from "node:assert/strict";
import { test } from "node:test";

import { calendarDateKey, mapTasksToCalendar } from "./calendar-task-view.js";

test("calendar date keys preserve task due dates and local Date values", () => {
  assert.equal(calendarDateKey("2026-08-04T00:00:00.000Z"), "2026-08-04");
  assert.equal(calendarDateKey(new Date(2026, 7, 5, 13, 30)), "2026-08-05");
  assert.equal(calendarDateKey("not-a-date"), "");
});

test("calendar tasks map only open dated rows inside the visible period", () => {
  const days = [new Date(2026, 7, 3), new Date(2026, 7, 4), new Date(2026, 7, 5)];
  const mapped = mapTasksToCalendar([
    { id: "a", title: "월요일 작업", dueAt: "2026-08-03", status: "todo", priorityRaw: "high" },
    { id: "b", title: "완료 작업", dueAt: "2026-08-04", status: "done", done: true },
    { id: "c", title: "기한 없음", dueAt: "", status: "todo" },
    { id: "d", title: "범위 밖", dueAt: "2026-08-10", status: "todo" },
  ], days);

  assert.deepEqual(mapped, [{
    id: "a",
    day: 0,
    title: "월요일 작업",
    priority: "high",
    projectId: "",
    dueAt: "2026-08-03",
  }]);
});
