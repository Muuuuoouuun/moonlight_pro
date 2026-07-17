import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function withWorkspaceFilter(filters = []) {
  const workspaceId = globalThis.__workLedgerTestState.workspaceId;
  return workspaceId ? [["workspace_id", \`eq.\${workspaceId}\`], ...filters] : filters;
}
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__workLedgerTestState;
  state.calls.push({ table, options });
  return Object.prototype.hasOwnProperty.call(state.rows, table) ? state.rows[table] : [];
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() {
  return globalThis.__workLedgerTestState.workspaceId;
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
  workspaceId: "workspace-1",
  calls: [],
  rows: {},
};

const workLedger = await import("./work-ledger.js?roadmap-ledger-test");

beforeEach(() => {
  globalThis.__workLedgerTestState = {
    workspaceId: "workspace-1",
    calls: [],
    rows: {
      decisions: [],
      routine_checks: [],
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
    assert.deepEqual(call.options.filters[0], ["workspace_id", "eq.workspace-1"]);
  }
});

test("a connected but empty project and milestone ledger is explicitly live-empty", async () => {
  const ledger = await workLedger.getWorkLedger();

  assert.equal(ledger.roadmap.state, "live-empty");
  assert.equal(ledger.roadmap.source, "supabase");
  assert.equal(ledger.roadmap.partial, false);
  assert.equal(ledger.roadmap.error, null);
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
    projects: [],
    milestones: [],
  });
});
