import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  SupabaseRpcError,
  callSupabaseRpc,
} from "./supabase-rest.ts";
import {
  executeCreateTaskCommand,
  executeQuickCaptureCommand,
  executeUpdateTaskCommand,
} from "./commands/task-command.ts";

const ORIGINAL_ENV = { ...process.env };
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ENTITY_ID = "44444444-4444-4444-8444-444444444444";
const EXPECTED_UPDATED_AT = "2026-07-13T04:00:00.000Z";

const canonicalTask = {
  id: TASK_ID,
  workspace_id: WORKSPACE_ID,
  title: "견적 후속 연락",
  status: "todo",
  priority: "high",
  due_at: "2026-07-14T00:00:00.000Z",
  due_precision: "date",
  meta: {
    due_precision: "date",
    entity_ref: { type: "deal", id: ENTITY_ID },
  },
  project: { id: PROJECT_ID, name: "ClassIn 영업" },
  owner: { id: "55555555-5555-4555-8555-555555555555" },
  next_action: "카카오톡 발송",
  created_at: "2026-07-13T03:00:00.000Z",
  updated_at: EXPECTED_UPDATED_AT,
  completed_at: null,
  started_at: null,
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("create command validates and forwards only canonical task input", async () => {
  let called;
  const result = await executeCreateTaskCommand({
    workspaceId: WORKSPACE_ID,
    idempotencyKey: "task:create:one",
    correlationId: "corr-create",
    input: {
      title: "  견적 후속 연락  ",
      status: "todo",
      priority: "high",
      dueAt: "2026-07-14T00:00:00.000Z",
      duePrecision: "date",
      projectId: PROJECT_ID,
      entityRef: { type: "deal", id: ENTITY_ID },
      nextAction: "카카오톡 발송",
      workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
    callRpc: async (name, args) => {
      called = { name, args };
      return { result: "saved", task: canonicalTask };
    },
  });

  assert.deepEqual(called, {
    name: "create_task_v1",
    args: {
      p_workspace_id: WORKSPACE_ID,
      p_idempotency_key: "task:create:one",
      p_payload: {
        title: "견적 후속 연락",
        status: "todo",
        priority: "high",
        dueAt: "2026-07-14T00:00:00.000Z",
        duePrecision: "date",
        projectId: PROJECT_ID,
        entityRef: { type: "deal", id: ENTITY_ID },
        nextAction: "카카오톡 발송",
      },
    },
  });
  assert.equal(result.httpStatus, 201);
  assert.deepEqual(result.body, {
    status: "saved",
    task: canonicalTask,
    retryable: false,
    correlationId: "corr-create",
  });
});

test("create and update commands map duplicate and conflict results without losing the current task", async () => {
  const duplicate = await executeCreateTaskCommand({
    workspaceId: WORKSPACE_ID,
    idempotencyKey: "task:duplicate",
    correlationId: "corr-duplicate",
    input: { title: "견적 후속 연락" },
    callRpc: async () => ({ result: "duplicate", task: canonicalTask }),
  });
  assert.equal(duplicate.httpStatus, 200);
  assert.equal(duplicate.body.status, "duplicate");
  assert.equal(duplicate.body.task, canonicalTask);

  const stale = await executeUpdateTaskCommand({
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    idempotencyKey: "task:stale",
    expectedUpdatedAt: EXPECTED_UPDATED_AT,
    correlationId: "corr-stale",
    input: { status: "done" },
    callRpc: async () => ({ result: "conflict", reason: "stale-write", task: canonicalTask }),
  });
  assert.equal(stale.httpStatus, 409);
  assert.deepEqual(stale.body, {
    status: "conflict",
    reason: "stale-write",
    task: canonicalTask,
    retryable: false,
    correlationId: "corr-stale",
  });

  const reused = await executeCreateTaskCommand({
    workspaceId: WORKSPACE_ID,
    idempotencyKey: "task:reused",
    correlationId: "corr-reused",
    input: { title: "다른 요청" },
    callRpc: async () => ({ result: "conflict", reason: "idempotency-key-reused" }),
  });
  assert.equal(reused.httpStatus, 409);
  assert.equal(reused.body.reason, "idempotency-key-reused");
});

test("update command forwards OCC input and maps a durable save to HTTP 200", async () => {
  let called;
  const result = await executeUpdateTaskCommand({
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    idempotencyKey: "task:update:one",
    expectedUpdatedAt: EXPECTED_UPDATED_AT,
    correlationId: "corr-update",
    input: { status: "doing", priority: "critical" },
    callRpc: async (name, args) => {
      called = { name, args };
      return { result: "saved", task: { ...canonicalTask, status: "doing" } };
    },
  });

  assert.deepEqual(called, {
    name: "update_task_v1",
    args: {
      p_workspace_id: WORKSPACE_ID,
      p_task_id: TASK_ID,
      p_idempotency_key: "task:update:one",
      p_expected_updated_at: EXPECTED_UPDATED_AT,
      p_payload: { status: "doing", priority: "critical" },
    },
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.status, "saved");
});

test("commands reject malformed task input before invoking RPC", async () => {
  const invalidCases = [
    { workspaceId: "not-a-uuid", idempotencyKey: "key", input: { title: "ok" } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "", input: { title: "ok" } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: null },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: { title: " " } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: { title: "ok", status: "later" } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: { title: "ok", priority: "urgent" } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: { title: "ok", dueAt: "bad-date" } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: { title: "ok", duePrecision: "date" } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: { title: "ok", projectId: "bad" } },
    { workspaceId: WORKSPACE_ID, idempotencyKey: "key", input: { title: "ok", entityRef: { type: "account", id: ENTITY_ID } } },
  ];

  for (const invalid of invalidCases) {
    let calls = 0;
    const result = await executeCreateTaskCommand({
      ...invalid,
      correlationId: "corr-invalid",
      callRpc: async () => {
        calls += 1;
        return { result: "saved", task: canonicalTask };
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.httpStatus, 400);
    assert.equal(result.body.status, "failed");
    assert.equal(result.body.retryable, false);
  }
});

test("command errors map missing rows, missing config, timeout, and upstream failure honestly", async () => {
  const cases = [
    [new SupabaseRpcError("not-found", "task missing", { metadata: { code: "P0002" } }), 404, "not-found", false],
    [new SupabaseRpcError("missing-config", "service role missing"), 503, "missing-config", false],
    [new SupabaseRpcError("timeout", "rpc timed out"), 504, "timeout", true],
    [new SupabaseRpcError("upstream", "supabase failed", { httpStatus: 500 }), 502, "upstream", true],
  ];

  for (const [error, httpStatus, reason, retryable] of cases) {
    const result = await executeCreateTaskCommand({
      workspaceId: WORKSPACE_ID,
      idempotencyKey: `task:${reason}`,
      correlationId: `corr-${reason}`,
      input: { title: "견적 후속 연락" },
      callRpc: async () => {
        throw error;
      },
    });
    assert.equal(result.httpStatus, httpStatus);
    assert.equal(result.body.reason, reason);
    assert.equal(result.body.retryable, retryable);
    assert.equal(result.body.status, reason === "missing-config" ? "degraded" : "failed");
    assert.deepEqual(result.body.metadata, error.metadata || undefined);
  }
});

test("quick capture routes task through create and preserves inbox classifier fields", async () => {
  const calls = [];
  const taskResult = await executeQuickCaptureCommand({
    workspaceId: WORKSPACE_ID,
    idempotencyKey: "capture:task",
    correlationId: "corr-capture-task",
    input: {
      destination: "task",
      raw: "  견적 후속 연락  ",
      priority: "high",
      entityRef: { type: "deal", id: ENTITY_ID },
    },
    callRpc: async (name, args) => {
      calls.push({ name, args });
      return { result: "saved", task: canonicalTask };
    },
  });
  assert.equal(taskResult.httpStatus, 201);
  assert.equal(calls[0].name, "create_task_v1");
  assert.deepEqual(calls[0].args.p_payload, {
    title: "견적 후속 연락",
    status: "inbox",
    priority: "high",
    duePrecision: "none",
    entityRef: { type: "deal", id: ENTITY_ID },
  });

  const inboxResult = await executeQuickCaptureCommand({
    workspaceId: WORKSPACE_ID,
    idempotencyKey: "capture:inbox",
    correlationId: "corr-capture-inbox",
    input: {
      destination: "inbox",
      raw: "  원장님은 가격을 먼저 궁금해함  ",
      kind: "customer",
      persona: "sales",
      summary: "가격 관심 고객",
    },
    callRpc: async (name, args) => {
      calls.push({ name, args });
      return { result: "saved", work_order: { id: "66666666-6666-4666-8666-666666666666" } };
    },
  });
  assert.equal(inboxResult.httpStatus, 201);
  assert.deepEqual(calls[1], {
    name: "capture_quick_input_v1",
    args: {
      p_workspace_id: WORKSPACE_ID,
      p_idempotency_key: "capture:inbox",
      p_payload: {
        raw: "원장님은 가격을 먼저 궁금해함",
        kind: "customer",
        persona: "sales",
        summary: "가격 관심 고객",
      },
    },
  });
  assert.equal(inboxResult.body.status, "saved");
});

test("RPC transport requires service-role credentials and never falls back to anon", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_ANON_KEY = "anon-key";

  await assert.rejects(
    () => callSupabaseRpc("create_task_v1", {}),
    (error) => error instanceof SupabaseRpcError && error.reason === "missing-config",
  );
});

test("RPC transport sends service-role RPC requests and preserves JSON error metadata", async () => {
  process.env.SUPABASE_URL = "https://db.example.com/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-jwt";
  let request;

  const saved = await callSupabaseRpc(
    "create_task_v1",
    { p_workspace_id: WORKSPACE_ID },
    {
      fetchImpl: async (url, init) => {
        request = { url, init };
        return new Response(JSON.stringify({ result: "saved", task: canonicalTask }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );
  assert.equal(request.url, "https://db.example.com/rest/v1/rpc/create_task_v1");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.apikey, "service-role-jwt");
  assert.equal(request.init.headers.authorization, "Bearer service-role-jwt");
  assert.equal(saved.result, "saved");

  await assert.rejects(
    () => callSupabaseRpc("update_task_v1", {}, {
      fetchImpl: async () => new Response(JSON.stringify({
        code: "P0002",
        details: "task row absent",
        hint: "check workspace",
        message: "task not found in workspace",
      }), { status: 404, headers: { "content-type": "application/json" } }),
    }),
    (error) => {
      assert.ok(error instanceof SupabaseRpcError);
      assert.equal(error.reason, "not-found");
      assert.equal(error.httpStatus, 404);
      assert.deepEqual(error.metadata, {
        code: "P0002",
        details: "task row absent",
        hint: "check workspace",
        message: "task not found in workspace",
      });
      return true;
    },
  );
});

test("PostgREST owner-membership authorization failures are forbidden and do not leak details", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-jwt";

  const result = await executeCreateTaskCommand({
    workspaceId: WORKSPACE_ID,
    idempotencyKey: "task:forbidden",
    correlationId: "corr-forbidden",
    input: { title: "견적 후속 연락" },
    callRpc: (name, args) => callSupabaseRpc(name, args, {
      fetchImpl: async () => new Response(JSON.stringify({
        code: "42501",
        details: "owner 55555555-5555-4555-8555-555555555555 is inactive",
        hint: "inspect workspace_memberships",
        message: "active workspace owner membership not found",
      }), { status: 403, headers: { "content-type": "application/json" } }),
    }),
  });

  assert.equal(result.httpStatus, 403);
  assert.deepEqual(result.body, {
    status: "failed",
    reason: "forbidden",
    error: "Task write is not authorized.",
    retryable: false,
    correlationId: "corr-forbidden",
  });
});

test("RPC transport aborts timed-out requests", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-jwt";

  await assert.rejects(
    () => callSupabaseRpc("create_task_v1", {}, {
      timeoutMs: 5,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    }),
    (error) => error instanceof SupabaseRpcError && error.reason === "timeout",
  );
});
