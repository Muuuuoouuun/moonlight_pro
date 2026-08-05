import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const nextServerStub = `
export class NextResponse extends Response {
  static json(value, init = {}) {
    return new Response(JSON.stringify(value), {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    });
  }
}
`;

const repositoryStub = (key, exportName) => `
export async function ${exportName}() {
  if (globalThis.__projectAggregateRouteState.${key}Error) {
    throw globalThis.__projectAggregateRouteState.${key}Error;
  }
  return globalThis.__projectAggregateRouteState.${key};
}
`;

const operatorHomeStub = `
function state(ledger) {
  if (ledger?.source === "error") return "error";
  if (ledger?.source === "supabase" && ledger?.partial) return "partial";
  return ledger?.source === "supabase" ? "live" : "preview";
}
export function buildOperatorHomeSummary({ projects, content }) {
  const projectsState = state(projects);
  const contentState = state(content);
  const readableProjects = projects?.source === "supabase";
  return {
    state: projectsState === "live" && contentState === "live" ? "live" : "partial",
    sources: { projects: projectsState, content: contentState },
    pms: readableProjects ? {
      activeProjects: (projects.projects || []).filter((item) => !["Done", "Backlog"].includes(item.status)).length,
      blockedProjects: (projects.projects || []).filter((item) => item.status === "Blocked").length,
    } : null,
    content: null,
  };
}
`;

const taskTodayStub = `
export function buildTaskToday(todos = []) {
  return { items: todos, counts: { total: todos.length }, hiddenCount: 0 };
}
`;

const contentCatalogStub = `
export function filterContentLedgerToBrandLanes(ledger) { return ledger; }
export function buildContentBrandCatalog(ledger) { return { state: ledger?.source || "preview", lanes: [] }; }
`;

const operatorRevenueStub = `
export function filterOperatorOwnedRevenue(ledger) { return ledger || {}; }
export function selectOperatorFocusLeads() { return []; }
`;

