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
