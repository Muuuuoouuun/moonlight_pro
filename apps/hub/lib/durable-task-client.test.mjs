import assert from "node:assert/strict";
import { test } from "node:test";

import { createDurableTaskClient } from "./durable-task-client.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("failed capture retries the same canonical payload with the same idempotency key", async () => {
  const requests = [];
  const responses = [
    jsonResponse({
      status: "failed",
      retryable: true,
      reason: "engine-unreachable",
      error: "Engine write request failed.",
      correlationId: "corr-failed",
    }, 502),
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-1" },
      correlationId: "corr-saved",
    }),
  ];
  const client = createDurableTaskClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  const failed = await client.submit({ destination: "task", text: "  고객에게 연락  " });
  const saved = await client.submit({ destination: "task", text: "고객에게 연락" });

  assert.equal(failed.status, "failed");
  assert.equal(saved.status, "saved");
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].options.headers.get("idempotency-key"),
    requests[1].options.headers.get("idempotency-key"),
  );
});

test("pending duplicate capture shares one request", async () => {
  let release;
  let requestCount = 0;
  const response = new Promise((resolve) => {
    release = () => resolve(jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-1" },
      correlationId: "corr-saved",
    }));
  });
  const client = createDurableTaskClient({
    fetchImpl: async () => {
      requestCount += 1;
      return response;
    },
  });

  const first = client.submit({ destination: "task", text: "고객에게 연락" });
  const second = client.submit({ text: "고객에게 연락", destination: "task" });

  assert.equal(first, second);
  assert.equal(requestCount, 1);
  release();
  await first;
});

test("only saved and duplicate clear the key for a later canonical capture", async () => {
  const keys = [];
  const responses = [
    jsonResponse({
      status: "accepted",
      retryable: false,
      reason: "queued",
      workOrder: { id: "order-1" },
      correlationId: "corr-accepted",
    }),
    jsonResponse({
      status: "duplicate",
      retryable: false,
      reason: "idempotent-replay",
      workOrder: { id: "order-1" },
      correlationId: "corr-duplicate",
    }),
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-2" },
      correlationId: "corr-saved-2",
    }),
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-3" },
      correlationId: "corr-saved-3",
    }),
  ];
  let keyNumber = 0;
  const client = createDurableTaskClient({
    keyFactory: () => `capture-${++keyNumber}`,
    fetchImpl: async (_url, options) => {
      keys.push(options.headers.get("idempotency-key"));
      return responses.shift();
    },
  });

  await client.submit({ destination: "task", text: "고객에게 연락" });
  await client.submit({ destination: "task", text: "고객에게 연락" });
  await client.submit({ destination: "task", text: "고객에게 연락" });
  await client.submit({ destination: "task", text: "고객에게 연락" });

  assert.deepEqual(keys, ["capture-1", "capture-1", "capture-2", "capture-3"]);
});

test("changed payload gets a new key and task versus inbox use their durable routes", async () => {
  const requests = [];
  let keyNumber = 0;
  const client = createDurableTaskClient({
    keyFactory: () => `capture-${++keyNumber}`,
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        key: options.headers.get("idempotency-key"),
        body: JSON.parse(options.body),
      });
      return jsonResponse({
        status: "failed",
        retryable: true,
        reason: "engine-unreachable",
        error: "Engine write request failed.",
        correlationId: `corr-${requests.length}`,
      }, 502);
    },
  });

  await client.submit({ destination: "task", text: "후속 연락" });
  await client.submit({ destination: "inbox", text: "아이디어 정리" });

  assert.deepEqual(requests, [
    {
      url: "/api/hub/tasks",
      key: "capture-1",
      body: { title: "후속 연락" },
    },
    {
      url: "/api/hub/inbox",
      key: "capture-2",
      body: { raw: "아이디어 정리" },
    },
  ]);
});

test("409 conflict preserves the same key until a saved retry", async () => {
  const keys = [];
  const responses = [
    jsonResponse({
      status: "conflict",
      retryable: false,
      reason: "stale-write",
      error: "Task changed before this write.",
      currentTask: { id: "task-stale", updatedAt: "2026-07-13T10:00:00.000Z" },
      correlationId: "corr-conflict",
    }, 409),
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-stale", updatedAt: "2026-07-13T10:01:00.000Z" },
      correlationId: "corr-saved",
    }),
  ];
  const client = createDurableTaskClient({
    keyFactory: () => "capture-conflict",
    fetchImpl: async (_url, options) => {
      keys.push(options.headers.get("idempotency-key"));
      return responses.shift();
    },
  });

  const conflict = await client.submit({ destination: "task", text: "후속 연락" });
  const saved = await client.submit({ destination: "task", text: "후속 연락" });

  assert.equal(conflict.httpStatus, 409);
  assert.equal(saved.status, "saved");
  assert.deepEqual(keys, ["capture-conflict", "capture-conflict"]);
});

