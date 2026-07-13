import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { handleQuickCaptureRequest } from "../app/api/intake/quick-capture/route.ts";
import { handleUpdateTaskRequest } from "../app/api/tasks/[id]/route.ts";
import { handleCreateTaskRequest } from "../app/api/tasks/route.ts";

const ORIGINAL_ENV = { ...process.env };
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const FORGED_WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHARED_SECRET = "engine-shared-secret";

function authenticatedRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-com-moon-shared-secret": SHARED_SECRET,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    COM_MOON_SHARED_WEBHOOK_SECRET: SHARED_SECRET,
    COM_MOON_DEFAULT_WORKSPACE_ID: WORKSPACE_ID,
  };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("task routes authenticate before parsing JSON or invoking a command", async () => {
  let calls = 0;
  const request = new Request("http://engine.test/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  const response = await handleCreateTaskRequest(request, {
    execute: async () => {
      calls += 1;
      throw new Error("must not run");
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  assert.equal((await response.json()).status, "failed");
});

test("create route injects server workspace and forwards idempotency and correlation headers", async () => {
  let command;
  const response = await handleCreateTaskRequest(
    authenticatedRequest(
      "http://engine.test/api/tasks",
      {
        title: "견적 후속 연락",
        priority: "high",
        workspaceId: FORGED_WORKSPACE_ID,
        workspace_id: FORGED_WORKSPACE_ID,
        ownerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
      {
        "Idempotency-Key": "task:create:one",
        "X-Correlation-Id": "corr-from-hub",
      },
    ),
    {
      execute: async (input) => {
        command = input;
        return {
          httpStatus: 201,
          body: {
            status: "saved",
            task: { id: TASK_ID },
            retryable: false,
            correlationId: input.correlationId,
          },
        };
      },
    },
  );

  assert.deepEqual(command, {
    workspaceId: WORKSPACE_ID,
    idempotencyKey: "task:create:one",
    correlationId: "corr-from-hub",
    input: {
      title: "견적 후속 연락",
      priority: "high",
    },
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-correlation-id"), "corr-from-hub");
  assert.deepEqual(await response.json(), {
    status: "saved",
    task: { id: TASK_ID },
    retryable: false,
    correlationId: "corr-from-hub",
  });
});

test("update route sends route task id, expected version, and a sanitized patch", async () => {
  let command;
  const request = authenticatedRequest(
    `http://engine.test/api/tasks/${TASK_ID}`,
    {
      expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
      patch: {
        status: "done",
        workspaceId: FORGED_WORKSPACE_ID,
        owner_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      workspaceId: FORGED_WORKSPACE_ID,
    },
    { "Idempotency-Key": "task:update:one" },
  );

  const response = await handleUpdateTaskRequest(
    request,
    { params: Promise.resolve({ id: TASK_ID }) },
    {
      execute: async (input) => {
        command = input;
        return {
          httpStatus: 409,
          body: {
            status: "conflict",
            reason: "stale-write",
            task: { id: TASK_ID, status: "doing" },
            retryable: false,
            correlationId: input.correlationId,
          },
        };
      },
    },
  );

  assert.equal(command.workspaceId, WORKSPACE_ID);
  assert.equal(command.taskId, TASK_ID);
  assert.equal(command.idempotencyKey, "task:update:one");
  assert.equal(command.expectedUpdatedAt, "2026-07-13T04:00:00.000Z");
  assert.deepEqual(command.input, { status: "done" });
  assert.ok(command.correlationId);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).task.status, "doing");
});

test("quick-capture route requires an explicit destination and keeps classifier input", async () => {
  let command;
  const response = await handleQuickCaptureRequest(
    authenticatedRequest(
      "http://engine.test/api/intake/quick-capture",
      {
        destination: "inbox",
        raw: "원장님은 가격을 먼저 궁금해함",
        kind: "customer",
        persona: "sales",
        summary: "가격 관심 고객",
        workspaceId: FORGED_WORKSPACE_ID,
        ownerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      { "Idempotency-Key": "capture:one" },
    ),
    {
      execute: async (input) => {
        command = input;
        return {
          httpStatus: 201,
          body: {
            status: "saved",
            work_order: { id: "66666666-6666-4666-8666-666666666666" },
            retryable: false,
            correlationId: input.correlationId,
          },
        };
      },
    },
  );

  assert.equal(command.workspaceId, WORKSPACE_ID);
  assert.equal(command.idempotencyKey, "capture:one");
  assert.deepEqual(command.input, {
    destination: "inbox",
    raw: "원장님은 가격을 먼저 궁금해함",
    kind: "customer",
    persona: "sales",
    summary: "가격 관심 고객",
  });
  assert.equal(response.status, 201);
});

test("routes report missing server workspace as non-retryable degraded state", async () => {
  delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  let calls = 0;
  const response = await handleCreateTaskRequest(
    authenticatedRequest(
      "http://engine.test/api/tasks",
      { title: "견적 후속 연락" },
      { "Idempotency-Key": "task:no-workspace" },
    ),
    {
      execute: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
  );

  assert.equal(calls, 0);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.reason, "missing-workspace");
  assert.equal(body.retryable, false);
  assert.ok(body.correlationId);
});
