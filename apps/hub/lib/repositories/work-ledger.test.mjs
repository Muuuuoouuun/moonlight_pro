import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_TARGET_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_OTHER_ID = "33333333-3333-4333-8333-333333333333";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function withWorkspaceFilter(filters = []) {
  const workspaceId = globalThis.__workLedgerTestState.workspaceId;
  return workspaceId ? [["workspace_id", \`eq.\${workspaceId}\`], ...filters] : filters;
}
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__workLedgerTestState;
  state.calls.push({ table, options });
  const rows = Object.prototype.hasOwnProperty.call(state.rows, table) ? state.rows[table] : [];
  if (!Array.isArray(rows)) return rows;
  const projectFilter = options.filters?.find(([key]) => key === "project_id")?.[1] || null;
  const idFilter = options.filters?.find(([key]) => key === "id")?.[1] || null;
  const shouldApplyFilters = table === "routine_checks"
    ? state.applyRoutineQuery
    : state.applyRoadmapQuery && ["projects", "milestones"].includes(table);
  const filtered = shouldApplyFilters && projectFilter?.startsWith("eq.")
    ? rows.filter((row) => row.project_id === projectFilter.slice(3))
    : shouldApplyFilters && idFilter?.startsWith("eq.")
      ? rows.filter((row) => row.id === idFilter.slice(3))
      : rows;
  const ordered = options.order === "checked_at.desc.nullslast,created_at.desc.nullslast,id.desc"
    ? [...filtered].sort((left, right) => {
        if (Boolean(left.checked_at) !== Boolean(right.checked_at)) return left.checked_at ? -1 : 1;
        const checked = String(right.checked_at || "").localeCompare(String(left.checked_at || ""));
        if (checked !== 0) return checked;
        const created = String(right.created_at || "").localeCompare(String(left.created_at || ""));
        if (created !== 0) return created;
        return String(right.id || "").localeCompare(String(left.id || ""));
      })
    : filtered;
  return typeof options.limit === "number" ? ordered.slice(0, options.limit) : ordered;
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() {
  return globalThis.__workLedgerTestState.workspaceId;
}
export function resolveSupabaseConfig() {
  return { url: "https://supabase.example.com", apiKey: "test-key" };
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/server-read") {
      return {
        url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/server-write") {
      return {
        url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__workLedgerTestState = {
  workspaceId: WORKSPACE_ID,
  calls: [],
  rows: {},
};

const workLedger = await import("./work-ledger.js?roadmap-ledger-test");

beforeEach(() => {
  globalThis.__workLedgerTestState = {
    workspaceId: WORKSPACE_ID,
    calls: [],
    applyRoutineQuery: false,
    applyRoadmapQuery: false,
    rows: {
      decisions: [],
      routine_checks: [],
      workspaces: [{ id: WORKSPACE_ID, timezone: "Asia/Seoul" }],
      profiles: [],
      projects: [],
      milestones: [],
    },
  };
});

test("projects roadmap rows and milestone points preserve their durable relationship", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.projects = [{
    id: "project-1",
    name: "운영 OS",
    status: "active",
    priority: "critical",
    started_at: "2026-07-01T00:00:00.000Z",
    due_at: "2026-08-31T00:00:00.000Z",
  }];
  state.rows.milestones = [{
    id: "milestone-1",
    project_id: "project-1",
    title: "Phase 1",
    status: "planned",
    target_date: "2026-08-15",
  }];

  const ledger = await workLedger.getWorkLedger();

  assert.deepEqual(ledger.roadmap, {
    source: "supabase",
    state: "live",
    partial: false,
    error: null,
    failedSources: [],
    truncatedSources: [],
    projects: [{
      id: "project-1",
      name: "운영 OS",
      status: "active",
      priority: "critical",
      startedAt: "2026-07-01T00:00:00.000Z",
      dueAt: "2026-08-31T00:00:00.000Z",
    }],
    milestones: [{
      id: "milestone-1",
      projectId: "project-1",
      title: "Phase 1",
      status: "planned",
      targetAt: "2026-08-15",
    }],
  });
  for (const table of ["projects", "milestones"]) {
    const call = state.calls.find((entry) => entry.table === table);
    assert.ok(call, `${table} must be read from the shared work ledger`);
    assert.deepEqual(call.options.filters[0], ["workspace_id", `eq.${WORKSPACE_ID}`]);
  }
});

test("a connected but empty project and milestone ledger is explicitly live-empty", async () => {
  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.roadmap.state, "live-empty");
  assert.equal(ledger.roadmap.source, "supabase");
  assert.equal(ledger.roadmap.partial, false);
  assert.equal(ledger.roadmap.error, null);
  assert.deepEqual(ledger.roadmap.truncatedSources, []);
  assert.deepEqual(ledger.roadmap.projects, []);
  assert.deepEqual(ledger.roadmap.milestones, []);
});

test("one failed roadmap table remains a named partial result instead of fake live-empty", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.projects = null;
  state.rows.milestones = [{
    id: "milestone-1",
    project_id: "project-1",
    title: "검증",
    status: "active",
    target_date: "2026-08-01",
  }];

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.roadmap.state, "partial");
  assert.equal(ledger.roadmap.source, "supabase");
  assert.equal(ledger.roadmap.partial, true);
  assert.deepEqual(ledger.roadmap.failedSources, ["projects"]);
  assert.deepEqual(ledger.roadmap.truncatedSources, []);
  assert.match(ledger.roadmap.error.message, /projects/);
  assert.equal(ledger.roadmap.error.retryable, true);
  assert.deepEqual(ledger.roadmap.projects, []);
  assert.equal(ledger.roadmap.milestones[0].projectId, "project-1");
});

test("both failed roadmap tables report error rather than preview or live-empty", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.projects = null;
  state.rows.milestones = null;

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.roadmap.state, "error");
  assert.equal(ledger.roadmap.source, "supabase");
  assert.equal(ledger.roadmap.partial, false);
  assert.deepEqual(ledger.roadmap.failedSources, ["projects", "milestones"]);
  assert.deepEqual(ledger.roadmap.truncatedSources, []);
  assert.equal(ledger.roadmap.error.retryable, true);
});

test("an unconfigured workspace keeps roadmap in explicit preview", async () => {
  globalThis.__workLedgerTestState.workspaceId = null;

  const ledger = await workLedger.getWorkLedger();

  assert.deepEqual(ledger.roadmap, {
    source: "preview",
    state: "preview",
    partial: false,
    error: null,
    failedSources: [],
    truncatedSources: [],
    projects: [],
    milestones: [],
  });
});

test("marks rows beyond the Roadmap display limit as named partial data", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.projects = Array.from({ length: 501 }, (_, index) => ({
    id: `project-${index}`,
    name: `프로젝트 ${index}`,
    status: "active",
    priority: "medium",
    started_at: null,
    due_at: null,
  }));
  state.rows.milestones = Array.from({ length: 501 }, (_, index) => ({
    id: `milestone-${index}`,
    project_id: `project-${index}`,
    title: `마일스톤 ${index}`,
    status: "planned",
    target_date: null,
  }));

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.roadmap.state, "partial");
  assert.equal(ledger.roadmap.partial, true);
  assert.equal(ledger.roadmap.error, null);
  assert.deepEqual(ledger.roadmap.failedSources, []);
  assert.deepEqual(ledger.roadmap.truncatedSources, ["projects", "milestones"]);
  assert.equal(ledger.roadmap.projects.length, 500);
  assert.equal(ledger.roadmap.milestones.length, 500);
  for (const table of ["projects", "milestones"]) {
    const call = state.calls.find((entry) => entry.table === table);
    assert.equal(call.options.limit, 501);
  }
});

test("selected Roadmap project is queried exactly even when outside the global cap", async () => {
  const state = globalThis.__workLedgerTestState;
  state.applyRoadmapQuery = true;
  state.rows.projects = [
    ...Array.from({ length: 501 }, (_, index) => ({
      id: `project-${index}`,
      name: `Project ${index}`,
      status: "active",
      priority: "medium",
    })),
    {
      id: PROJECT_TARGET_ID,
      name: "Selected outside cap",
      status: "active",
      priority: "high",
    },
  ];
  state.rows.milestones = [{
    id: "selected-milestone",
    project_id: PROJECT_TARGET_ID,
    title: "Exact milestone",
    status: "active",
    target_date: "2026-08-01",
  }];

  const ledger = await workLedger.getWorkLedger({ projectId: PROJECT_TARGET_ID });

  assert.equal(ledger.roadmap.state, "live");
  assert.deepEqual(ledger.roadmap.projects.map((project) => project.id), [PROJECT_TARGET_ID]);
  assert.deepEqual(ledger.roadmap.milestones.map((milestone) => milestone.id), ["selected-milestone"]);
  const projectCall = state.calls.find((entry) => entry.table === "projects");
  const milestoneCall = state.calls.find((entry) => entry.table === "milestones");
  assert.deepEqual(projectCall.options.filters, [
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["id", `eq.${PROJECT_TARGET_ID}`],
  ]);
  assert.deepEqual(milestoneCall.options.filters, [
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["project_id", `eq.${PROJECT_TARGET_ID}`],
  ]);
});

test("rituals keep project identity when two projects share the same ritual key", async () => {
  const state = globalThis.__workLedgerTestState;
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  state.rows.projects = [
    {
      id: "project-1",
      name: "운영 OS",
      status: "active",
      priority: "critical",
      started_at: null,
      due_at: null,
    },
    {
      id: "project-2",
      name: "콘텐츠 시스템",
      status: "active",
      priority: "medium",
      started_at: null,
      due_at: null,
    },
  ];
  state.rows.routine_checks = [
    {
      id: "check-1",
      project_id: "project-1",
      check_type: "morning",
      status: "done",
      checked_at: today.toISOString(),
      meta: { ritual_key: "daily-focus", name: "Daily focus" },
    },
    {
      id: "check-2",
      project_id: "project-2",
      check_type: "morning",
      status: "done",
      checked_at: yesterday.toISOString(),
      meta: { ritual_key: "daily-focus", name: "Daily focus" },
    },
    {
      id: "check-3",
      project_id: null,
      check_type: "morning",
      status: "pending",
      checked_at: null,
      meta: { ritual_key: "daily-focus", name: "Daily focus" },
    },
  ];

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.rituals.length, 3);
  assert.equal(new Set(ledger.rituals.map((ritual) => ritual.id)).size, 3);
  assert.deepEqual(
    ledger.rituals.map((ritual) => ({
      projectId: ritual.projectId,
      projectName: ritual.projectName,
      ritualKey: ritual.ritualKey,
      checkType: ritual.checkType,
      projectHref: ritual.projectHref,
    })),
    [
      {
        projectId: "project-1",
        projectName: "운영 OS",
        ritualKey: "daily-focus",
        checkType: "morning",
        projectHref: "/dashboard/work/projects?project=project-1",
      },
      {
        projectId: "project-2",
        projectName: "콘텐츠 시스템",
        ritualKey: "daily-focus",
        checkType: "morning",
        projectHref: "/dashboard/work/projects?project=project-2",
      },
      {
        projectId: null,
        projectName: null,
        ritualKey: "daily-focus",
        checkType: "morning",
        projectHref: null,
      },
    ],
  );
  assert.equal(ledger.rituals[0].weeks.at(-1), 1);
  assert.equal(ledger.rituals[1].weeks.at(-2), 1);
  assert.equal(ledger.rituals[2].weeks.every((value) => value === 0), true);
});

test("ritual reading survives a failed project-name lookup without losing project ids", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.projects = null;
  state.rows.routine_checks = [{
    id: "check-1",
    project_id: "project-1",
    check_type: "weekly",
    status: "pending",
    checked_at: null,
    meta: { ritual_key: "weekly-review", name: "Weekly Review" },
  }];

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.rituals.length, 1);
  assert.equal(ledger.rituals[0].projectId, "project-1");
  assert.equal(ledger.rituals[0].projectName, null);
  assert.equal(ledger.rituals[0].ritualKey, "weekly-review");
  assert.equal(ledger.rituals[0].checkType, "weekly");
});

test("weekly bitmap honors persisted local_date before the server timestamp date", async () => {
  const state = globalThis.__workLedgerTestState;
  const today = new Date();
  const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const previousUtcDate = new Date(`${localDate}T00:30:00.000Z`);
  previousUtcDate.setUTCDate(previousUtcDate.getUTCDate() - 1);
  state.rows.routine_checks = [{
    id: "check-local-date",
    project_id: null,
    check_type: "morning",
    status: "done",
    checked_at: previousUtcDate.toISOString(),
    meta: {
      ritual_key: "daily-focus",
      name: "Daily focus",
      local_date: localDate,
    },
  }];

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.rituals[0].weeks.at(-1), 1);
});

test("weekly bitmap uses the workspace timezone at the UTC to KST date boundary", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.routine_checks = [{
    id: "check-boundary",
    project_id: null,
    check_type: "morning",
    status: "done",
    checked_at: "2026-07-16T14:50:00.000Z",
    meta: { ritual_key: "daily-focus", name: "Daily focus" },
  }];

  const ledger = await workLedger.getWorkLedger({
    now: new Date("2026-07-16T15:30:00.000Z"),
  });

  assert.equal(ledger.timeZone, "Asia/Seoul");
  assert.equal(ledger.rituals[0].weeks.at(-2), 1);
  assert.equal(ledger.rituals[0].weeks.at(-1), 0);
  assert.equal(ledger.rituals[0].streak, 0);
  const workspaceCall = state.calls.find((entry) => entry.table === "workspaces");
  assert.deepEqual(workspaceCall.options.filters, [["id", `eq.${WORKSPACE_ID}`]]);
});

test("a configured routine ledger read failure is error rather than preview", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.routine_checks = null;

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, ["routine_checks"]);
  assert.deepEqual(ledger.rhythm, {
    source: "supabase",
    state: "error",
    partial: false,
    truncatedSources: [],
    error: {
      message: "routine_checks 원장을 읽지 못했습니다.",
      retryable: true,
    },
  });
  assert.deepEqual(ledger.rituals, []);
});

test("workspace timezone read failure makes Rhythm error instead of live", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.routine_checks = [{
    id: "check-1",
    project_id: null,
    check_type: "morning",
    status: "done",
    checked_at: "2026-07-16T15:30:00.000Z",
    meta: { ritual_key: "daily-focus", name: "Daily focus" },
  }];

  state.rows.workspaces = null;
  const failedRead = await workLedger.getWorkLedger();
  assert.equal(failedRead.source, "supabase");
  assert.equal(failedRead.partial, true);
  assert.deepEqual(failedRead.failedSources, ["workspaces"]);
  assert.equal(failedRead.rhythm.state, "error");
  assert.match(failedRead.rhythm.error.message, /workspace|timezone/i);
  assert.deepEqual(failedRead.rituals, []);

  state.rows.workspaces = [];
  const missingWorkspace = await workLedger.getWorkLedger();
  assert.equal(missingWorkspace.source, "supabase");
  assert.equal(missingWorkspace.partial, true);
  assert.deepEqual(missingWorkspace.failedSources, ["workspaces"]);
  assert.equal(missingWorkspace.rhythm.state, "error");
  assert.deepEqual(missingWorkspace.rituals, []);
});

test("null workspace timezone uses the explicit Seoul fallback", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.workspaces = [{ id: WORKSPACE_ID, timezone: null }];
  state.rows.routine_checks = [{
    id: "check-boundary",
    project_id: null,
    check_type: "morning",
    status: "done",
    checked_at: "2026-07-16T15:05:00.000Z",
    meta: { ritual_key: "daily-focus", name: "Daily focus" },
  }];

  const ledger = await workLedger.getWorkLedger({ now: new Date("2026-07-16T15:30:00.000Z") });

  assert.equal(ledger.timeZone, "Asia/Seoul");
  assert.equal(ledger.rhythm.state, "live");
  assert.equal(ledger.rituals[0].weeks.at(-1), 1);
});

test("rituals remain readable when the independent decisions source fails", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.decisions = null;
  state.rows.routine_checks = [{
    id: "check-1",
    project_id: null,
    check_type: "weekly",
    status: "pending",
    checked_at: null,
    meta: { ritual_key: "weekly-review", name: "Weekly Review" },
  }];

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, ["decisions"]);
  assert.deepEqual(ledger.partialSources, []);
  assert.deepEqual(ledger.decisionsState, {
    source: "supabase",
    state: "error",
    partial: false,
    failedSources: ["decisions"],
    truncatedSources: [],
    error: {
      message: "decisions 원장을 읽지 못했습니다.",
      retryable: true,
    },
  });
  assert.equal(ledger.rhythm.state, "live");
  assert.equal(ledger.rituals.length, 1);
  assert.equal(ledger.rituals[0].ritualKey, "weekly-review");
});

test("decision row cap is explicit partial data instead of a complete timeline", async () => {
  const state = globalThis.__workLedgerTestState;
  state.rows.decisions = Array.from({ length: 41 }, (_, index) => ({
    id: `decision-${index}`,
    title: `Decision ${index}`,
    decided_at: "2026-07-17T00:00:00.000Z",
  }));

  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, []);
  assert.deepEqual(ledger.partialSources, ["decisions"]);
  assert.equal(ledger.decisions.length, 40);
  assert.deepEqual(ledger.decisionsState, {
    source: "supabase",
    state: "partial",
    partial: true,
    failedSources: [],
    truncatedSources: ["decisions"],
    error: null,
  });
  const call = state.calls.find((entry) => entry.table === "decisions");
  assert.equal(call.options.limit, 41);
});

test("selected project is filtered by Supabase before the rhythm row limit", async () => {
  const state = globalThis.__workLedgerTestState;
  state.applyRoutineQuery = true;
  state.rows.routine_checks = [
    ...Array.from({ length: 241 }, (_, index) => ({
      id: `other-${index}`,
      project_id: PROJECT_OTHER_ID,
      check_type: "morning",
      status: "done",
      checked_at: new Date().toISOString(),
      meta: { ritual_key: `other-${index}`, name: `Other ${index}` },
    })),
    {
      id: "target-check",
      project_id: PROJECT_TARGET_ID,
      check_type: "weekly",
      status: "done",
      checked_at: new Date().toISOString(),
      meta: { ritual_key: "target-review", name: "Target review" },
    },
  ];

  const ledger = await workLedger.getWorkLedger({ projectId: PROJECT_TARGET_ID });

  assert.equal(ledger.rituals.length, 1);
  assert.equal(ledger.rituals[0].projectId, PROJECT_TARGET_ID);
  assert.equal(ledger.rituals[0].ritualKey, "target-review");
  const call = state.calls.find((entry) => entry.table === "routine_checks");
  assert.equal(call.options.limit, 241);
  assert.deepEqual(call.options.filters, [
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["project_id", `eq.${PROJECT_TARGET_ID}`],
  ]);
});

test("deterministic nulls-last ordering keeps completed checks inside the rhythm cap", async () => {
  const state = globalThis.__workLedgerTestState;
  state.applyRoutineQuery = true;
  state.rows.routine_checks = [
    ...Array.from({ length: 241 }, (_, index) => ({
      id: `pending-${index}`,
      project_id: null,
      check_type: "morning",
      status: "pending",
      checked_at: null,
      created_at: `2026-07-16T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      meta: { ritual_key: `pending-${index}`, name: `Pending ${index}` },
    })),
    {
      id: "completed-target",
      project_id: null,
      check_type: "weekly",
      status: "done",
      checked_at: "2026-07-17T01:00:00.000Z",
      created_at: "2026-07-17T01:00:00.000Z",
      meta: { ritual_key: "completed-target", local_date: "2026-07-17" },
    },
  ];

  const ledger = await workLedger.getWorkLedger({
    now: new Date("2026-07-17T02:00:00.000Z"),
  });

  assert.equal(ledger.rituals.some((ritual) => ritual.ritualKey === "completed-target"), true);
  const call = state.calls.find((entry) => entry.table === "routine_checks");
  assert.equal(call.options.order, "checked_at.desc.nullslast,created_at.desc.nullslast,id.desc");
});