test("non-2xx terminal-looking responses stay failed and retry the same raw capture key", async () => {
  const requests = [];
  const responses = [
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "upstream-write-failed",
      error: "The upstream write did not commit.",
      task: { id: "task-false-positive" },
      correlationId: "corr-false-positive",
    }, 500),
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-committed" },
      correlationId: "corr-committed",
    }),
  ];
  const client = createDurableTaskClient({
    keyFactory: () => "capture-non-2xx",
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        key: options.headers.get("idempotency-key"),
        body: JSON.parse(options.body),
      });
      return responses.shift();
    },
  });

  const failed = await client.submit({ destination: "task", text: "  견적 후속 연락  " });
  const saved = await client.submit({ destination: "task", text: "견적 후속 연락" });

  assert.deepEqual(failed, {
    status: "failed",
    retryable: true,
    reason: "upstream-write-failed",
    error: "The upstream write did not commit.",
    task: { id: "task-false-positive" },
    correlationId: "corr-false-positive",
    httpStatus: 500,
  });
  assert.equal(saved.status, "saved");
  assert.deepEqual(requests, [
    {
      url: "/api/hub/tasks",
      key: "capture-non-2xx",
      body: { title: "견적 후속 연락" },
    },
    {
      url: "/api/hub/tasks",
      key: "capture-non-2xx",
      body: { title: "견적 후속 연락" },
    },
  ]);
});

test("401 requests inline unlock, consumes the secret immediately, and retries the same key", async () => {
  const requests = [];
  let releaseUnlock;
  let secret = "write-secret";
  const unlockResponse = new Promise((resolve) => {
    releaseUnlock = () => resolve(jsonResponse({ unlocked: true }));
  });
  const client = createDurableTaskClient({
    keyFactory: () => "capture-locked",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url === "/api/hub/session") return unlockResponse;
      if (requests.filter((request) => request.url === "/api/hub/tasks").length === 1) {
        return jsonResponse({ unlocked: false }, 401);
      }
      return jsonResponse({
        status: "saved",
        retryable: false,
        reason: "created",
        task: { id: "task-unlocked" },
        correlationId: "corr-unlocked",
      });
    },
  });

  const locked = await client.submit({ destination: "task", text: "후속 연락" });
  assert.equal(locked.requiresUnlock, true);
  assert.equal(locked.httpStatus, 401);

  const unlocking = client.unlockSession({
    secret,
    onSecretConsumed: () => { secret = ""; },
  });
  assert.equal(secret, "");
  assert.equal(requests.at(-1).url, "/api/hub/session");
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { secret: "write-secret" });
  releaseUnlock();
  assert.deepEqual(await unlocking, { unlocked: true, httpStatus: 200 });

  const saved = await client.submit({ destination: "task", text: "후속 연락" });
  assert.equal(saved.status, "saved");
  const taskKeys = requests
    .filter((request) => request.url === "/api/hub/tasks")
    .map((request) => request.options.headers.get("idempotency-key"));
  assert.deepEqual(taskKeys, ["capture-locked", "capture-locked"]);
});

test("createTask keeps one key for canonically equal payloads until a 2xx save", async () => {
  const requests = [];
  const responses = [
    jsonResponse({
      status: "failed",
      retryable: true,
      reason: "upstream",
      error: "Engine write request failed.",
      correlationId: "corr-create-failed",
    }, 502),
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-created" },
      correlationId: "corr-create-saved",
    }, 201),
    jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-created-again" },
      correlationId: "corr-create-saved-again",
    }, 201),
  ];
  let keyNumber = 0;
  const client = createDurableTaskClient({
    keyFactory: () => `task-mutation-${++keyNumber}`,
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        method: options.method,
        key: options.headers.get("idempotency-key"),
        body: JSON.parse(options.body),
      });
      return responses.shift();
    },
  });

  assert.equal(typeof client.createTask, "function");
  const failed = await client.createTask({
    title: "견적 후속 연락",
    status: "todo",
    meta: { due_precision: "none", source: "daily" },
  });
  const saved = await client.createTask({
    meta: { source: "daily", due_precision: "none" },
    status: "todo",
    title: "견적 후속 연락",
  });
  await client.createTask({
    status: "todo",
    title: "견적 후속 연락",
    meta: { due_precision: "none", source: "daily" },
  });

  assert.equal(failed.status, "failed");
  assert.equal(saved.status, "saved");
  assert.deepEqual(requests, [
    {
      url: "/api/hub/tasks",
      method: "POST",
      key: "task-mutation-1",
      body: {
        title: "견적 후속 연락",
        status: "todo",
        meta: { due_precision: "none", source: "daily" },
      },
    },
    {
      url: "/api/hub/tasks",
      method: "POST",
      key: "task-mutation-1",
      body: {
        meta: { source: "daily", due_precision: "none" },
        status: "todo",
        title: "견적 후속 연락",
      },
    },
    {
      url: "/api/hub/tasks",
      method: "POST",
      key: "task-mutation-2",
      body: {
        status: "todo",
        title: "견적 후속 연락",
        meta: { due_precision: "none", source: "daily" },
      },
    },
  ]);
});