const writeGuardStub = `
export function assertHubWriteAllowed() { return null; }
export async function readHubWriteJson() { return { data: {} }; }
`;
const engineClientStub = `export async function forwardPmsCommand() { return { data: {}, httpStatus: 200 }; }`;
const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return "workspace-1"; }
export function resolveSupabaseConfig() { return { url: "https://example.supabase.co", apiKey: "test-key" }; }
export async function deleteSupabaseRecord() { return { persisted: true, reason: "ok" }; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "next/server": nextServerStub,
      // tasks 라우트는 lean getTaskLedger를, overview/daily-brief는 전체 getProjectLedger를
      // 쓴다 — 각자 독립 state 키로 스텁해 계약을 따로 검증한다.
      "@/lib/repositories/operating-ledger":
        repositoryStub("projects", "getProjectLedger") + repositoryStub("tasksLedger", "getTaskLedger"),
      "@/lib/repositories/content-ledger": repositoryStub("content", "getContentLedger"),
      "@/lib/repositories/revenue-ledger": repositoryStub("revenue", "getRevenueLedger"),
      "@/lib/repositories/automations-ledger": repositoryStub("automations", "getAutomationsLedger"),
      "@/lib/repositories/work-ledger": repositoryStub("work", "getWorkLedger"),
      "@/lib/repositories/brief-ledger": repositoryStub("brief", "getMorningBrief"),
      "@/lib/sales-os/work-orders": repositoryStub("orders", "getWorkOrders"),
      "@/lib/operator-home-summary": operatorHomeStub,
      "@/lib/task-today": taskTodayStub,
      "@/lib/content-brand-catalog": contentCatalogStub,
      "@/lib/operator-revenue-scope": operatorRevenueStub,
      "@/lib/hub-write-guard": writeGuardStub,
      "@/lib/pms-engine-client": engineClientStub,
      "@/lib/server-write": serverWriteStub,
    };
    if (stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__projectAggregateRouteState = {};
const tasksRoute = await import("../app/api/hub/tasks/route.js?project-ledger-error-consumer-test");
const overviewRoute = await import("../app/api/hub/overview/route.js?project-ledger-error-consumer-test");
const dailyBriefRoute = await import("../app/api/hub/daily-brief/route.js?project-ledger-error-consumer-test");

function liveProjectLedger(overrides = {}) {
  return {
    source: "supabase",
    configured: true,
    partial: false,
    failedSources: [],
    partialSources: [],
    projects: [{ id: "project-1", name: "Live", status: "In progress" }],
    todos: [{ id: "task-1", title: "Live task", done: false, status: "todo" }],
    updates: [],
    decisions: [],
    taskAggregation: { loaded: 1, total: 1, partial: false },
    ...overrides,
  };
}

// lean getTaskLedger 계약의 성공 응답 — notes/checks 등 옵션 소스는 아예 읽지 않는다.
function liveTaskLedger(overrides = {}) {
  return {
    source: "supabase",
    configured: true,
    workspaceId: "workspace-1",
    partial: false,
    failedSources: [],
    todos: [{ id: "task-1", title: "Live task", done: false, status: "todo", dealId: null }],
    taskAggregation: { loaded: 1, total: 1, partial: false },
    ...overrides,
  };
}

function resetState() {
  state.projectsError = null;
  state.projects = liveProjectLedger();
  state.tasksLedgerError = null;
  state.tasksLedger = liveTaskLedger();
  state.content = { source: "supabase", items: [], publishLogs: [], brands: [], queue: [], attention: [], summary: {}, ideaQueue: [] };
  state.revenue = { source: "supabase", deals: [], leads: [], stages: [], summary: {} };
  state.automations = { source: "supabase", runs: [], automations: [], summary: {} };
  state.work = { source: "supabase", decisions: [], rituals: [], summary: {} };
  state.orders = { source: "supabase", orders: [] };
  state.brief = { source: "supabase", brief: null };
}

beforeEach(resetState);

test("tasks API returns 502 instead of flattening a configured task read error", async () => {
  state.tasksLedger = {
    source: "error",
    configured: true,
    error: "project-ledger-core-read-failed",
    failedSources: ["tasks"],
    todos: [],
  };

  const response = await tasksRoute.GET(new Request("http://hub.test/api/hub/tasks"));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.equal(body.source, "error");
  assert.equal(body.error, "project-ledger-core-read-failed");
  assert.deepEqual(body.failedSources, ["tasks"]);
});

test("tasks API stays live when unrelated full-ledger sources are partial", async () => {
  // lean read는 notes/routine_checks를 아예 읽지 않는다 — 전체 원장이 부분 실패여도
  // 태스크 목록은 live를 유지한다(과거: 전체 getProjectLedger 상태에 끌려갔다).
  state.projects = liveProjectLedger({ partial: true, failedSources: ["notes", "routine_checks"] });
  state.tasksLedger = liveTaskLedger();

  const response = await tasksRoute.GET(new Request("http://hub.test/api/hub/tasks"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "live");
  assert.equal(body.partial, false);
  assert.deepEqual(body.failedSources, []);
  assert.equal(body.tasks.length, 1);
});

test("tasks API marks an incomplete task aggregation partial", async () => {
  state.tasksLedger = liveTaskLedger({
    partial: true,
    taskAggregation: { loaded: 160, total: 161, partial: true },
  });

  const body = await (await tasksRoute.GET(new Request("http://hub.test/api/hub/tasks"))).json();

  assert.equal(body.status, "partial");
  assert.equal(body.partial, true);
  assert.deepEqual(body.failedSources, ["tasks"]);
  assert.equal(body.tasks.length, 1);
});

test("tasks API narrows to one deal with ?dealId=", async () => {
  state.tasksLedger = liveTaskLedger({
    todos: [
      { id: "task-1", title: "Deal task", done: false, status: "todo", dealId: "deal-9" },
      { id: "task-2", title: "Other", done: false, status: "todo", dealId: null },
    ],
  });

  const body = await (await tasksRoute.GET(new Request("http://hub.test/api/hub/tasks?dealId=deal-9"))).json();

  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].id, "task-1");
});

test("tasks API catch logs server-side and returns a fixed safe error", async () => {
  state.tasksLedgerError = new Error("private-service-key=do-not-leak");
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);

  try {
    const response = await tasksRoute.GET(new Request("http://hub.test/api/hub/tasks"));
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.status, "error");
    assert.equal(body.error, "task-ledger-unexpected-error");
    assert.equal(JSON.stringify(body).includes("private-service-key"), false);
    assert.equal(logged.length, 1);
  } finally {
    console.error = originalError;
  }
});

test("overview names a fulfilled project error and withholds fake project KPI zeroes", async () => {
  state.projects = {
    source: "error",
    configured: true,
    error: "project-ledger-core-read-failed",
    failedSources: ["projects"],
    projects: [],
    todos: [],
    updates: [],
    decisions: [],
  };

  const response = await overviewRoute.GET();
  const body = await response.json();
  const projectsSource = body.sources.find((source) => source.key === "projects");

  assert.equal(body.status, "partial");
  assert.equal(projectsSource.state, "error");
  assert.deepEqual(projectsSource.failedSources, ["projects"]);
  assert.deepEqual(body.failedSources, ["projects"]);
  assert.equal(body.kpis.updatesThisWeek, null);
  assert.equal(body.kpis.decisionsThisWeek, null);
  assert.equal(body.kpis.activeProjects, null);
  assert.equal(body.kpis.blockedProjects, null);
  assert.equal(body.operatorHome.sources.projects, "error");
});

