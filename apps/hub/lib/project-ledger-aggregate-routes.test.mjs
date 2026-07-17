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
const serverWriteStub = `export function resolveDefaultWorkspaceId() { return "workspace-1"; }`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "next/server": nextServerStub,
      "@/lib/repositories/operating-ledger": repositoryStub("projects", "getProjectLedger"),
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
    projects: [{ id: "project-1", name: "Live", status: "In progress" }],
    todos: [{ id: "task-1", title: "Live task", done: false, status: "todo" }],
    updates: [],
    decisions: [],
    ...overrides,
  };
}

function resetState() {
  state.projects = liveProjectLedger();
  state.content = { source: "supabase", items: [], publishLogs: [], brands: [], queue: [], attention: [], summary: {}, ideaQueue: [] };
  state.revenue = { source: "supabase", deals: [], leads: [], stages: [], summary: {} };
  state.automations = { source: "supabase", runs: [], automations: [], summary: {} };
  state.work = { source: "supabase", decisions: [], rituals: [], summary: {} };
  state.orders = { source: "supabase", orders: [] };
  state.brief = { source: "supabase", brief: null };
}

beforeEach(resetState);

test("tasks API returns 502 instead of flattening a configured project read error", async () => {
  state.projects = {
    source: "error",
    configured: true,
    error: "project-ledger-core-read-failed",
    failedSources: ["tasks"],
    todos: [],
  };

  const response = await tasksRoute.GET();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.equal(body.source, "error");
  assert.equal(body.error, "project-ledger-core-read-failed");
  assert.deepEqual(body.failedSources, ["tasks"]);
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
  assert.equal(projectsSource.state, "partial");
  assert.deepEqual(projectsSource.failedSources, ["project_updates"]);
  assert.equal(body.kpis.updatesThisWeek, null);
  assert.equal(body.kpis.activeProjects, 2);
  assert.equal(body.kpis.blockedProjects, 1);
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

test("daily brief keeps core task/project evidence while naming optional partials", async () => {
  state.projects = liveProjectLedger({
    partial: true,
    failedSources: ["notes"],
  });

  const body = await (await dailyBriefRoute.GET()).json();
  const projectsSource = body.sources.find((source) => source.key === "projects");
  assert.equal(body.status, "partial");
  assert.equal(projectsSource.state, "partial");
  assert.deepEqual(projectsSource.failedSources, ["notes"]);
  assert.equal(body.taskToday.state, "partial");
  assert.equal(body.taskToday.counts.total, 1);
});
