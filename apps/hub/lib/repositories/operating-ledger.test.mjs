import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function inFilter(values) { return \`in.(\${values.join(",")})\`; }
export function withWorkspaceFilter(filters = []) { return filters; }
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__operatingLedgerTestState;
  state.calls.push({ kind: "fetch", table, options });
  return Object.hasOwn(state.rows, table) ? state.rows[table] : [];
}
export async function countSupabaseRows(table, filters = []) {
  const state = globalThis.__operatingLedgerTestState;
  state.calls.push({ kind: "count", table, filters });
  return state.counts[table] ?? null;
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() {
  return globalThis.__operatingLedgerTestState.workspaceId;
}
export function resolveSupabaseConfig() {
  return globalThis.__operatingLedgerTestState.config;
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

globalThis.__operatingLedgerTestState = {
  calls: [],
  config: { url: "https://supabase.example.com", apiKey: "test-key" },
  counts: {},
  rows: {},
  workspaceId: "workspace-1",
};

const operatingLedger = await import("./operating-ledger.js?operating-ledger-test");

test("keeps raw project source fields separate from latest-update display data", () => {
  const latestUpdate = {
    id: "update-1",
    projectId: "project-1",
    summary: "업데이트에서 보고한 요약",
    progress: 72,
    nextAction: "업데이트에서 보고한 다음 행동",
    happenedAt: "2026-07-16T08:00:00.000Z",
  };
  const [project] = operatingLedger.mapProjects(
    [{
      id: "project-1",
      brand_id: "brand-1",
      name: "무손실 프로젝트",
      status: "blocked",
      priority: "high",
      summary: "프로젝트 원본 목표",
      progress: 25,
      next_action: "프로젝트 원본 다음 행동",
      started_at: "2026-07-01T00:00:00.000Z",
      due_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-17T01:02:03.000Z",
      created_at: "2026-06-30T00:00:00.000Z",
      meta: {},
    }],
    new Map([["brand-1", { id: "brand-1", slug: "classmoon" }]]),
    new Map(),
    new Map([["project-1", { count: 1, latest: latestUpdate }]]),
  );

  assert.equal(project.brandId, "brand-1");
  assert.equal(project.statusKey, "blocked");
  assert.equal(project.priority, "high");
  assert.equal(project.projectSummary, "프로젝트 원본 목표");
  assert.equal(project.projectProgress, 25);
  assert.equal(project.projectNextAction, "프로젝트 원본 다음 행동");
  assert.equal(project.startedAt, "2026-07-01T00:00:00.000Z");
  assert.equal(project.dueAt, "2026-07-31T00:00:00.000Z");
  assert.equal(project.updatedAt, "2026-07-17T01:02:03.000Z");
  assert.equal(project.displaySummary, "프로젝트 원본 목표");
  assert.equal(project.displayNextAction, "프로젝트 원본 다음 행동");
  assert.equal(project.latestUpdate, latestUpdate);
  assert.deepEqual(project.displayProgress, {
    value: 72,
    source: "reported",
    label: "보고된 진척",
    done: null,
    total: null,
    partial: false,
  });
});

test("marks project progress partial when the capped task read is smaller than the exact aggregate", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.counts = { tasks: 161 };
  state.rows = {
    brands: [{ id: "brand-1", slug: "classmoon", name: "Class.Moon", status: "active", meta: {} }],
    projects: [{
      id: "project-1",
      brand_id: "brand-1",
      name: "부분 집계 프로젝트",
      status: "active",
      priority: "medium",
      progress: 80,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-17T00:00:00.000Z",
      meta: {},
    }],
    tasks: [{
      id: "task-1",
      project_id: "project-1",
      title: "보이는 완료 작업",
      status: "done",
      priority: "medium",
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    }],
  };

  const ledger = await operatingLedger.getProjectLedger();
  const project = ledger.projects[0];

  assert.deepEqual(ledger.taskAggregation, {
    loaded: 1,
    total: 161,
    partial: true,
  });
  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, []);
  assert.deepEqual(ledger.partialSources, ["tasks"]);
  assert.deepEqual(project.displayProgress, {
    value: null,
    source: "tasks",
    label: "작업 집계 일부",
    done: 1,
    total: 1,
    partial: true,
  });
  assert.equal(project.progress, null, "a partial task read must not expose a definitive percentage");
  assert.ok(
    state.calls.some((call) => call.kind === "count" && call.table === "tasks"),
    "the repository must request an exact task count to prove aggregate completeness",
  );
});

test("configured core ledger read failures are errors instead of preview", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 0 };
  state.rows = {
    brands: null,
    projects: [],
    tasks: [],
  };

  const ledger = await operatingLedger.getProjectLedger();

  assert.equal(ledger.source, "error");
  assert.equal(ledger.configured, true);
  assert.equal(ledger.error, "project-ledger-core-read-failed");
  assert.equal(ledger.partial, false);
  assert.deepEqual(ledger.failedSources, ["brands"]);
  assert.deepEqual(ledger.partialSources, []);
  assert.deepEqual(ledger.projects, []);
  assert.deepEqual(ledger.todos, []);
});

test("missing workspace or Supabase config remains an honest preview without reads", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.workspaceId = "";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };

  const missingWorkspace = await operatingLedger.getProjectLedger();
  assert.equal(missingWorkspace.source, "preview");
  assert.equal(missingWorkspace.configured, false);
  assert.equal(missingWorkspace.partial, false);
  assert.deepEqual(missingWorkspace.failedSources, []);
  assert.deepEqual(missingWorkspace.partialSources, []);
  assert.equal(state.calls.length, 0);

  state.workspaceId = "workspace-1";
  state.config = null;
  const missingConfig = await operatingLedger.getProjectLedger();
  assert.equal(missingConfig.source, "preview");
  assert.equal(missingConfig.configured, false);
  assert.equal(missingConfig.partial, false);
  assert.deepEqual(missingConfig.failedSources, []);
  assert.deepEqual(missingConfig.partialSources, []);
  assert.equal(state.calls.length, 0);
});

test("optional ledger read failures preserve core rows but mark the ledger partial", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 0 };
  state.rows = {
    brands: [],
    projects: [],
    tasks: [],
    project_updates: null,
    decisions: null,
    notes: null,
    routine_checks: null,
  };

  const ledger = await operatingLedger.getProjectLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, [
    "project_updates",
    "decisions",
    "notes",
    "routine_checks",
  ]);
  assert.deepEqual(ledger.partialSources, []);
  assert.deepEqual(ledger.updates, []);
  assert.deepEqual(ledger.decisions, []);
  assert.deepEqual(ledger.notes, []);
  assert.deepEqual(ledger.checks, []);
});

test("successful empty optional reads are live-empty rather than partial failures", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 0 };
  state.rows = {
    brands: [],
    projects: [],
    tasks: [],
    project_updates: [],
    decisions: [],
    notes: [],
    routine_checks: [],
  };

  const ledger = await operatingLedger.getProjectLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, false);
  assert.deepEqual(ledger.failedSources, []);
  assert.deepEqual(ledger.partialSources, []);
});

test("failed update evidence stays explicit while complete task evidence remains usable", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 2 };
  state.rows = {
    brands: [],
    projects: [
      {
        id: "project-reported-only",
        name: "보고 진척만 있는 프로젝트",
        status: "active",
        progress: 80,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-17T00:00:00.000Z",
      },
      {
        id: "project-task-evidence",
        name: "체크리스트 프로젝트",
        status: "active",
        progress: 90,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-17T00:00:00.000Z",
      },
    ],
    tasks: [
      { id: "task-1", project_id: "project-task-evidence", title: "완료", status: "done", priority: "medium" },
      { id: "task-2", project_id: "project-task-evidence", title: "남음", status: "todo", priority: "medium" },
    ],
    project_updates: null,
    decisions: [],
    notes: [],
    routine_checks: [],
  };

  const ledger = await operatingLedger.getProjectLedger();
  const reportedOnly = ledger.projects.find((project) => project.id === "project-reported-only");
  const taskEvidence = ledger.projects.find((project) => project.id === "project-task-evidence");

  assert.equal(reportedOnly.updateEvidencePartial, true);
  assert.equal(reportedOnly.displayProgress.value, null);
  assert.equal(reportedOnly.displayProgress.partial, true);
  assert.equal(taskEvidence.updateEvidencePartial, true);
  assert.equal(taskEvidence.displayProgress.value, 50);
  assert.equal(taskEvidence.displayProgress.partial, false);
  assert.equal(taskEvidence.displayProgress.evidencePartial, true);
});
