import assert from "node:assert/strict";
import { test } from "node:test";

let pmsUi = null;

try {
  pmsUi = await import("./pms-ui.js");
} catch {
  // Red phase: Projects has no shared UI-to-ledger status contract yet.
}

test("maps the five task board columns to durable task statuses", () => {
  assert.ok(pmsUi, "pms-ui.js must exist");
  assert.deepEqual(
    ["backlog", "today", "doing", "blocked", "done"].map(pmsUi.taskStatusForBoardColumn),
    ["inbox", "todo", "doing", "blocked", "done"],
  );
  assert.equal(pmsUi.taskStatusForBoardColumn("unknown"), null);
});

test("builds minimal project and task drafts from the current workspace context", () => {
  assert.deepEqual(
    pmsUi.buildProjectDraft({
      brandId: "brand-1",
      brandKey: "classmoon",
      initialStatus: "Blocked",
    }),
    {
      kind: "project",
      isNew: true,
      title: "새 프로젝트",
      brandId: "brand-1",
      brandKey: "classmoon",
      summary: "",
      status: "blocked",
      priority: "medium",
      progress: 0,
      nextAction: "",
      dueAt: "",
    },
  );
  assert.deepEqual(
    pmsUi.buildTaskDraft({ projectId: "project-1", initialStatus: "doing" }),
    {
      kind: "task",
      isNew: true,
      title: "새 할 일",
      projectId: "project-1",
      status: "doing",
      priority: "medium",
      dueAt: "",
    },
  );
});

test("builds a task-only board from the five durable task statuses", () => {
  const projects = [
    { id: "project-1", name: "운영 OS", tag: "personal" },
  ];
  const todos = [
    { id: "task-inbox", project: "project-1", title: "수집", status: "inbox", priority: "med", due: "7.15" },
    { id: "task-todo", project: "project-1", title: "계획", status: "todo", priority: "high", due: "7.16" },
    { id: "task-doing", project: "project-1", title: "진행", status: "doing", priority: "low", due: "7.17" },
    { id: "task-blocked", project: "project-1", title: "대기", status: "blocked", priority: "med", due: "7.18" },
    { id: "task-done", project: "project-1", title: "완료", status: "done", priority: "med", due: "7.19" },
  ];

  const columns = pmsUi.buildTaskBoardColumns(todos, projects);

  assert.deepEqual(columns.map(({ key, label }) => ({ key, label })), [
    { key: "backlog", label: "수집" },
    { key: "today", label: "계획" },
    { key: "doing", label: "진행" },
    { key: "blocked", label: "대기" },
    { key: "done", label: "완료" },
  ]);
  assert.deepEqual(columns.map((column) => column.cards.map((card) => card.id)), [
    ["task-inbox"],
    ["task-todo"],
    ["task-doing"],
    ["task-blocked"],
    ["task-done"],
  ]);
  assert.equal(columns[0].cards[0].project, "운영 OS");
  assert.equal(columns[0].cards[0].tag, "personal");
});

test("creates a valid client id even when browser crypto is unavailable", () => {
  const nativeId = "99999999-9999-4999-8999-999999999999";
  assert.equal(
    pmsUi.createClientId({ cryptoImpl: { randomUUID: () => nativeId } }),
    nativeId,
  );
  assert.equal(
    pmsUi.createClientId({ cryptoImpl: null, random: () => 0 }),
    "00000000-0000-4000-8000-000000000000",
  );
});

test("splits projects into a dated timeline axis and an undated tail", () => {
  const today = new Date("2026-07-17T00:00:00Z");
  const projects = [
    { id: "p-dated", name: "마감 있음", createdAt: "2026-07-10T00:00:00Z", dueAt: "2026-07-20T00:00:00Z" },
    { id: "p-undated", name: "마감 없음", createdAt: "2026-07-01T00:00:00Z", dueAt: "" },
  ];

  const timeline = pmsUi.buildProjectTimeline(projects, { today });

  assert.equal(timeline.items.length, 1);
  assert.equal(timeline.items[0].project.id, "p-dated");
  assert.equal(timeline.items[0].overdue, false);
  assert.deepEqual(timeline.undated.map((p) => p.id), ["p-undated"]);
  assert.ok(timeline.items[0].startPct >= 0 && timeline.items[0].startPct <= 100);
  assert.ok(timeline.items[0].widthPct > 0);
  assert.ok(timeline.todayPct >= 0 && timeline.todayPct <= 100);
});

test("flags a due date before today as overdue and clips a start far outside the lookback window", () => {
  const today = new Date("2026-07-17T00:00:00Z");
  const projects = [
    { id: "p-overdue", name: "지남", createdAt: "2026-07-01T00:00:00Z", dueAt: "2026-07-10T00:00:00Z" },
    { id: "p-old", name: "오래된 프로젝트", createdAt: "2025-01-01T00:00:00Z", dueAt: "2026-07-25T00:00:00Z" },
  ];

  const timeline = pmsUi.buildProjectTimeline(projects, { today, lookbackDays: 30 });

  const overdue = timeline.items.find((item) => item.project.id === "p-overdue");
  const old = timeline.items.find((item) => item.project.id === "p-old");
  assert.equal(overdue.overdue, true);
  assert.equal(old.clippedStart, true);
  assert.ok(old.startPct === 0, "clipped bar starts at the window's left edge");
});

test("returns an empty axis with all projects in the undated tail when no project has a due date", () => {
  const timeline = pmsUi.buildProjectTimeline([
    { id: "p-1", name: "미정 1", createdAt: "2026-07-01T00:00:00Z", dueAt: "" },
  ], { today: new Date("2026-07-17T00:00:00Z") });

  assert.deepEqual(timeline.items, []);
  assert.equal(timeline.totalDays, 0);
  assert.equal(timeline.undated.length, 1);
});
