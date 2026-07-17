import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function inFilter(values) { return \`in.(\${values.join(",")})\`; }
export function withWorkspaceFilter(filters = []) {
  const workspaceId = globalThis.__operatingLedgerTestState.workspaceId;
  return workspaceId ? [["workspace_id", eqFilter(workspaceId)], ...filters] : filters;
}
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__operatingLedgerTestState;
  state.calls.push({ kind: "fetch", table, options });
  if (Array.isArray(state.rowQueues?.[table]) && state.rowQueues[table].length > 0) {
    return state.rowQueues[table].shift();
  }
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
  rowQueues: {},
  rows: {},
  workspaceId: "workspace-1",
};

const operatingLedger = await import("./operating-ledger.js?operating-ledger-test");

beforeEach(() => {
  globalThis.__operatingLedgerTestState.rowQueues = {};
});

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

test("marks every bounded project slice partial when one extra row proves truncation", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 0 };
  state.rows = {
    brands: [],
    projects: Array.from({ length: 81 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `Project ${index + 1}`,
      status: "active",
      priority: "medium",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: `2026-07-17T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    })),
    tasks: [],
    project_updates: Array.from({ length: 121 }, (_, index) => ({
      id: `update-${index + 1}`,
      project_id: "project-1",
      title: `Update ${index + 1}`,
      happened_at: "2026-07-17T00:00:00.000Z",
    })),
    decisions: Array.from({ length: 81 }, (_, index) => ({
      id: `decision-${index + 1}`,
      title: `Decision ${index + 1}`,
      decided_at: "2026-07-17T00:00:00.000Z",
    })),
    notes: Array.from({ length: 81 }, (_, index) => ({
      id: `note-${index + 1}`,
      title: `Note ${index + 1}`,
      created_at: "2026-07-17T00:00:00.000Z",
    })),
    routine_checks: Array.from({ length: 81 }, (_, index) => ({
      id: `check-${index + 1}`,
      check_type: "morning",
      created_at: "2026-07-17T00:00:00.000Z",
    })),
  };

  const ledger = await operatingLedger.getProjectLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, []);
  assert.deepEqual(ledger.partialSources, [
    "projects",
    "project_updates",
    "decisions",
    "notes",
    "routine_checks",
  ]);
  assert.equal(ledger.projects.length, 80);
  assert.equal(ledger.updates.length, 120);
  assert.equal(ledger.decisions.length, 80);
  assert.equal(ledger.notes.length, 80);
  assert.equal(ledger.checks.length, 80);
  assert.equal(ledger.projects[0].updateEvidencePartial, true);
  assert.deepEqual(
    Object.fromEntries(
      state.calls
        .filter((call) => call.kind === "fetch")
        .map((call) => [call.table, call.options.limit]),
    ),
    {
      brands: undefined,
      projects: 81,
      tasks: 160,
      project_updates: 121,
      decisions: 81,
      notes: 81,
      routine_checks: 81,
      areas: undefined,
      leads: 160,
      customer_accounts: 80,
    },
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

test("an unavailable Area catalog degrades create capability without erasing core projects", async () => {
  const state = globalThis.__operatingLedgerTestState;
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 0 };
  state.rows = {
    brands: [],
    projects: [{
      id: "project-1",
      name: "Readable project",
      status: "active",
      priority: "medium",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-17T00:00:00.000Z",
    }],
    tasks: [],
    project_updates: [],
    decisions: [],
    notes: [],
    routine_checks: [],
    areas: null,
    leads: [],
    customer_accounts: [],
  };

  const ledger = await operatingLedger.getProjectLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, ["areas"]);
  assert.equal(ledger.projects.length, 1);
  assert.deepEqual(ledger.areas, []);
});

test("unavailable Lead and Account catalogs stay named instead of becoming live-empty selectors", async () => {
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
    areas: [{ id: "area-1", name: "영업", slug: "sales", status: "active" }],
    leads: null,
    customer_accounts: null,
  };

  const ledger = await operatingLedger.getProjectLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.failedSources, ["leads", "customer_accounts"]);
  assert.equal(ledger.areas.length, 1);
  assert.deepEqual(ledger.projectEntities, []);
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