test("overview preserves core project KPIs while naming optional-source partials", async () => {
  state.projects = liveProjectLedger({
    partial: true,
    failedSources: ["project_updates"],
    projects: [
      { id: "project-1", status: "In progress" },
      { id: "project-2", status: "Blocked" },
    ],
  });

  const body = await (await overviewRoute.GET()).json();
  const projectsSource = body.sources.find((source) => source.key === "projects");

  assert.equal(body.status, "partial");
  assert.equal(body.source, "partial");
  assert.equal(projectsSource.state, "partial");
  assert.deepEqual(projectsSource.failedSources, ["project_updates"]);
  assert.deepEqual(projectsSource.partialSources, []);
  assert.deepEqual(body.failedSources, ["project_updates"]);
  assert.deepEqual(body.partialSources, []);
  assert.equal(body.kpis.updatesThisWeek, null);
  assert.equal(body.kpis.activeProjects, 2);
  assert.equal(body.kpis.blockedProjects, 1);
});

test("overview keeps capped task aggregation partial separate from failed project reads", async () => {
  state.projects = liveProjectLedger({
    partial: true,
    partialSources: ["tasks"],
    taskAggregation: { loaded: 160, total: 161, partial: true },
  });

  const body = await (await overviewRoute.GET()).json();
  const projectsSource = body.sources.find((source) => source.key === "projects");

  assert.equal(body.status, "partial");
  assert.equal(body.source, "partial");
  assert.equal(projectsSource.state, "partial");
  assert.deepEqual(projectsSource.failedSources, []);
  assert.deepEqual(projectsSource.partialSources, ["tasks"]);
  assert.deepEqual(body.failedSources, []);
  assert.deepEqual(body.partialSources, ["tasks"]);
});

test("overview withholds project KPIs and update history when bounded slices are truncated", async () => {
  state.projects = liveProjectLedger({
    partial: true,
    partialSources: ["projects", "project_updates"],
    projects: [{ id: "project-1", status: "In progress" }],
    updates: [{
      id: "update-1",
      projectId: "project-1",
      happenedAt: new Date().toISOString(),
    }],
  });

  const body = await (await overviewRoute.GET()).json();
  const projectsSource = body.sources.find((source) => source.key === "projects");

  assert.equal(projectsSource.state, "partial");
  assert.deepEqual(projectsSource.partialSources, ["projects", "project_updates"]);
  assert.equal(body.kpis.activeProjects, null);
  assert.equal(body.kpis.blockedProjects, null);
  assert.equal(body.kpis.updatesThisWeek, null);
  assert.equal(body.activitySeries.every((bucket) => bucket.work === null), true);
  assert.equal(body.brandActivity, null);
});

test("overview withholds published count when only publish logs failed", async () => {
  state.content = {
    source: "supabase",
    partial: true,
    failedSources: ["publish_logs"],
    partialSources: [],
    items: [{ id: "content-1", status: "draft" }],
    publishLogs: [],
    summary: {},
  };

  const body = await (await overviewRoute.GET()).json();
  const contentSource = body.sources.find((source) => source.key === "content");

  assert.equal(body.status, "partial");
  assert.equal(contentSource.state, "partial");
  assert.deepEqual(body.failedSources, ["publish_logs"]);
  assert.deepEqual(body.partialSources, []);
  assert.equal(body.kpis.publishedThisWeek, null);
});

test("overview turns configured preview fallbacks into failed card sources", async () => {
  state.revenue = { source: "preview", configured: true, deals: [], stages: [], summary: {} };
  state.automations = { source: "preview", configured: true, runs: [], summary: {} };
  state.work = {
    source: "preview",
    configured: true,
    rhythm: { state: "error", error: { message: "routine read failed" } },
    rituals: [],
    summary: {},
  };

  const body = await (await overviewRoute.GET()).json();
  const byKey = new Map(body.sources.map((source) => [source.key, source]));

  assert.equal(body.status, "partial");
  assert.equal(byKey.get("revenue").state, "error");
  assert.equal(byKey.get("automations").state, "error");
  assert.equal(byKey.get("work").state, "error");
  assert.deepEqual(body.failedSources, ["revenue", "automations", "work"]);
  assert.equal(body.rhythm.state, "error");
});

