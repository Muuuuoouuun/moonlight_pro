import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const operatingStub = `
export async function getProjectLedger() { return globalThis.__projectReadModelState.projects; }
export async function getTaskLedger() { return globalThis.__projectReadModelState.projects; }
`;
const revenueStub = `
export async function getRevenueLedger() { return globalThis.__projectReadModelState.revenue; }
`;
const calendarStub = `
export async function listGoogleCalendarEvents() { return globalThis.__projectReadModelState.calendar; }
`;
const contentStub = `
export async function getContentLedger() { return globalThis.__projectReadModelState.content; }
`;
const runsStub = `
export async function getRecentAgentRuns() { return globalThis.__projectReadModelState.runs; }
`;
const contextSchemaStub = `
export function cadenceStatusString() { return "unknown"; }
`;
const workspaceMapStub = `
export function filterBrandsByWorkspace(brands) { return brands || []; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "./operating-ledger": operatingStub,
      "./revenue-ledger": revenueStub,
      "../google-calendar": calendarStub,
      "@/lib/repositories/operating-ledger": operatingStub,
      "@/lib/repositories/content-ledger": contentStub,
      "@/lib/sales-os/agent-runs": runsStub,
      "@/lib/sales-os/context-schema": contextSchemaStub,
      "@/components/hub/workspace-map": workspaceMapStub,
    };
    if (stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__projectReadModelState = {};
const { getAttentionLedger } = await import("./repositories/attention-ledger.js?project-error-consumer-test");
const { assembleBrandContext } = await import("./sales-os/brand-context.js?project-error-consumer-test");

beforeEach(() => {
  state.projects = { source: "supabase", partial: false, failedSources: [], projects: [], todos: [] };
  state.revenue = { source: "supabase", leads: [], deals: [], stages: [] };
  state.calendar = { ok: true, items: [] };
  state.content = {
    source: "supabase",
    brands: [{ key: "moon", name: "Moon", voice: "calm" }],
    ideaQueue: [],
    summary: {},
    cadence: null,
  };
  state.runs = { source: "supabase", runs: [] };
});

test("attention names an operating-ledger error and omits only the failed task lane", async () => {
  state.projects = {
    source: "error",
    configured: true,
    error: "project-ledger-core-read-failed",
    failedSources: ["tasks"],
    todos: [{ id: "must-not-leak", title: "stale fallback", done: false }],
  };

  const ledger = await getAttentionLedger();

  assert.equal(ledger.sources.tasks, "error");
  assert.deepEqual(ledger.failedSources, ["tasks"]);
  assert.deepEqual(ledger.sourceFailures, [{
    source: "tasks",
    error: "project-ledger-core-read-failed",
    failedSources: ["tasks"],
  }]);
  assert.equal(ledger.items.some((item) => item.lane === "task"), false);
  assert.equal(ledger.sources.deals, "live");
  assert.equal(ledger.sources.calendar, "live");
});

test("attention keeps task rows live when only unrelated optional ledgers failed", async () => {
  state.projects = {
    source: "supabase",
    partial: true,
    failedSources: ["notes", "routine_checks"],
    projects: [],
    todos: [{ id: "task-1", title: "Task", done: false, status: "doing", priorityRaw: "medium" }],
  };

  const ledger = await getAttentionLedger();

  assert.equal(ledger.sources.tasks, "live");
  assert.deepEqual(ledger.failedSources, []);
  assert.deepEqual(ledger.sourceFailures, []);
  assert.equal(ledger.items.some((item) => item.lane === "task" && item.entityId === "task-1"), true);
});

test("attention marks tasks partial when the task aggregation itself is incomplete", async () => {
  state.projects = {
    source: "supabase",
    partial: false,
    failedSources: [],
    taskAggregation: { loaded: 160, total: 161, partial: true },
    projects: [],
    todos: [{ id: "task-1", title: "Task", done: false, status: "doing", priorityRaw: "medium" }],
  };

  const ledger = await getAttentionLedger();

  assert.equal(ledger.sources.tasks, "partial");
  assert.deepEqual(ledger.failedSources, ["tasks"]);
  assert.deepEqual(ledger.sourceFailures, [{
    source: "tasks",
    error: "task-ledger-partial-read",
    failedSources: ["tasks"],
  }]);
  assert.equal(ledger.items.some((item) => item.entityId === "task-1"), true);
});

test("brand context records a fulfilled operating-ledger error as a missing partial source", async () => {
  state.projects = {
    source: "error",
    configured: true,
    error: "project-ledger-core-read-failed",
    failedSources: ["projects"],
    projects: [{ id: "must-not-leak", brand: "moon", name: "Fallback" }],
  };

  const context = await assembleBrandContext();

  assert.equal(context.source, "partial");
  assert.deepEqual(context.projects, []);
  assert.deepEqual(context.missing.find((item) => item.source === "operating-ledger"), {
    source: "operating-ledger",
    reason: "project-ledger-core-read-failed",
    failedSources: ["projects"],
  });
});

test("brand context preserves core projects while naming optional operating-ledger partials", async () => {
  state.projects = {
    source: "supabase",
    partial: true,
    failedSources: ["project_updates"],
    projects: [{ id: "project-1", brand: "moon", name: "Moon project", status: "In progress" }],
  };

  const context = await assembleBrandContext();

  assert.equal(context.source, "partial");
  assert.equal(context.projects[0].id, "project-1");
  assert.deepEqual(context.missing.find((item) => item.source === "operating-ledger"), {
    source: "operating-ledger",
    reason: "project-ledger-partial-read",
    failedSources: ["project_updates"],
  });
});