test("merges an exact workspace-scoped selected project and its detail rows beyond global caps", async () => {
  const state = globalThis.__operatingLedgerTestState;
  const selectedProjectId = "99999999-9999-4999-8999-999999999999";
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 200 };
  state.rows = {
    brands: [{ id: "brand-1", slug: "classmoon", name: "Class.Moon", status: "active", meta: {} }],
  };
  state.rowQueues = {
    projects: [
      Array.from({ length: 81 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        brand_id: "brand-1",
        name: `Bounded ${index + 1}`,
        status: "active",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-17T00:00:00.000Z",
      })),
      [{
        id: selectedProjectId,
        brand_id: "brand-1",
        name: "Exact selected",
        status: "blocked",
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      }],
    ],
    tasks: [[], [{ id: "task-selected", project_id: selectedProjectId, title: "Selected task", status: "todo", priority: "high" }]],
    project_updates: [
      Array.from({ length: 121 }, (_, index) => ({
        id: `update-global-${index + 1}`,
        project_id: "00000000-0000-4000-8000-000000000001",
        title: `Global update ${index + 1}`,
        happened_at: "2026-07-17T00:00:00.000Z",
      })),
      [{ id: "update-selected", project_id: selectedProjectId, title: "Selected update", happened_at: "2026-07-17T00:00:00.000Z" }],
    ],
    decisions: [[], [{ id: "decision-selected", project_id: selectedProjectId, title: "Selected decision", decided_at: "2026-07-17T00:00:00.000Z" }]],
    notes: [[], [{ id: "note-selected", project_id: selectedProjectId, title: "Selected note", created_at: "2026-07-17T00:00:00.000Z" }]],
    routine_checks: [[], [{ id: "check-selected", project_id: selectedProjectId, check_type: "morning", created_at: "2026-07-17T00:00:00.000Z" }]],
  };

  const ledger = await operatingLedger.getProjectLedger({ projectId: selectedProjectId });

  assert.equal(ledger.projects.length, 81, "the exact project is appended without making the bounded slice complete");
  assert.equal(ledger.projects.some((project) => project.id === selectedProjectId), true);
  assert.equal(ledger.todos.some((todo) => todo.project === selectedProjectId), true);
  assert.equal(ledger.updates.some((update) => update.projectId === selectedProjectId), true);
  assert.equal(ledger.decisions.some((decision) => decision.projectId === selectedProjectId), true);
  assert.equal(ledger.notes.some((note) => note.projectId === selectedProjectId), true);
  assert.equal(ledger.checks.some((check) => check.projectId === selectedProjectId), true);
  const selectedProject = ledger.projects.find((project) => project.id === selectedProjectId);
  assert.equal(selectedProject.tasksPartial, false, "the exact selected task slice is complete even when the global task slice is partial");
  assert.equal(selectedProject.updateEvidencePartial, false, "the exact selected update slice is complete even when global updates are capped");
  assert.deepEqual(ledger.selection, {
    projectId: selectedProjectId,
    found: true,
    failedSources: [],
    partialSources: [],
  });
  assert.equal(ledger.partial, true);
  assert.equal(ledger.partialSources.includes("projects"), true);
  assert.equal(ledger.partialSources.includes("tasks"), true);
  assert.equal(ledger.partialSources.includes("project_updates"), true);

  const exactCalls = state.calls.filter((call) =>
    call.kind === "fetch"
    && call.options.filters?.some(([key, value]) => key === "project_id" || (key === "id" && value === `eq.${selectedProjectId}`)),
  );
  assert.equal(exactCalls.length, 6);
  for (const call of exactCalls) {
    assert.deepEqual(call.options.filters[0], ["workspace_id", "eq.workspace-1"]);
  }
});

test("deduplicates exact selected rows already present in the bounded reads", async () => {
  const state = globalThis.__operatingLedgerTestState;
  const selectedProjectId = "88888888-8888-4888-8888-888888888888";
  const projectRow = {
    id: selectedProjectId,
    name: "Already visible",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  };
  const taskRow = { id: "task-visible", project_id: selectedProjectId, title: "Visible task", status: "todo", priority: "medium" };
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 1 };
  state.rows = { brands: [] };
  state.rowQueues = {
    projects: [[projectRow], [projectRow]],
    tasks: [[taskRow], [taskRow]],
    project_updates: [[], []],
    decisions: [[], []],
    notes: [[], []],
    routine_checks: [[], []],
  };

  const ledger = await operatingLedger.getProjectLedger({ projectId: selectedProjectId });

  assert.equal(ledger.projects.filter((project) => project.id === selectedProjectId).length, 1);
  assert.equal(ledger.todos.filter((todo) => todo.id === taskRow.id).length, 1);
  assert.equal(
    state.calls.filter((call) => call.kind === "fetch" && call.options.filters?.some(([, value]) => value === `eq.${selectedProjectId}`)).length,
    6,
    "the selected project and each detail source must still be queried exactly before deduplication",
  );
});

test("keeps an exact selected optional-source failure distinct from a proven empty detail", async () => {
  const state = globalThis.__operatingLedgerTestState;
  const selectedProjectId = "77777777-7777-4777-8777-777777777777";
  const projectRow = {
    id: selectedProjectId,
    name: "Selected with failed notes",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  };
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 0 };
  state.rows = { brands: [] };
  state.rowQueues = {
    projects: [[projectRow], [projectRow]],
    tasks: [[], []],
    project_updates: [[], []],
    decisions: [[], []],
    notes: [[], null],
    routine_checks: [[], []],
  };

  const ledger = await operatingLedger.getProjectLedger({ projectId: selectedProjectId });

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.selection.failedSources, ["notes"]);
  assert.equal(ledger.failedSources.includes("notes"), true);
  assert.deepEqual(ledger.notes, []);
});

test("marks a capped exact selected detail source partial instead of complete", async () => {
  const state = globalThis.__operatingLedgerTestState;
  const selectedProjectId = "66666666-6666-4666-8666-666666666666";
  const projectRow = {
    id: selectedProjectId,
    name: "Selected with capped notes",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  };
  state.calls = [];
  state.workspaceId = "workspace-1";
  state.config = { url: "https://supabase.example.com", apiKey: "test-key" };
  state.counts = { tasks: 0 };
  state.rows = { brands: [] };
  state.rowQueues = {
    projects: [[projectRow], [projectRow]],
    tasks: [[], []],
    project_updates: [[], []],
    decisions: [[], []],
    notes: [[], Array.from({ length: 81 }, (_, index) => ({
      id: `selected-note-${index + 1}`,
      project_id: selectedProjectId,
      title: `Selected note ${index + 1}`,
      created_at: "2026-07-17T00:00:00.000Z",
    }))],
    routine_checks: [[], []],
  };

  const ledger = await operatingLedger.getProjectLedger({ projectId: selectedProjectId });

  assert.equal(ledger.partial, true);
  assert.deepEqual(ledger.selection.partialSources, ["notes"]);
  assert.equal(ledger.partialSources.includes("notes"), true);
  assert.equal(ledger.notes.filter((note) => note.projectId === selectedProjectId).length, 80);
});
