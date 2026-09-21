import assert from "node:assert/strict";
import { test } from "node:test";

let pmsClient = null;

try {
  pmsClient = await import("./pms-engine-client.js");
} catch {
  // Red phase: Hub has no PMS Engine client yet.
}

test("forwards a PMS command to Engine with only the shared server secret", async () => {
  assert.ok(pmsClient, "pms-engine-client.js must exist");
  const requests = [];
  const result = await pmsClient.forwardPmsCommand(
    { action: "create_task", id: "task-id", title: "Follow up" },
    {
      env: {
        COM_MOON_ENGINE_URL: "http://127.0.0.1:3001/",
        COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
        COM_MOON_HUB_WRITE_SECRET: "must-not-be-forwarded",
      },
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return new Response(JSON.stringify({ status: "saved", entity: { id: "task-id" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:3001/api/pms/command");
  assert.equal(requests[0].init.headers["x-com-moon-shared-secret"], "shared-secret");
  assert.equal(requests[0].init.headers["x-com-moon-hub-write-secret"], undefined);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    action: "create_task",
    id: "task-id",
    title: "Follow up",
  });
  assert.deepEqual(result, {
    ok: true,
    httpStatus: 201,
    data: { status: "saved", entity: { id: "task-id" } },
  });
});

test("preserves conflict taxonomy when Engine returns HTTP 409 without a JSON envelope", async () => {
  const result = await pmsClient.forwardPmsCommand(
    { action: "create_project", id: "project-id", title: "Conflicting retry" },
    {
      env: {
        COM_MOON_ENGINE_URL: "http://127.0.0.1:3001",
        COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
      },
      fetchImpl: async () => new Response("upstream proxy response", { status: 409 }),
      logger: () => {},
    },
  );

  assert.deepEqual(result, {
    ok: false,
    httpStatus: 409,
    data: { status: "conflict", error: "engine-http-409" },
  });
});

test("drops private persistence detail from Engine error envelopes", async () => {
  const result = await pmsClient.forwardPmsCommand(
    { action: "create_task", id: "task-id", title: "Scoped" },
    {
      env: {
        COM_MOON_ENGINE_URL: "http://127.0.0.1:3001",
        COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
      },
      fetchImpl: async () => new Response(JSON.stringify({
        status: "error",
        error: "insert-failed",
        detail: "private-service-key=do-not-leak",
      }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
      logger: () => {},
    },
  );

  assert.deepEqual(result, {
    ok: false,
    httpStatus: 502,
    data: { status: "error", error: "insert-failed" },
  });
});

test("uses a stable public code for Engine transport failures", async () => {
  const result = await pmsClient.forwardPmsCommand(
    { action: "create_task", id: "task-id", title: "Scoped" },
    {
      env: {
        COM_MOON_ENGINE_URL: "http://127.0.0.1:3001",
        COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
      },
      fetchImpl: async () => {
        throw new Error("private-host-token=do-not-leak");
      },
      logger: () => {},
    },
  );

  assert.deepEqual(result, {
    ok: false,
    httpStatus: 502,
    data: { status: "error", error: "engine-unreachable", retryable: true },
  });
});

test("logs the private Engine detail server-side so a 400 is diagnosable", async () => {
  const logs = [];
  const result = await pmsClient.forwardPmsCommand(
    { action: "create_task", id: "task-id", title: "Scoped" },
    {
      env: {
        COM_MOON_ENGINE_URL: "http://127.0.0.1:3001",
        COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
      },
      logger: (...args) => logs.push(args),
      fetchImpl: async () => new Response(JSON.stringify({
        status: "error",
        error: "http-400",
        detail: "column tasks.description does not exist",
      }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    },
  );

  // 브라우저 응답에서는 여전히 detail이 빠진다 — 서버 로그에만 남는다.
  assert.deepEqual(result.data, { status: "error", error: "http-400" });
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[hub/pms] engine rejected command");
  assert.deepEqual(logs[0][1], {
    action: "create_task",
    status: 502,
    error: "http-400",
    detail: "column tasks.description does not exist",
  });
});

test("does not log when Engine accepts the command", async () => {
  const logs = [];
  await pmsClient.forwardPmsCommand(
    { action: "create_task", id: "task-id", title: "Fine" },
    {
      env: {
        COM_MOON_ENGINE_URL: "http://127.0.0.1:3001",
        COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
      },
      logger: (...args) => logs.push(args),
      fetchImpl: async () => new Response(JSON.stringify({ status: "saved" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    },
  );

  assert.equal(logs.length, 0);
});
