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

const guardStub = `
export function assertHubWriteAllowed() {
  return globalThis.__routineRouteTestState.guardResponse;
}
export async function readHubWriteJson(req) {
  try {
    return { data: await req.json() };
  } catch {
    return { error: new Response(JSON.stringify({ status: "invalid-json" }), { status: 400 }) };
  }
}
`;

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function withWorkspaceFilter(filters = []) {
  const workspaceId = globalThis.__routineRouteTestState.workspaceId;
  return workspaceId ? [["workspace_id", \`eq.\${workspaceId}\`], ...filters] : filters;
}
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__routineRouteTestState;
  state.readCalls.push({ table, options });
  if (table === "projects") return state.projects;
  if (table === "routine_checks") return state.checks;
  return [];
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() {
  return globalThis.__routineRouteTestState.workspaceId;
}
export function resolveSupabaseConfig() {
  return globalThis.__routineRouteTestState.configured
    ? { url: "https://supabase.example", apiKey: "test-key" }
    : null;
}
export function buildRoutineCheckRecord(payload) {
  return {
    workspace_id: globalThis.__routineRouteTestState.workspaceId || null,
    project_id: payload.projectId || null,
    check_type: payload.checkType,
    status: payload.status,
    note: payload.note || null,
    checked_at: "2026-07-17T03:00:00.000Z",
  };
}
export async function insertSupabaseRecord(table, record, options = {}) {
  const state = globalThis.__routineRouteTestState;
  state.insertCalls.push({ table, record, options });
  if (state.persistence) return state.persistence;
  return { persisted: true, reason: "ok", record: { id: "check-new", ...record } };
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: `data:text/javascript,${encodeURIComponent(nextServerStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/hub-write-guard") {
      return { url: `data:text/javascript,${encodeURIComponent(guardStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/server-read") {
      return { url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/server-write") {
      return { url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__routineRouteTestState = {};
const { POST } = await import("../app/api/routine/check/route.js?durable-rhythm-route-test");

beforeEach(() => {
  globalThis.__routineRouteTestState = {
    workspaceId: "workspace-1",
    configured: true,
    guardResponse: null,
    projects: [{ id: "project-1", name: "운영 OS" }],
    checks: [],
    persistence: null,
    readCalls: [],
    insertCalls: [],
  };
});

function request(body = {}) {
  return new Request("https://hub.example.com/api/routine/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validPayload(overrides = {}) {
  return {
    projectId: "project-1",
    ritualKey: "daily-focus",
    checkType: "morning",
    dateKey: "2026-07-17",
    name: "Daily focus",
    note: "오늘의 핵심 완료",
    status: "done",
    ...overrides,
  };
}

test("routine check route retains the Hub write guard", async () => {
  const state = globalThis.__routineRouteTestState;
  state.guardResponse = new Response(JSON.stringify({ status: "forbidden" }), { status: 403 });

  const response = await POST(request(validPayload()));

  assert.equal(response.status, 403);
  assert.equal(state.readCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test("unconfigured workspace or Supabase returns honest preview without persistence", async () => {
  const state = globalThis.__routineRouteTestState;
  state.workspaceId = null;
  const missingWorkspace = await POST(request(validPayload({ projectId: null })));
  assert.equal(missingWorkspace.status, 202);
  assert.equal((await missingWorkspace.json()).status, "preview");

  state.workspaceId = "workspace-1";
  state.configured = false;
  const missingSupabase = await POST(request(validPayload({ projectId: null })));
  assert.equal(missingSupabase.status, 202);
  assert.equal((await missingSupabase.json()).status, "preview");
  assert.equal(state.insertCalls.length, 0);
});

test("project relationship must resolve inside the configured workspace", async () => {
  const state = globalThis.__routineRouteTestState;
  state.projects = [];

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "invalid-input");
  assert.equal(body.error, "invalid-project-reference");
  assert.equal(state.insertCalls.length, 0);
  const call = state.readCalls.find((entry) => entry.table === "projects");
  assert.deepEqual(call.options.filters, [
    ["workspace_id", "eq.workspace-1"],
    ["id", "eq.project-1"],
  ]);
});

test("saved check persists normalized identity metadata and returns the durable row", async () => {
  const state = globalThis.__routineRouteTestState;
  state.persistence = {
    persisted: true,
    reason: "ok",
    record: {
      id: "check-new",
      workspace_id: "workspace-1",
      project_id: "project-1",
      check_type: "morning",
      status: "done",
      meta: {
        ritual_key: "daily-focus",
        name: "Daily focus",
        local_date: "2026-07-17",
      },
    },
  };

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.status, "saved");
  assert.equal(body.check.id, "check-new");
  assert.equal(state.insertCalls.length, 1);
  assert.deepEqual(state.insertCalls[0], {
    table: "routine_checks",
    record: {
      workspace_id: "workspace-1",
      project_id: "project-1",
      check_type: "morning",
      status: "done",
      note: "오늘의 핵심 완료",
      checked_at: "2026-07-17T03:00:00.000Z",
      meta: {
        ritual_key: "daily-focus",
        name: "Daily focus",
        local_date: "2026-07-17",
      },
    },
    options: { returnRepresentation: true, select: "*" },
  });
});

test("same workspace ritual and local date returns duplicate without a second insert", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checks = [{
    id: "check-existing",
    workspace_id: "workspace-1",
    project_id: "project-1",
    check_type: "morning",
    status: "done",
    meta: { ritual_key: "daily-focus", local_date: "2026-07-17" },
  }];

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "duplicate");
  assert.equal(body.check.id, "check-existing");
  assert.equal(state.insertCalls.length, 0);
  const call = state.readCalls.find((entry) => entry.table === "routine_checks");
  assert.deepEqual(call.options.filters, [
    ["workspace_id", "eq.workspace-1"],
    ["project_id", "eq.project-1"],
    ["meta->>ritual_key", "eq.daily-focus"],
    ["meta->>local_date", "eq.2026-07-17"],
    ["status", "eq.done"],
  ]);
});

test("unscoped ritual duplicate stays separate with an explicit null project filter", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checks = [{
    id: "check-unscoped",
    workspace_id: "workspace-1",
    project_id: null,
    check_type: "weekly",
    status: "done",
    meta: { ritual_key: "weekly-review", local_date: "2026-07-17" },
  }];

  const response = await POST(request(validPayload({
    projectId: null,
    ritualKey: "weekly-review",
    checkType: "weekly",
    name: "Weekly Review",
  })));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "duplicate");
  assert.equal(body.check.id, "check-unscoped");
  assert.equal(state.readCalls.some((entry) => entry.table === "projects"), false);
  const call = state.readCalls.find((entry) => entry.table === "routine_checks");
  assert.deepEqual(call.options.filters[1], ["project_id", "is.null"]);
  assert.equal(state.insertCalls.length, 0);
});

test("configured ledger read failures are explicit errors, never preview", async () => {
  const state = globalThis.__routineRouteTestState;
  state.projects = null;

  const projectReadFailure = await POST(request(validPayload()));
  assert.equal(projectReadFailure.status, 502);
  assert.equal((await projectReadFailure.json()).status, "error");

  state.projects = [{ id: "project-1", name: "운영 OS" }];
  state.checks = null;
  const duplicateReadFailure = await POST(request(validPayload()));
  const duplicateReadBody = await duplicateReadFailure.json();
  assert.equal(duplicateReadFailure.status, 502);
  assert.equal(duplicateReadBody.status, "error");
  assert.notEqual(duplicateReadBody.status, "preview");
  assert.equal(state.insertCalls.length, 0);
});

test("configured persistence failure is visibly unsaved", async () => {
  const state = globalThis.__routineRouteTestState;
  state.persistence = { persisted: false, reason: "http-500", detail: "database unavailable" };

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.equal(body.retryable, true);
  assert.match(body.error, /database unavailable|http-500/);
});
