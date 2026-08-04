import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const LIVE_SEED_PROJECT_ID = "33333333-3333-3333-3333-333333333331";

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
  if (table === "workspaces") return state.workspaces;
  if (table === "routine_checks") {
    let rows;
    if (Array.isArray(state.checksSequence) && state.checksSequence.length > 0) {
      rows = state.checksSequence.shift();
    } else {
      rows = state.checks;
    }
    if (!state.applyRoutineFilters || !Array.isArray(rows)) return rows;
    return rows.filter((row) => (options.filters || []).every(([key, value]) => {
      const raw = String(value || "");
      const expected = raw.startsWith("eq.") ? raw.slice(3) : null;
      if (key.startsWith("meta->>")) {
        const metaKey = key.slice("meta->>".length);
        if (raw === "is.null") return row.meta?.[metaKey] == null;
        return String(row.meta?.[metaKey] || "") === expected;
      }
      if (["project_id", "check_type", "status", "idempotency_key"].includes(key)) {
        if (raw === "is.null") return row[key] == null;
        return String(row[key] ?? "") === expected;
      }
      return true;
    }));
  }
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
    checked_at: globalThis.__routineRouteTestState.checkedAt,
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
    workspaceId: WORKSPACE_ID,
    configured: true,
    guardResponse: null,
    projects: [{ id: PROJECT_ID, name: "운영 OS" }],
    workspaces: [{ id: WORKSPACE_ID, timezone: "Asia/Seoul" }],
    checks: [],
    checksSequence: null,
    applyRoutineFilters: false,
    checkedAt: "2026-07-17T03:00:00.000Z",
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
    projectId: PROJECT_ID,
    ritualKey: "daily-focus",
    checkType: "morning",
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

test("routine check rejects a non-UUID project before any Supabase read", async () => {
  const state = globalThis.__routineRouteTestState;

  const response = await POST(request(validPayload({ projectId: "project-1" })));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "invalid-input");
  assert.equal(body.error, "invalid-project-id");
  assert.equal(state.readCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test("routine check accepts the PostgreSQL UUID shape used by live seed projects", async () => {
  const state = globalThis.__routineRouteTestState;
  state.projects = [{ id: LIVE_SEED_PROJECT_ID, name: "Seed project" }];

  const response = await POST(request(validPayload({ projectId: LIVE_SEED_PROJECT_ID })));

  assert.equal(response.status, 201);
  assert.equal(state.insertCalls.length, 1);
});

test("unconfigured workspace or Supabase returns honest preview without persistence", async () => {
  const state = globalThis.__routineRouteTestState;
  state.workspaceId = null;
  const missingWorkspace = await POST(request(validPayload({ projectId: null })));
  assert.equal(missingWorkspace.status, 202);
  assert.equal((await missingWorkspace.json()).status, "preview");

  state.workspaceId = WORKSPACE_ID;
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
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["id", `eq.${PROJECT_ID}`],
  ]);
});

