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
    areaId: "area-1",
    contextBrand: { id: "brand-1", key: "classmoon" },
    orgScope: "classin",
  });

  assert.deepEqual(draft, {
    kind: "project",
    isNew: true,
    clientId,
    title: "",
    areaId: "area-1",
    brandId: "brand-1",
    brandKey: "classmoon",
    entityKey: "",
    summary: "",
    status: "draft",
    priority: "medium",
    nextAction: "",
    dueAt: "",
    orgScope: "classin",
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

test("validates the required project title and flat area while brand stays optional", () => {
  assert.deepEqual(
    pmsUi.validateProjectDraft({ title: "  ", areaId: null, brandId: null }),
    {
      title: "프로젝트명을 입력하세요.",
      areaId: "업무 분야를 선택하세요.",
    },
  );
  assert.deepEqual(
    pmsUi.validateProjectDraft({ title: "운영 OS", areaId: "area-1", brandId: null }),
    {},
  );
});

test("builds a typed project create payload without inventing progress", () => {
  const payload = pmsUi.buildProjectCreatePayload({
    clientId: "11111111-1111-4111-8111-111111111111",
    title: "갈무리 첫결제 SW",
    areaId: "area-1",
    brandId: "",
    entityKey: "lead:lead-1",
    summary: "첫 결제 완료",
    status: "draft",
    priority: "medium",
    nextAction: "결제 링크 발송",
    dueAt: "",
    orgScope: "classin",
  });

  assert.deepEqual(payload.entityRef, { type: "lead", id: "lead-1" });
  assert.equal(payload.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(payload.brandId, null);
  assert.equal("progress" in payload, false);
});

test("selects only canonical project areas and resolves the immutable creation scope", () => {
  const areas = [
    { id: "legacy", slug: "legacy", canonical: false },
    { id: "sales", slug: "sales", canonical: true },
    { id: "content", slug: "content", canonical: true },
  ];

  assert.equal(pmsUi.selectProjectAreaId(areas), "sales");
  assert.equal(pmsUi.selectProjectAreaId(areas, "content"), "content");
  assert.equal(pmsUi.resolveProjectDraftOrgScope({ workspace: "classin" }), "classin");
  assert.equal(pmsUi.resolveProjectDraftOrgScope({
    workspace: "brand",
    brandOrgScope: "classin",
    preferBrandScope: true,
  }), "classin");
});

test("builds an edit draft from raw project fields and preserves its concurrency token", () => {
  const project = {
    id: "project-1",
    name: "원본 프로젝트",
    brand: "classmoon",
    brandId: "brand-1",
    areaId: "area-1",
    entityRef: { type: "lead", id: "lead-1" },
    orgScope: "classin",
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
    areaId: "area-1",
    brandId: "brand-1",
    brandKey: "classmoon",
    entityKey: "lead:lead-1",
    orgScope: "classin",
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

test("only confirms create after the reloaded ledger contains the durable project id", () => {
  const durableId = "project-durable";

  assert.equal(
    pmsUi.projectReloadContains(
      { ok: true, projects: [{ id: durableId }] },
      durableId,
    ),
    true,
  );
  assert.equal(
    pmsUi.projectReloadContains(
      { ok: false, projects: [{ id: durableId }] },
      durableId,
    ),
    false,
    "a failed reload must never close the draft",
  );
  assert.equal(
    pmsUi.projectReloadContains(
      { ok: true, projects: [{ id: "another-project" }] },
      durableId,
    ),
    false,
    "stale React state or an unrelated row cannot confirm persistence",
  );
});

test("builds four stable valid task ids for a content pipeline", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const seeds = pmsUi.buildContentPipelineTaskSeeds(projectId);
  const repeated = pmsUi.buildContentPipelineTaskSeeds(projectId);
  const anotherProject = pmsUi.buildContentPipelineTaskSeeds(
    "22222222-2222-4222-8222-222222222222",
  );
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  assert.deepEqual(seeds.map((seed) => seed.title), ["기획", "초안", "검토", "업로드"]);
  assert.equal(new Set(seeds.map((seed) => seed.id)).size, 4);
  assert.ok(seeds.every((seed) => uuidPattern.test(seed.id)));
  assert.deepEqual(repeated, seeds, "a project retry must reuse the same four task ids");
  assert.notDeepEqual(
    anotherProject.map((seed) => seed.id),
    seeds.map((seed) => seed.id),
  );
});

test("confirms a content pipeline only when every deterministic task is reloaded", () => {
  const ids = pmsUi.buildContentPipelineTaskSeeds(
    "11111111-1111-4111-8111-111111111111",
  ).map((seed) => seed.id);

  assert.equal(
    pmsUi.contentPipelineReloadContains(
      { ok: true, todos: ids.map((id) => ({ id })) },
      ids,
    ),
    true,
  );
  assert.equal(
    pmsUi.contentPipelineReloadContains(
      { ok: true, todos: ids.slice(0, 3).map((id) => ({ id })) },
      ids,
    ),
    false,
  );
  assert.equal(
    pmsUi.contentPipelineReloadContains(
      { ok: false, todos: ids.map((id) => ({ id })) },
      ids,
    ),
    false,
  );
});

test("rebases stale edit state while preserving only user-dirty fields", () => {
  const source = {
    id: "project-1",
    name: "Old server title",
    brand: "classmoon",
    brandId: "brand-old",
    areaId: "area-1",
    entityRef: { type: "customer_account", id: "account-1" },
    orgScope: "classin",
    statusKey: "active",
    priority: "medium",
    projectSummary: "Old server goal",
    projectNextAction: "Old server action",
    dueAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-17T01:00:00.000Z",
    displaySummary: "Keep display context",
  };
  const currentRow = {
    id: "project-1",
    name: "Current server title",
    brand_id: "brand-current",
    summary: "Current server goal",
    status: "blocked",
    priority: "high",
    next_action: "Current server action",
    due_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-17T02:00:00.000Z",
  };
  const operatorDraft = {
    ...pmsUi.buildProjectEditDraft(source),
    title: "Operator title",
    summary: "Operator goal",
    nextAction: "Operator action",
  };

  const rebased = pmsUi.rebaseProjectEditState(source, operatorDraft, currentRow);

  assert.deepEqual(rebased.source, {
    ...source,
    name: "Current server title",
    brandId: "brand-current",
    projectSummary: "Current server goal",
    statusKey: "blocked",
    priority: "high",
    projectNextAction: "Current server action",
    dueAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-17T02:00:00.000Z",
  });
  assert.deepEqual(rebased.draft, {
    kind: "project",
    isNew: false,
    id: "project-1",
    title: "Operator title",
    areaId: "area-1",
    brandId: "brand-current",
    brandKey: "classmoon",
    entityKey: "customer_account:account-1",
    orgScope: "classin",
    summary: "Operator goal",
    status: "blocked",
    priority: "high",
    nextAction: "Operator action",
    dueAt: "2026-07-31",
    updatedAt: "2026-07-17T02:00:00.000Z",
  });
  assert.deepEqual(pmsUi.buildProjectPatch(rebased.source, rebased.draft), {
    id: "project-1",
    expectedUpdatedAt: "2026-07-17T02:00:00.000Z",
    title: "Operator title",
    summary: "Operator goal",
    nextAction: "Operator action",
  });
});

test("rotates only the project client id for conflict recovery", () => {
  const draft = pmsUi.buildProjectDraft({
    clientId: "11111111-1111-4111-8111-111111111111",
    contextBrand: { id: "brand-1", key: "classmoon" },
  });
  const filled = {
    ...draft,
    title: "운영 OS",
    summary: "정본을 만든다",
    nextAction: "첫 원장 확인",
    status: "active",
    priority: "high",
    dueAt: "2026-07-31",
  };

  assert.deepEqual(
    pmsUi.rotateProjectClientId(filled, {
      clientId: "22222222-2222-4222-8222-222222222222",
    }),
    {
      ...filled,
      clientId: "22222222-2222-4222-8222-222222222222",
    },
  );
});

test("plain N opens global project create only outside editable targets and drawers", () => {
  const plainN = { key: "n", target: { tagName: "DIV" } };

  assert.equal(pmsUi.shouldOpenGlobalProjectCreate(plainN), true);
  assert.equal(
    pmsUi.shouldOpenGlobalProjectCreate({ ...plainN, target: { tagName: "INPUT" } }),
    false,
  );
  assert.equal(
    pmsUi.shouldOpenGlobalProjectCreate({ ...plainN, target: { tagName: "TEXTAREA" } }),
    false,
  );
  assert.equal(
    pmsUi.shouldOpenGlobalProjectCreate({ ...plainN, target: { isContentEditable: true } }),
    false,
  );
  assert.equal(pmsUi.shouldOpenGlobalProjectCreate({ ...plainN, metaKey: true }), false);
  assert.equal(
    pmsUi.shouldOpenGlobalProjectCreate(plainN, { drawerOpen: true }),
    false,
  );
});

test("project create feedback translates invalid references and hides unknown internal codes", () => {
  assert.deepEqual(pmsUi.projectCreateFeedback({
    status: "invalid-input",
    error: "invalid-reference",
  }), {
    state: "error",
    message: "연결 항목을 다시 선택하세요.",
  });
  assert.deepEqual(pmsUi.projectCreateFeedback({
    status: "error",
    error: "internal-ledger-code-947",
  }), {
    state: "error",
    message: "프로젝트를 만들지 못했습니다. 다시 시도하세요.",
  });
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
      description: "",
    },
  );
});

test("builds a task edit draft from an existing todo, preferring the unlossy priority", () => {
  assert.deepEqual(
    pmsUi.buildTaskEditDraft({
      id: "task-1",
      title: "Draft the newsletter",
      project: "project-1",
      status: "doing",
      priority: "high", // lossy board-dot value — collapsed from "critical"
      priorityRaw: "critical",
      dueAt: "2026-07-20T00:00:00.000Z",
      description: "Pull last week's numbers first.",
    }),
    {
      kind: "task",
      isNew: false,
      id: "task-1",
      title: "Draft the newsletter",
      projectId: "project-1",
      status: "doing",
      priority: "critical",
      dueAt: "2026-07-20",
      description: "Pull last week's numbers first.",
    },
  );
});

test("task patch only carries fields that changed from the edit source", () => {
  const source = {
    id: "task-1",
    title: "Draft the newsletter",
    project: "project-1",
    status: "doing",
    priorityRaw: "high",
    dueAt: "2026-07-20T00:00:00.000Z",
    description: "",
  };
  const draft = { ...pmsUi.buildTaskEditDraft(source), description: "Add a link to the deck." };

  assert.deepEqual(pmsUi.buildTaskPatch(source, draft), {
    id: "task-1",
    description: "Add a link to the deck.",
  });
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

test("uses a real project start and due date as a timeline range", () => {
  const today = new Date("2026-07-17T00:00:00Z");
  const projects = [
    {
      id: "p-dated",
      name: "마감 있음",
      createdAt: "2025-01-01T00:00:00Z",
      startedAt: "2026-07-10T00:00:00Z",
      dueAt: "2026-07-20T00:00:00Z",
    },
    { id: "p-undated", name: "마감 없음", createdAt: "2026-07-01T00:00:00Z", dueAt: "" },
  ];

  const timeline = pmsUi.buildProjectTimeline(projects, { today });

  assert.equal(timeline.items.length, 1);
  assert.equal(timeline.items[0].project.id, "p-dated");
  assert.equal(timeline.items[0].kind, "range");
  assert.equal(timeline.items[0].overdue, false);
  assert.deepEqual(timeline.undated.map((p) => p.id), ["p-undated"]);
  assert.ok(timeline.items[0].startPct >= 0 && timeline.items[0].startPct <= 100);
  assert.ok(timeline.items[0].widthPct > 0);
  assert.ok(timeline.todayPct >= 0 && timeline.todayPct <= 100);
});

test("renders due-only and invalid-start projects as honest deadline markers", () => {
  const today = new Date("2026-07-17T00:00:00Z");
  const projects = [
    {
      id: "p-overdue",
      name: "지남",
      createdAt: "2026-01-01T00:00:00Z",
      dueAt: "2026-07-10T00:00:00Z",
    },
    {
      id: "p-invalid",
      name: "시작이 마감 뒤",
      createdAt: "2025-01-01T00:00:00Z",
      startedAt: "2026-08-01T00:00:00Z",
      dueAt: "2026-07-25T00:00:00Z",
    },
  ];

  const timeline = pmsUi.buildProjectTimeline(projects, { today, lookbackDays: 30 });

  const overdue = timeline.items.find((item) => item.project.id === "p-overdue");
  const invalid = timeline.items.find((item) => item.project.id === "p-invalid");
  assert.equal(overdue.overdue, true);
  assert.equal(overdue.kind, "marker");
  assert.equal(invalid.kind, "marker");
  assert.equal("widthPct" in overdue, false, "a deadline marker must not masquerade as a bar");
  assert.ok(Number.isFinite(overdue.markerPct));
  assert.ok(Number.isFinite(invalid.markerPct));
});

test("never accepts createdAt as planned timeline evidence", () => {
  const today = new Date("2026-07-17T00:00:00Z");
  const timeline = pmsUi.buildProjectTimeline([
    {
      id: "p-created-only",
      name: "생성일만 있는 프로젝트",
      createdAt: "2020-01-01T00:00:00Z",
      dueAt: "2026-07-25T00:00:00Z",
    },
  ], { today, lookbackDays: 30 });

  assert.equal(timeline.items[0].kind, "marker");
  assert.equal(timeline.items[0].clippedStart, false);
  assert.equal(
    timeline.windowStart.getTime(),
    timeline.today.getTime(),
    "the ancient createdAt must not pull the evidence window backward",
  );
});

test("returns an empty axis with all projects in the undated tail when no project has a due date", () => {
  const timeline = pmsUi.buildProjectTimeline([
    { id: "p-1", name: "미정 1", createdAt: "2026-07-01T00:00:00Z", dueAt: "" },
  ], { today: new Date("2026-07-17T00:00:00Z") });

  assert.deepEqual(timeline.items, []);
  assert.equal(timeline.totalDays, 0);
  assert.equal(timeline.undated.length, 1);
});

test("merges timeline selection into the exact query without dropping foreign keys", () => {
  const params = pmsUi.mergeTimelineProjectQuery(
    "scope=personal&keep=yes&view=board&project=old&task=task-1&new=project",
    "project-2",
  );

  assert.equal(params.get("scope"), "personal");
  assert.equal(params.get("keep"), "yes");
  assert.equal(params.get("view"), "timeline");
  assert.equal(params.get("project"), "project-2");
  assert.equal(params.has("task"), false);
  assert.equal(params.has("new"), false);
});

test("clamps fully future and fully past ranges to coherent timeline geometry", () => {
  const timeline = pmsUi.buildProjectTimeline([
    {
      id: "future",
      name: "축 이후",
      startedAt: "2026-10-01T00:00:00Z",
      dueAt: "2026-10-10T00:00:00Z",
    },
    {
      id: "past",
      name: "축 이전",
      startedAt: "2026-01-01T00:00:00Z",
      dueAt: "2026-02-01T00:00:00Z",
    },
  ], {
    today: new Date("2026-07-17T00:00:00Z"),
    lookbackDays: 30,
    lookaheadDays: 60,
  });

  const future = timeline.items.find((item) => item.project.id === "future");
  const past = timeline.items.find((item) => item.project.id === "past");
  for (const item of [future, past]) {
    assert.ok(item.startPct >= 0 && item.startPct <= 100);
    assert.ok(item.widthPct >= 0 && item.widthPct <= 100);
    assert.ok(item.startPct + item.widthPct <= 100);
    assert.equal(item.clippedStart, true);
    assert.equal(item.clippedEnd, true);
  }
  assert.equal(future.startPct, 100);
  assert.equal(future.widthPct, 0);
  assert.equal(past.startPct, 0);
  assert.equal(past.widthPct, 0);
});

test("builds accessible Timeline labels from real start and due evidence", () => {
  const timeline = pmsUi.buildProjectTimeline([
    {
      id: "range",
      name: "기간 프로젝트",
      startedAt: "2026-07-10T00:00:00Z",
      dueAt: "2026-07-20T00:00:00Z",
    },
    {
      id: "marker",
      name: "마감 프로젝트",
      createdAt: "2020-01-01T00:00:00Z",
      dueAt: "2026-07-25T00:00:00Z",
    },
  ], { today: new Date("2026-07-17T00:00:00Z") });

  const range = timeline.items.find((item) => item.project.id === "range");
  const marker = timeline.items.find((item) => item.project.id === "marker");
  assert.match(pmsUi.buildTimelineItemAriaLabel(range), /기간 프로젝트.*2026-07-10.*2026-07-20/);
  assert.match(pmsUi.buildTimelineItemAriaLabel(marker), /마감 프로젝트.*2026-07-25/);
  assert.doesNotMatch(pmsUi.buildTimelineItemAriaLabel(marker), /2020-01-01/);
});

test("projects Roadmap date-only points align to equal month segments", () => {
  const projection = pmsUi.buildRoadmapProjection({
    projects: [
      { id: "jan-end", name: "1월 말", dueAt: "2028-01-31" },
      { id: "feb-start", name: "2월 시작", dueAt: "2028-02-01" },
      { id: "mar-start", name: "3월 시작", dueAt: "2028-03-01" },
    ],
    milestones: [
      { id: "milestone-mar", projectId: "mar-start", title: "3월 기준점", targetAt: "2028-03-01" },
    ],
  }, { now: new Date(2028, 0, 15) });

  const byId = new Map(projection.items.map((item) => [item.id, item]));
  assert.equal(projection.months.length, 4);
  assert.ok(Math.abs(byId.get("project:jan-end").markerPct - ((30 / 31) * 25)) < 0.0001);
  assert.equal(byId.get("project:feb-start").markerPct, 25);
  assert.equal(byId.get("project:mar-start").markerPct, 50);
  assert.equal(byId.get("milestone:milestone-mar").markerPct, 50);
});

test("Roadmap projection filters by durable project and clips ranges to four equal months", () => {
  const projection = pmsUi.buildRoadmapProjection({
    projects: [
      {
        id: "selected",
        name: "선택 프로젝트",
        startedAt: "2027-12-01",
        dueAt: "2028-06-01",
      },
      { id: "other", name: "다른 프로젝트", dueAt: "2028-02-01" },
    ],
    milestones: [
      { id: "selected-ms", projectId: "selected", title: "선택 목표", targetAt: "2028-03-01" },
      { id: "other-ms", projectId: "other", title: "다른 목표", targetAt: "2028-03-01" },
    ],
  }, {
    now: new Date(2028, 0, 15),
    selectedProjectId: "selected",
  });

  assert.deepEqual(projection.items.map((item) => item.id), [
    "project:selected",
    "milestone:selected-ms",
  ]);
  const range = projection.items[0];
  assert.equal(range.kind, "range");
  assert.equal(range.startPct, 0);
  assert.equal(range.widthPct, 100);
  assert.equal(range.clippedStart, true);
  assert.equal(range.clippedEnd, true);
});

test("builds accessible Roadmap labels for ranges, due points, and milestones", () => {
  const projection = pmsUi.buildRoadmapProjection({
    projects: [
      { id: "range", name: "기간", startedAt: "2028-01-02", dueAt: "2028-02-03" },
      { id: "due", name: "마감", dueAt: "2028-03-04" },
    ],
    milestones: [
      { id: "ms", projectId: "range", title: "목표", targetAt: "2028-04-05" },
    ],
  }, { now: new Date(2028, 0, 15) });
  const byId = new Map(projection.items.map((item) => [item.id, item]));

  assert.match(pmsUi.buildRoadmapItemAriaLabel(byId.get("project:range")), /2028-01-02.*2028-02-03/);
  assert.match(pmsUi.buildRoadmapItemAriaLabel(byId.get("project:due")), /2028-03-04/);
  assert.match(pmsUi.buildRoadmapItemAriaLabel(byId.get("milestone:ms")), /2028-04-05/);
});

test("Roadmap milestone labels distinguish identical titles and dates by project", () => {
  const projection = pmsUi.buildRoadmapProjection({
    projects: [
      { id: "alpha", name: "알파 프로젝트", dueAt: "2028-04-30" },
      { id: "beta", name: "베타 프로젝트", dueAt: "2028-04-30" },
    ],
    milestones: [
      { id: "alpha-launch", projectId: "alpha", title: "출시", targetAt: "2028-04-05" },
      { id: "beta-launch", projectId: "beta", title: "출시", targetAt: "2028-04-05" },
    ],
  }, { now: new Date(2028, 0, 15) });
  const byId = new Map(projection.items.map((item) => [item.id, item]));
  const alpha = byId.get("milestone:alpha-launch");
  const beta = byId.get("milestone:beta-launch");

  assert.equal(alpha.projectName, "알파 프로젝트");
  assert.equal(beta.projectName, "베타 프로젝트");
  assert.equal(
    pmsUi.buildRoadmapItemAriaLabel(alpha),
    "출시 · 알파 프로젝트 · 마일스톤 목표일 · 2028-04-05",
  );
  assert.equal(
    pmsUi.buildRoadmapItemAriaLabel(beta),
    "출시 · 베타 프로젝트 · 마일스톤 목표일 · 2028-04-05",
  );
  assert.notEqual(
    pmsUi.buildRoadmapItemAriaLabel(alpha),
    pmsUi.buildRoadmapItemAriaLabel(beta),
  );
});

// ── PMS 컨테이너 트리 (2026-08-29 브랜드 탭 설계 §4 P0-1) ──────────────────────

const CATEGORIES = [
  { key: "sns-channel", label: "SNS 채널" },
  { key: "ka-deal", label: "KA·딜" },
  { key: "general", label: "일반" },
];

function container(key, extra = {}) {
  return { key, name: key, orgScope: "personal", category: "sns-channel", projects: 0, open: 0, ...extra };
}

test("empty containers leave the tree and are reported as a count, not deleted", () => {
  const tree = pmsUi.buildContainerTree(
    [
      { key: "all", name: "전체 브랜드" },
      container("sinabro"),
      container("gore"),
      container("bridgemaker", { projects: 2 }),
    ],
    { categories: CATEGORIES },
  );

  const keys = tree.groups.flatMap((g) => g.folders.flatMap((f) => f.items.map((b) => b.key)));
  assert.deepEqual(keys, ["bridgemaker"]);
  assert.equal(tree.hiddenCount, 2);
  assert.equal(tree.visibleCount, 1);
});

test("a container with only open tasks still counts as work", () => {
  const tree = pmsUi.buildContainerTree([container("gore", { open: 3 })], { categories: CATEGORIES });

  assert.equal(tree.visibleCount, 1);
  assert.equal(tree.hiddenCount, 0);
});

test("the selected and the not-yet-saved container survive an empty tree", () => {
  const brands = [
    container("sinabro"),
    container("gore"),
    container("just-made", { preview: true }),
  ];

  const tree = pmsUi.buildContainerTree(brands, { categories: CATEGORIES, selectedKey: "sinabro" });
  const keys = tree.groups.flatMap((g) => g.folders.flatMap((f) => f.items.map((b) => b.key)));

  assert.deepEqual(keys.sort(), ["just-made", "sinabro"]);
  assert.equal(tree.hiddenCount, 1);
});

test("showEmpty restores every hidden container into the idle segment", () => {
  const brands = [container("sinabro"), container("gore", { projects: 1 }), container("22nomad")];

  const shown = pmsUi.buildContainerTree(brands, { categories: CATEGORIES, showEmpty: true });
  const keys = shown.groups.flatMap((g) => g.folders.flatMap((f) => f.items.map((b) => b.key)));

  // 진행 우선 정렬이 lib 계약이 되면서(2026-09-01) 복원 순서는 "원래 자리"가 아니라
  // 활성(gore) 다음 휴면 구간이다 — 복원 자체는 전원, hiddenCount 0.
  assert.deepEqual(keys, ["gore", "sinabro", "22nomad"]);
  assert.equal(shown.hiddenCount, 0);
});

test("hiding a folder's last container removes the folder rather than leaving an empty one", () => {
  const tree = pmsUi.buildContainerTree(
    [container("sinabro"), container("우리학원", { category: "ka-deal", projects: 1 })],
    { categories: CATEGORIES },
  );

  const personal = tree.groups.find((g) => g.key === "personal");
  assert.deepEqual(personal.folders.map((f) => f.key), ["ka-deal"]);
});

test("folders put active containers first and expose the active/idle split", () => {
  // showEmpty로 드러난 빈 컨테이너는 휴면 구간으로 내려간다 — 드래그 순서(gore 먼저)는
  // 각 구간 안에서만 유효하다 (2026-08-19 진행 우선 정렬, 2026-09-01 lib 승격).
  const brands = [
    container("sinabro"),
    container("gore", { projects: 1 }),
    container("22nomad", { open: 2 }),
  ];

  const tree = pmsUi.buildContainerTree(brands, {
    categories: CATEGORIES,
    brandOrder: ["sinabro", "22nomad", "gore"],
    showEmpty: true,
  });

  const folder = tree.groups.find((g) => g.key === "personal").folders[0];
  assert.deepEqual(folder.items.map((b) => b.key), ["22nomad", "gore", "sinabro"]);
  assert.deepEqual(folder.activeItems.map((b) => b.key), ["22nomad", "gore"]);
  assert.deepEqual(folder.idleItems.map((b) => b.key), ["sinabro"]);
  assert.equal(folder.hasActive, true);
});

test("a selected empty container is the idle tail, not an active row", () => {
  const tree = pmsUi.buildContainerTree(
    [container("sinabro"), container("gore", { projects: 1 })],
    { categories: CATEGORIES, selectedKey: "sinabro" },
  );

  const folder = tree.groups.find((g) => g.key === "personal").folders[0];
  assert.deepEqual(folder.activeItems.map((b) => b.key), ["gore"]);
  assert.deepEqual(folder.idleItems.map((b) => b.key), ["sinabro"]);
});

test("containers split by org scope and keep their custom order", () => {
  const brands = [
    container("classmoon", { orgScope: "classin", projects: 1 }),
    container("sinabro", { projects: 1 }),
    container("gore", { projects: 1 }),
  ];

  const tree = pmsUi.buildContainerTree(brands, {
    categories: CATEGORIES,
    brandOrder: ["gore", "sinabro"],
  });

  const classin = tree.groups.find((g) => g.key === "classin");
  const personal = tree.groups.find((g) => g.key === "personal");
  assert.deepEqual(classin.folders[0].items.map((b) => b.key), ["classmoon"]);
  assert.deepEqual(personal.folders[0].items.map((b) => b.key), ["gore", "sinabro"]);
});

// ── Roadmap 브랜드 렌즈 (§4 P0-4) ──────────────────────────────────────────────

test("the roadmap brand lens keeps only that brand's projects and its milestones", () => {
  const roadmap = {
    projects: [
      { id: "p1", name: "시집 출간", brandKey: "sinabro", dueAt: "2028-02-10" },
      { id: "p2", name: "챌린지 100일", brandKey: "gore", dueAt: "2028-02-20" },
    ],
    milestones: [
      { id: "m1", projectId: "p1", title: "원고 마감", targetAt: "2028-02-05" },
      { id: "m2", projectId: "p2", title: "1주차", targetAt: "2028-02-15" },
    ],
  };

  const all = pmsUi.buildRoadmapProjection(roadmap, { now: new Date(2028, 0, 15) });
  const lens = pmsUi.buildRoadmapProjection(roadmap, { now: new Date(2028, 0, 15), brandKey: "sinabro" });

  assert.deepEqual(all.items.map((i) => i.id).sort(), ["milestone:m1", "milestone:m2", "project:p1", "project:p2"]);
  assert.deepEqual(lens.items.map((i) => i.id).sort(), ["milestone:m1", "project:p1"]);
});

test("a milestone whose project row is absent is dropped by the lens instead of guessed at", () => {
  const projection = pmsUi.buildRoadmapProjection({
    projects: [{ id: "p1", name: "시집 출간", brandKey: "sinabro", dueAt: "2028-02-10" }],
    milestones: [{ id: "orphan", projectId: "missing", title: "출처 불명", targetAt: "2028-02-15" }],
  }, { now: new Date(2028, 0, 15), brandKey: "sinabro" });

  assert.deepEqual(projection.items.map((i) => i.id), ["project:p1"]);
});

test("roadmap items carry their brand so a row can name it without a second lookup", () => {
  const projection = pmsUi.buildRoadmapProjection({
    projects: [{
      id: "p1", name: "시집 출간", brandKey: "sinabro", brandName: "시나브로",
      startedAt: "2028-01-20", dueAt: "2028-02-10",
    }],
    milestones: [],
  }, { now: new Date(2028, 0, 15) });

  assert.equal(projection.items[0].brandKey, "sinabro");
  assert.equal(projection.items[0].brandName, "시나브로");
});