test("canonically equal createTask calls share one pending request", async () => {
  let release;
  let requestCount = 0;
  const response = new Promise((resolve) => {
    release = () => resolve(jsonResponse({
      status: "saved",
      retryable: false,
      reason: "created",
      task: { id: "task-pending" },
      correlationId: "corr-create-pending",
    }, 201));
  });
  const client = createDurableTaskClient({
    keyFactory: () => "task-pending-key",
    fetchImpl: async () => {
      requestCount += 1;
      return response;
    },
  });

  assert.equal(typeof client.createTask, "function");
  const first = client.createTask({ title: "후속 연락", meta: { b: 2, a: 1 } });
  const second = client.createTask({ meta: { a: 1, b: 2 }, title: "후속 연락" });

  assert.equal(first, second);
  assert.equal(requestCount, 1);
  release();
  await first;
});

test("updateTask sends the exact OCC body and rejects non-ok false success without changing its key", async () => {
  const requests = [];
  const responses = [
    jsonResponse({
      status: "duplicate",
      retryable: false,
      reason: "upstream-write-failed",
      error: "The update was not committed.",
      task: { id: "task/one", status: "done" },
      correlationId: "corr-update-false-success",
    }, 500),
    jsonResponse({
      status: "duplicate",
      retryable: false,
      reason: "idempotent-replay",
      task: { id: "task/one", status: "done" },
      correlationId: "corr-update-duplicate",
    }),
  ];
  const client = createDurableTaskClient({
    keyFactory: () => "task-update-key",
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        method: options.method,
        key: options.headers.get("idempotency-key"),
        body: JSON.parse(options.body),
      });
      return responses.shift();
    },
  });

  assert.equal(typeof client.updateTask, "function");
  const failed = await client.updateTask({
    id: "task/one",
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    patch: { status: "done", meta: { source: "today", rank: 1 } },
  });
  const duplicate = await client.updateTask({
    patch: { meta: { rank: 1, source: "today" }, status: "done" },
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    id: "task/one",
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.httpStatus, 500);
  assert.equal(failed.reason, "upstream-write-failed");
  assert.equal(failed.error, "The update was not committed.");
  assert.equal(duplicate.status, "duplicate");
  assert.deepEqual(requests, [
    {
      url: "/api/hub/tasks/task%2Fone",
      method: "PATCH",
      key: "task-update-key",
      body: {
        expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
        patch: { status: "done", meta: { source: "today", rank: 1 } },
      },
    },
    {
      url: "/api/hub/tasks/task%2Fone",
      method: "PATCH",
      key: "task-update-key",
      body: {
        expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
        patch: { meta: { rank: 1, source: "today" }, status: "done" },
      },
    },
  ]);
});

test("updateTask keeps a conflict key but changed OCC input gets a new key", async () => {
  const requests = [];
  let keyNumber = 0;
  const client = createDurableTaskClient({
    keyFactory: () => `task-update-${++keyNumber}`,
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        key: options.headers.get("idempotency-key"),
        body: JSON.parse(options.body),
      });
      return jsonResponse({
        status: "conflict",
        retryable: false,
        reason: "stale-write",
        error: "Task changed before this write.",
        currentTask: {
          id: "task-1",
          updatedAt: "2026-07-13T05:00:00.000Z",
        },
        correlationId: `corr-update-${requests.length}`,
      }, 409);
    },
  });

  await client.updateTask({
    id: "task-1",
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    patch: { status: "done", meta: { b: 2, a: 1 } },
  });
  await client.updateTask({
    patch: { meta: { a: 1, b: 2 }, status: "done" },
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    id: "task-1",
  });
  await client.updateTask({
    id: "task-1",
    expectedUpdatedAt: "2026-07-13T05:00:00.000Z",
    patch: { status: "done", meta: { a: 1, b: 2 } },
  });
  await client.updateTask({
    id: "task-1",
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    patch: { status: "blocked", meta: { a: 1, b: 2 } },
  });

  assert.deepEqual(
    requests.map((request) => request.key),
    ["task-update-1", "task-update-1", "task-update-2", "task-update-3"],
  );
});

test("canonically equal updateTask calls share one pending request", async () => {
  let release;
  let requestCount = 0;
  const response = new Promise((resolve) => {
    release = () => resolve(jsonResponse({
      status: "saved",
      retryable: false,
      reason: "updated",
      task: { id: "task-pending-update" },
      correlationId: "corr-update-pending",
    }));
  });
  const client = createDurableTaskClient({
    keyFactory: () => "task-update-pending-key",
    fetchImpl: async () => {
      requestCount += 1;
      return response;
    },
  });

  const first = client.updateTask({
    id: "task-pending-update",
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    patch: { status: "done", meta: { b: 2, a: 1 } },
  });
  const second = client.updateTask({
    patch: { meta: { a: 1, b: 2 }, status: "done" },
    expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
    id: "task-pending-update",
  });

  assert.equal(first, second);
  assert.equal(requestCount, 1);
  release();
  await first;
});