test("saved check persists normalized identity metadata and returns the durable row", async () => {
  const state = globalThis.__routineRouteTestState;
  state.persistence = {
    persisted: true,
    reason: "ok",
    record: {
      id: "check-new",
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
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
  assert.equal(body.dateKey, "2026-07-17");
  assert.equal(body.localDate, "2026-07-17");
  assert.equal(body.check.id, "check-new");
  assert.equal(state.insertCalls.length, 1);
  const insert = state.insertCalls[0];
  assert.equal(insert.table, "routine_checks");
  assert.match(insert.record.idempotency_key, /^routine-check:v1:[a-f0-9]{64}$/);
  assert.deepEqual(insert.record, {
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    check_type: "morning",
    status: "done",
    note: "오늘의 핵심 완료",
    checked_at: "2026-07-17T03:00:00.000Z",
    idempotency_key: insert.record.idempotency_key,
    meta: {
      ritual_key: "daily-focus",
      name: "Daily focus",
      local_date: "2026-07-17",
    },
  });
  assert.deepEqual(insert.options, { returnRepresentation: true, select: "*" });
});

test("idempotency identity is deterministic for the tuple and changes with the local date", async () => {
  const state = globalThis.__routineRouteTestState;

  const first = await POST(request(validPayload()));
  const retry = await POST(request(validPayload()));
  state.checkedAt = "2026-07-18T03:00:00.000Z";
  const nextDate = await POST(request(validPayload()));
  const unscoped = await POST(request(validPayload({ projectId: null })));

  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(nextDate.status, 201);
  assert.equal(unscoped.status, 201);
  assert.equal(state.insertCalls[0].record.idempotency_key, state.insertCalls[1].record.idempotency_key);
  assert.notEqual(state.insertCalls[1].record.idempotency_key, state.insertCalls[2].record.idempotency_key);
  assert.notEqual(state.insertCalls[1].record.idempotency_key, state.insertCalls[3].record.idempotency_key);
});

test("workspace-local date is server-authoritative when the browser date disagrees", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checkedAt = "2026-07-16T15:30:00.000Z";

  const first = await POST(request(validPayload({ dateKey: "2026-07-16" })));
  const retry = await POST(request(validPayload({ dateKey: "not-a-date" })));
  const firstBody = await first.json();
  const retryBody = await retry.json();

  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(firstBody.dateKey, "2026-07-17");
  assert.equal(firstBody.localDate, "2026-07-17");
  assert.equal(retryBody.dateKey, "2026-07-17");
  assert.equal(state.insertCalls[0].record.meta.local_date, "2026-07-17");
  assert.equal(state.insertCalls[0].record.idempotency_key, state.insertCalls[1].record.idempotency_key);
});

test("workspace timezone lookup failures stop the configured write", async () => {
  const state = globalThis.__routineRouteTestState;

  state.workspaces = null;
  const failedRead = await POST(request(validPayload()));
  assert.equal(failedRead.status, 502);
  assert.equal((await failedRead.json()).status, "error");

  state.workspaces = [];
  const missingWorkspace = await POST(request(validPayload()));
  assert.equal(missingWorkspace.status, 502);
  assert.equal((await missingWorkspace.json()).status, "error");
  assert.equal(state.insertCalls.length, 0);
});

test("null workspace timezone falls back to Seoul only after the workspace row is read", async () => {
  const state = globalThis.__routineRouteTestState;
  state.workspaces = [{ id: WORKSPACE_ID, timezone: null }];
  state.checkedAt = "2026-07-16T15:30:00.000Z";

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.dateKey, "2026-07-17");
  assert.equal(state.insertCalls.length, 1);
});

test("same workspace ritual and local date returns duplicate without a second insert", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checks = [{
    id: "check-existing",
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    check_type: "morning",
    status: "done",
    idempotency_key: "routine-check:v1:existing",
    meta: { ritual_key: "daily-focus", local_date: "2026-07-17" },
  }];

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "duplicate");
  assert.equal(body.dateKey, "2026-07-17");
  assert.equal(body.localDate, "2026-07-17");
  assert.equal(body.check.id, "check-existing");
  assert.equal(state.insertCalls.length, 0);
  const call = state.readCalls.find((entry) => entry.table === "routine_checks");
  assert.deepEqual(call.options.filters[0], ["workspace_id", `eq.${WORKSPACE_ID}`]);
  assert.equal(call.options.filters[1][0], "idempotency_key");
  assert.match(call.options.filters[1][1], /^eq\.routine-check:v1:[a-f0-9]{64}$/);
});

test("unscoped ritual duplicate stays separate with an explicit null project filter", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checks = [{
    id: "check-unscoped",
    workspace_id: WORKSPACE_ID,
    project_id: null,
    check_type: "weekly",
    status: "done",
    idempotency_key: "routine-check:v1:unscoped",
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
  assert.equal(call.options.filters[1][0], "idempotency_key");
  assert.match(call.options.filters[1][1], /^eq\.routine-check:v1:[a-f0-9]{64}$/);
  assert.equal(state.insertCalls.length, 0);
});

test("project-bound legacy NULL-key check is returned as duplicate before insert", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checksSequence = [
    [],
    [{
      id: "check-legacy-project",
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
      check_type: "morning",
      status: "done",
      idempotency_key: null,
      meta: { ritual_key: "daily-focus", local_date: "2026-07-17" },
    }],
  ];

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "duplicate");
  assert.equal(body.check.id, "check-legacy-project");
  assert.equal(state.insertCalls.length, 0);
  const routineReads = state.readCalls.filter((entry) => entry.table === "routine_checks");
  assert.equal(routineReads.length, 2);
  assert.deepEqual(routineReads[1].options.filters, [
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["project_id", `eq.${PROJECT_ID}`],
    ["meta->>ritual_key", "eq.daily-focus"],
    ["status", "eq.done"],
    ["idempotency_key", "is.null"],
    ["checked_at", "gte.2026-07-16T00:00:00.000Z"],
    ["checked_at", "lt.2026-07-19T00:00:00.000Z"],
  ]);
});