test("rhythm row limit boundary is complete at 240 and explicitly partial at 241", async () => {
  const state = globalThis.__workLedgerTestState;
  const makeRows = (count) => Array.from({ length: count }, (_, index) => ({
    id: `check-${index}`,
    project_id: null,
    check_type: "morning",
    status: "pending",
    checked_at: null,
    meta: { ritual_key: `ritual-${index}`, name: `Ritual ${index}` },
  }));

  state.rows.routine_checks = makeRows(240);
  const complete = await workLedger.getWorkLedger();
  assert.deepEqual(complete.rhythm, {
    source: "supabase",
    state: "live",
    partial: false,
    truncatedSources: [],
    error: null,
  });
  assert.equal(complete.rituals.length, 240);

  state.calls = [];
  state.rows.routine_checks = makeRows(241);
  const partial = await workLedger.getWorkLedger();
  assert.deepEqual(partial.rhythm, {
    source: "supabase",
    state: "partial",
    partial: true,
    truncatedSources: ["routine_checks"],
    error: null,
  });
  assert.equal(partial.rituals.length, 240);
  assert.equal(partial.summary.ritualsTotalThisWeek, 240);
  const call = state.calls.find((entry) => entry.table === "routine_checks");
  assert.equal(call.options.limit, 241);
});
