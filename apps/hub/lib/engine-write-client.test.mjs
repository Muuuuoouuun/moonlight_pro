import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { sendEngineWrite } from "./engine-write-client.js";

const ORIGINAL_ENV = { ...process.env };
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    COM_MOON_ENGINE_URL: "https://engine.example.com/",
    COM_MOON_SHARED_WEBHOOK_SECRET: "engine-shared-secret",
    COM_MOON_DEFAULT_WORKSPACE_ID: WORKSPACE_ID,
  };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("forwards only server context and preserves an Engine conflict exactly", async () => {
  let sent;
  const engineConflict = {
    status: "conflict",
    reason: "stale-write",
    task: { id: "task-one", status: "doing" },
    retryable: false,
    correlationId: "engine-correlation",
  };

  const response = await sendEngineWrite("/api/tasks/task-one", {
    method: "PATCH",
    idempotencyKey: "task:update:one",
    correlationId: "hub-correlation",
    body: {
      expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
      workspaceId: "browser-workspace",
      workspace_id: "browser-workspace-snake",
      ownerId: "browser-owner",
      owner_id: "browser-owner-snake",
      actorId: "browser-actor",
      actor_id: "browser-actor-snake",
      patch: {
        status: "done",
        workspaceId: "nested-workspace",
        owner_id: "nested-owner",
      },
    },
    fetchImpl: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return Response.json(engineConflict, {
        status: 409,
        headers: { "x-correlation-id": "engine-correlation" },
      });
    },
  });

  assert.equal(sent.url, "https://engine.example.com/api/tasks/task-one");
  assert.equal(sent.init.method, "PATCH");
  assert.equal(sent.init.headers["x-com-moon-shared-secret"], "engine-shared-secret");
  assert.equal(sent.init.headers["idempotency-key"], "task:update:one");
  assert.equal(sent.init.headers["x-correlation-id"], "hub-correlation");
  assert.deepEqual(sent.body, {
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    patch: { status: "done" },
    workspaceId: WORKSPACE_ID,
  });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("x-correlation-id"), "engine-correlation");
  assert.deepEqual(await response.json(), engineConflict);
});

test("requires URL, shared secret, workspace, idempotency key, and object input before fetch", async () => {
  for (const missing of [
    "COM_MOON_ENGINE_URL",
    "COM_MOON_SHARED_WEBHOOK_SECRET",
    "COM_MOON_DEFAULT_WORKSPACE_ID",
  ]) {
    const saved = process.env[missing];
    delete process.env[missing];
    let calls = 0;
    const response = await sendEngineWrite("/api/tasks", {
      method: "POST",
      idempotencyKey: "task:create:one",
      body: { title: "후속 연락" },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("must not fetch");
      },
    });
    process.env[missing] = saved;

    assert.equal(calls, 0);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "degraded",
      reason: "missing-config",
      error: "Engine write transport is not configured.",
      retryable: false,
      correlationId: response.headers.get("x-correlation-id"),
    });
  }

  let calls = 0;
  const noKey = await sendEngineWrite("/api/tasks", {
    method: "POST",
    idempotencyKey: " ",
    body: { title: "후속 연락" },
    fetchImpl: async () => {
      calls += 1;
    },
  });
  assert.equal(calls, 0);
  assert.equal(noKey.status, 400);
  assert.equal((await noKey.json()).reason, "missing-idempotency-key");

  const nonObject = await sendEngineWrite("/api/tasks", {
    method: "POST",
    idempotencyKey: "task:invalid",
    body: ["not", "an", "object"],
    fetchImpl: async () => {
      calls += 1;
    },
  });
  assert.equal(calls, 0);
  assert.equal(nonObject.status, 400);
  assert.equal((await nonObject.json()).reason, "invalid-body");
});

test("maps timeout and unreachable Engine failures without pretending persistence", async () => {
  const timeout = await sendEngineWrite("/api/tasks", {
    method: "POST",
    idempotencyKey: "task:timeout",
    correlationId: "corr-timeout",
    timeoutMs: 5,
    body: { title: "후속 연락" },
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  });
  assert.equal(timeout.status, 504);
  assert.deepEqual(await timeout.json(), {
    status: "failed",
    reason: "timeout",
    error: "Engine write request timed out.",
    retryable: true,
    correlationId: "corr-timeout",
  });

  const unavailable = await sendEngineWrite("/api/tasks", {
    method: "POST",
    idempotencyKey: "task:unavailable",
    correlationId: "corr-unavailable",
    body: { title: "후속 연락" },
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED secret-detail");
    },
  });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), {
    status: "failed",
    reason: "upstream",
    error: "Engine write request failed.",
    retryable: true,
    correlationId: "corr-unavailable",
  });
});

test("rejects non-JSON, non-object, and preview Engine responses as safe 502", async () => {
  const upstreams = [
    new Response("<html>proxy error</html>", { status: 500 }),
    Response.json(["unexpected"], { status: 200 }),
    Response.json({ status: "preview", retryable: false }, { status: 202 }),
    Response.json({ error: "bad gateway" }, { status: 200 }),
    Response.json(
      { status: "saved", retryable: false, correlationId: "body-correlation" },
      { status: 200, headers: { "x-correlation-id": "different-header-correlation" } },
    ),
  ];

  for (const upstream of upstreams) {
    const response = await sendEngineWrite("/api/tasks", {
      method: "POST",
      idempotencyKey: crypto.randomUUID(),
      correlationId: "corr-invalid-upstream",
      body: { title: "후속 연락" },
      fetchImpl: async () => upstream,
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      status: "failed",
      reason: "upstream",
      error: "Engine returned an invalid response.",
      retryable: true,
      correlationId: "corr-invalid-upstream",
    });
  }
});