test("overview propagates a truncated rhythm read as partial rather than live", async () => {
  state.work = {
    source: "supabase",
    configured: true,
    rhythm: {
      state: "partial",
      partial: true,
      truncatedSources: ["routine_checks"],
    },
    rituals: [{ id: "ritual-1", name: "Morning" }],
    summary: { ritualsTotalThisWeek: 1, ritualsCompletedThisWeek: 1 },
  };

  const body = await (await overviewRoute.GET()).json();
  const workSource = body.sources.find((source) => source.key === "work");

  assert.equal(body.status, "partial");
  assert.equal(workSource.state, "partial");
  assert.deepEqual(workSource.failedSources, []);
  assert.deepEqual(workSource.partialSources, ["routine_checks"]);
  assert.deepEqual(body.partialSources, ["routine_checks"]);
  assert.equal(body.rhythm.state, "partial");
});

test("daily brief exposes the project error without manufacturing open-work zero", async () => {
  state.projects = {
    source: "error",
    configured: true,
    error: "project-ledger-core-read-failed",
    failedSources: ["projects", "tasks"],
    projects: [],
    todos: [],
    updates: [],
    decisions: [],
  };

  const body = await (await dailyBriefRoute.GET()).json();
  const projectsSource = body.sources.find((source) => source.key === "projects");
  assert.equal(body.status, "partial");
  assert.equal(projectsSource.state, "error");
  assert.deepEqual(projectsSource.failedSources, ["projects", "tasks"]);
  assert.deepEqual(body.failedSources, ["projects"]);
  assert.equal(body.taskToday.state, "error");
  assert.equal(body.taskToday.counts, null);
  assert.equal(body.operatorHome.sources.projects, "error");
});

test("daily brief keeps task Today live while naming unrelated optional partials", async () => {
  state.projects = liveProjectLedger({
    partial: true,
    failedSources: ["notes"],
    todos: [],
  });

  const body = await (await dailyBriefRoute.GET()).json();
  const projectsSource = body.sources.find((source) => source.key === "projects");
  assert.equal(body.status, "partial");
  assert.equal(body.source, "partial");
  assert.equal(projectsSource.state, "partial");
  assert.deepEqual(projectsSource.failedSources, ["notes"]);
  assert.equal(body.taskToday.state, "live");
  assert.equal(body.taskToday.counts.total, 0);
});

test("daily brief marks only task Today partial for an incomplete task aggregation", async () => {
  state.projects = liveProjectLedger({
    partial: true,
    partialSources: ["tasks"],
    taskAggregation: { loaded: 160, total: 161, partial: true },
  });

  const body = await (await dailyBriefRoute.GET()).json();
  const projectsSource = body.sources.find((source) => source.key === "projects");

  assert.equal(body.status, "partial");
  assert.equal(body.source, "partial");
  assert.equal(projectsSource.state, "partial");
  assert.deepEqual(projectsSource.partialSources, ["tasks"]);
  assert.equal(body.taskToday.state, "partial");
  assert.equal(body.taskToday.counts.total, 1);
});

test("daily brief does not infer a missing decision from a failed decisions ledger", async () => {
  state.work = {
    source: "supabase",
    partial: true,
    failedSources: ["decisions"],
    partialSources: [],
    decisions: [],
    decisionsState: {
      source: "supabase",
      state: "error",
      partial: false,
      failedSources: ["decisions"],
      truncatedSources: [],
      error: { message: "decisions read failed", retryable: true },
    },
    rituals: [],
    summary: {},
  };

  const body = await (await dailyBriefRoute.GET()).json();
  const workSource = body.sources.find((source) => source.key === "work");

  assert.equal(body.status, "partial");
  assert.equal(workSource.state, "partial");
  assert.deepEqual(workSource.failedSources, ["decisions"]);
  assert.equal(body.signals.some((signal) => signal.id === "work-decision-missing"), false);
});

test("overview and daily brief never call a partial-only aggregate preview", async () => {
  state.projects = liveProjectLedger({
    partial: true,
    failedSources: ["notes"],
  });
  state.content = { source: "preview", items: [], publishLogs: [], brands: [], summary: {} };
  state.revenue = { source: "preview", deals: [], leads: [], stages: [], summary: {} };
  state.automations = { source: "preview", runs: [], automations: [], summary: {} };
  state.work = { source: "preview", decisions: [], rituals: [], summary: {} };
  state.orders = { source: "preview", orders: [] };

  const overview = await (await overviewRoute.GET()).json();
  const daily = await (await dailyBriefRoute.GET()).json();

  assert.equal(overview.status, "partial");
  assert.equal(overview.source, "partial");
  assert.equal(daily.status, "partial");
  assert.equal(daily.source, "partial");
  assert.equal(overview.sources.filter((source) => source.state === "live").length, 0);
  assert.equal(daily.sources.filter((source) => source.state === "live").length, 0);
});