for (const [metaField, ritualKey] of [
  ["ritual_key", "daily-focus"],
  ["key", "daily-focus"],
  ["name", "Daily Focus"],
]) {
  test(`explicit legacy meta.${metaField} dedupes even when check_type changes`, async () => {
    const state = globalThis.__routineRouteTestState;
    state.applyRoutineFilters = true;
    state.checks = [{
      id: `check-explicit-${metaField}`,
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
      check_type: "midday",
      status: "done",
      idempotency_key: null,
      checked_at: "2026-07-16T15:05:00.000Z",
      meta: { [metaField]: ritualKey },
    }];

    const response = await POST(request(validPayload({
      ritualKey,
      checkType: "morning",
      name: ritualKey,
    })));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "duplicate");
    assert.equal(body.check.id, `check-explicit-${metaField}`);
    assert.equal(state.insertCalls.length, 0);
    const semanticRead = state.readCalls.find((entry) => (
      entry.table === "routine_checks"
      && entry.options.filters.some(([key]) => key === `meta->>${metaField}`)
    ));
    assert.ok(semanticRead);
    assert.equal(semanticRead.options.limit, 101);
    assert.equal(
      semanticRead.options.filters.some(([key]) => key === "check_type"),
      false,
    );
  });
}

test("meta-less legacy rows never dedupe through an unrelated check_type", async () => {
  const state = globalThis.__routineRouteTestState;
  state.applyRoutineFilters = true;
  state.checks = [{
    id: "check-meta-less-midday",
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    check_type: "midday",
    status: "done",
    idempotency_key: null,
    checked_at: "2026-07-17T03:00:00.000Z",
    meta: {},
  }];

  const response = await POST(request(validPayload({
    ritualKey: "midday",
    checkType: "morning",
  })));

  assert.equal(response.status, 201);
  assert.equal(state.insertCalls.length, 1);
  const legacyReads = state.readCalls.filter((entry) => (
    entry.table === "routine_checks"
    && entry.options.filters.some(([key]) => key === "idempotency_key")
    && entry.options.filters.some(([, value]) => value === "is.null")
  ));
  assert.equal(legacyReads.at(-1).options.limit, 101);
  assert.deepEqual(
    legacyReads.at(-1).options.filters.find(([key]) => key === "check_type"),
    ["check_type", "eq.morning"],
  );
});

test("seed-style legacy check without meta dedupes by check_type and workspace-local date", async () => {
  const state = globalThis.__routineRouteTestState;
  state.projects = [{ id: LIVE_SEED_PROJECT_ID, name: "Seed project" }];
  state.applyRoutineFilters = true;
  state.checks = [
      {
        id: "check-unrelated-evening",
        workspace_id: WORKSPACE_ID,
        project_id: LIVE_SEED_PROJECT_ID,
        check_type: "evening",
        status: "done",
        idempotency_key: null,
        checked_at: "2026-07-16T15:03:00.000Z",
        meta: {},
      },
      {
        id: "check-seed-morning",
        workspace_id: WORKSPACE_ID,
        project_id: LIVE_SEED_PROJECT_ID,
        check_type: "morning",
        status: "done",
        idempotency_key: null,
        checked_at: "2026-07-16T15:05:00.000Z",
        meta: {},
      },
  ];

  const response = await POST(request(validPayload({
    projectId: LIVE_SEED_PROJECT_ID,
    ritualKey: "morning",
    name: "Morning check · 07:00",
  })));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "duplicate");
  assert.equal(body.check.id, "check-seed-morning");
  assert.equal(state.insertCalls.length, 0);
  const workspaceRead = state.readCalls.find((entry) => entry.table === "workspaces");
  assert.deepEqual(workspaceRead.options.filters, [["id", `eq.${WORKSPACE_ID}`]]);
  const legacyRead = state.readCalls.find((entry) => (
    entry.table === "routine_checks"
    && entry.options.filters.some(([key]) => key === "check_type")
  ));
  assert.equal(legacyRead.options.limit, 101);
  assert.deepEqual(legacyRead.options.filters.slice(0, 3), [
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["project_id", `eq.${LIVE_SEED_PROJECT_ID}`],
    ["check_type", "eq.morning"],
  ]);
});

test("unscoped legacy NULL-key check uses null project semantics before insert", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checksSequence = [
    [],
    [{
      id: "check-legacy-unscoped",
      workspace_id: WORKSPACE_ID,
      project_id: null,
      check_type: "weekly",
      status: "done",
      idempotency_key: null,
      meta: { ritual_key: "weekly-review", local_date: "2026-07-17" },
    }],
  ];

  const response = await POST(request(validPayload({
    projectId: null,
    ritualKey: "weekly-review",
    checkType: "weekly",
    name: "Weekly Review",
  })));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "duplicate");
  assert.equal(body.check.id, "check-legacy-unscoped");
  assert.equal(state.insertCalls.length, 0);
  const routineReads = state.readCalls.filter((entry) => entry.table === "routine_checks");
  assert.deepEqual(routineReads[1].options.filters, [
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["project_id", "is.null"],
    ["meta->>ritual_key", "eq.weekly-review"],
    ["status", "eq.done"],
    ["idempotency_key", "is.null"],
    ["checked_at", "gte.2026-07-16T00:00:00.000Z"],
    ["checked_at", "lt.2026-07-19T00:00:00.000Z"],
  ]);
});

