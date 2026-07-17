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

test("builds a project draft with an empty title and a stable client id", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const draft = pmsUi.buildProjectDraft({
    clientId,
    contextBrand: { id: "brand-1", key: "classmoon" },
  });

  assert.deepEqual(draft, {
    kind: "project",
    isNew: true,
    clientId,
    title: "",
    brandId: "brand-1",
    brandKey: "classmoon",
    summary: "",
    status: "draft",
    priority: "medium",
    nextAction: "",
    dueAt: "",
  });
  assert.equal("progress" in draft, false, "create drafts must not invent manual progress");
});

test("seeds a project container only from an explicit container context", () => {
  const globalDraft = pmsUi.buildProjectDraft({
    clientId: "11111111-1111-4111-8111-111111111111",
  });
  const contextualDraft = pmsUi.buildProjectDraft({
    clientId: "22222222-2222-4222-8222-222222222222",
    contextBrand: { id: "brand-2", key: "sinabro" },
  });

  assert.equal(globalDraft.brandId, null, "global entry must not silently choose a container");
  assert.equal(globalDraft.brandKey, "all");
  assert.equal(contextualDraft.brandId, "brand-2");
  assert.equal(contextualDraft.brandKey, "sinabro");
});

test("validates the required project title and save location", () => {
  assert.deepEqual(
    pmsUi.validateProjectDraft({ title: "  ", brandId: null }),
    {
      title: "프로젝트명을 입력하세요.",
      brandId: "프로젝트를 둘 위치를 선택하세요.",
    },
  );
  assert.deepEqual(
    pmsUi.validateProjectDraft({ title: "운영 OS", brandId: "brand-1" }),
    {},
  );
});

test("builds an edit draft from raw project fields and preserves its concurrency token", () => {
  const project = {
    id: "project-1",
    name: "원본 프로젝트",
    brand: "classmoon",
    brandId: "brand-1",
    statusKey: "blocked",
    priority: "high",
    projectSummary: null,
    projectNextAction: "원본 다음 행동",
    dueAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-17T03:04:05.000Z",
    displaySummary: "최신 업데이트 fallback",
    displayNextAction: "표시 전용 다음 행동",
    summary: "레거시 표시 fallback",
    nextAction: "레거시 표시 다음 행동",
    progress: 76,
  };

  assert.deepEqual(pmsUi.buildProjectEditDraft(project), {
    kind: "project",
    isNew: false,
    id: "project-1",
    title: "원본 프로젝트",
    brandId: "brand-1",
    brandKey: "classmoon",
    summary: "",
    status: "blocked",
    priority: "high",
    nextAction: "원본 다음 행동",
    dueAt: "2026-07-30",
    updatedAt: "2026-07-17T03:04:05.000Z",
  });
});

test("builds a dirty-only project patch without materializing display fallbacks", () => {
  const source = {
    id: "project-1",
    name: "원본 프로젝트",
    brand: "classmoon",
    brandId: "brand-1",
    statusKey: "blocked",
    priority: "high",
    projectSummary: null,
    projectNextAction: null,
    dueAt: null,
    updatedAt: "2026-07-17T03:04:05.000Z",
    displaySummary: "최신 업데이트 fallback",
    displayNextAction: "표시 전용 다음 행동",
    summary: "레거시 표시 fallback",
    nextAction: "레거시 표시 다음 행동",
    progress: 76,
  };
  const unchanged = pmsUi.buildProjectEditDraft(source);

  assert.deepEqual(pmsUi.buildProjectPatch(source, unchanged), {
    id: "project-1",
    expectedUpdatedAt: "2026-07-17T03:04:05.000Z",
  });
  assert.deepEqual(
    pmsUi.buildProjectPatch(source, {
      ...unchanged,
      summary: "직접 입력한 목표",
      nextAction: "직접 입력한 다음 행동",
      priority: "critical",
    }),
    {
      id: "project-1",
      expectedUpdatedAt: "2026-07-17T03:04:05.000Z",
      summary: "직접 입력한 목표",
      priority: "critical",
      nextAction: "직접 입력한 다음 행동",
    },
  );
});

test("merges the durable project selection into the canonical list query", () => {
  const params = pmsUi.mergeProjectDetailQuery(
    "scope=personal&view=timeline&project=old&new=project&keep=yes",
    "project-durable",
  );

  assert.equal(params.get("scope"), "personal");
  assert.equal(params.get("keep"), "yes");
  assert.equal(params.get("project"), "project-durable");
  assert.equal(params.has("view"), false, "the list/tree view is the canonical query-less view");
  assert.equal(params.has("new"), false);
});

test("builds a minimal task draft from the current project context", () => {
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

test("derives project progress from task checklist evidence before reported values", () => {
  assert.deepEqual(
    pmsUi.buildProjectProgress({
      tasks: { done: 3, total: 4 },
      reportedProgress: 92,
    }),
    {
      value: 75,
      source: "tasks",
      label: "체크리스트 진척",
      done: 3,
      total: 4,
      partial: false,
    },
  );
});

test("labels reported project progress when no task evidence exists", () => {
  assert.deepEqual(
    pmsUi.buildProjectProgress({
      tasks: { done: 0, total: 0 },
      reportedProgress: 42,
    }),
    {
      value: 42,
      source: "reported",
      label: "보고된 진척",
      done: null,
      total: null,
      partial: false,
    },
  );
});

test("returns null when a project has no progress evidence", () => {
  assert.equal(
    pmsUi.buildProjectProgress({
      tasks: { done: 0, total: 0 },
      reportedProgress: null,
    }),
    null,
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