test("legacy candidate overflow never inserts when a duplicate could be the 101st row", async () => {
  const state = globalThis.__routineRouteTestState;
  const unrelated = Array.from({ length: 100 }, (_, index) => ({
    id: `legacy-unrelated-${index}`,
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    check_type: "morning",
    status: "done",
    idempotency_key: null,
    checked_at: "2026-07-17T02:00:00.000Z",
    meta: { ritual_key: `other-${index}`, local_date: "2026-07-17" },
  }));
  state.checksSequence = [
    [],
    [...unrelated, {
      id: "legacy-duplicate-101",
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
      check_type: "morning",
      status: "done",
      idempotency_key: null,
      checked_at: "2026-07-17T01:00:00.000Z",
      meta: { ritual_key: "daily-focus", local_date: "2026-07-17" },
    }],
  ];

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.equal(body.error, "legacy-candidate-overflow");
  assert.equal(body.retryable, true);
  assert.equal(state.insertCalls.length, 0);
  const legacyRead = state.readCalls.filter((entry) => entry.table === "routine_checks")[1];
  assert.equal(legacyRead.options.limit, 101);
});

test("meta-less seed candidate overflow also fails closed without insert", async () => {
  const state = globalThis.__routineRouteTestState;
  state.applyRoutineFilters = true;
  state.checks = Array.from({ length: 101 }, (_, index) => ({
    id: `seed-overflow-${index}`,
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    check_type: "morning",
    status: "done",
    idempotency_key: null,
    checked_at: "2026-07-17T02:00:00.000Z",
    meta: {},
  }));

  const response = await POST(request(validPayload({ ritualKey: "morning" })));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error, "legacy-candidate-overflow");
  assert.equal(state.insertCalls.length, 0);
});

test("legacy fallback lookup failure is an honest error and never inserts", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checksSequence = [[], null];

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.match(body.error, /routine_checks ledger read failed/);
  assert.equal(state.insertCalls.length, 0);
  assert.equal(state.readCalls.filter((entry) => entry.table === "routine_checks").length, 2);
});

test("unique idempotency race re-reads the winning check as duplicate", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checksSequence = [
    [],
    [],
    [],
    [],
    [],
    [{
      id: "check-winner",
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
      check_type: "morning",
      status: "done",
      idempotency_key: "routine-check:v1:winner",
      meta: { ritual_key: "daily-focus", local_date: "2026-07-17" },
    }],
  ];
  state.persistence = {
    persisted: false,
    reason: "http-409",
    detail: "duplicate key value violates unique constraint routine_checks_workspace_idempotency_key_uidx (23505)",
  };

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "duplicate");
  assert.equal(body.check.id, "check-winner");
  assert.equal(state.insertCalls.length, 1);
  const routineReads = state.readCalls.filter((entry) => entry.table === "routine_checks");
  assert.equal(routineReads.length, 6);
  assert.deepEqual(routineReads[1].options.filters, [
    ["workspace_id", `eq.${WORKSPACE_ID}`],
    ["project_id", `eq.${PROJECT_ID}`],
    ["meta->>ritual_key", "eq.daily-focus"],
    ["status", "eq.done"],
    ["idempotency_key", "is.null"],
    ["checked_at", "gte.2026-07-16T00:00:00.000Z"],
    ["checked_at", "lt.2026-07-19T00:00:00.000Z"],
  ]);
  for (const read of [routineReads[0], routineReads[5]]) {
    assert.deepEqual(read.options.filters, [
      ["workspace_id", `eq.${WORKSPACE_ID}`],
      ["idempotency_key", `eq.${state.insertCalls[0].record.idempotency_key}`],
    ]);
  }
});

test("an unrelated HTTP 409 never triggers idempotency winner reread", async () => {
  const state = globalThis.__routineRouteTestState;
  state.checksSequence = [[], []];
  state.persistence = {
    persisted: false,
    reason: "http-409",
    detail: "23505 duplicate key on a_different_unique_index",
  };

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.match(body.error, /a_different_unique_index/);
  assert.equal(state.readCalls.filter((entry) => entry.table === "routine_checks").length, 5);
});

test("configured ledger read failures are explicit errors, never preview", async () => {
  const state = globalThis.__routineRouteTestState;
  state.projects = null;

  const projectReadFailure = await POST(request(validPayload()));
  assert.equal(projectReadFailure.status, 502);
  assert.equal((await projectReadFailure.json()).status, "error");

  state.projects = [{ id: PROJECT_ID, name: "운영 OS" }];
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
