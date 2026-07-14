import assert from "node:assert/strict";
import { test } from "node:test";

let captureClient = null;

try {
  captureClient = await import("./capture-engine-client.js");
} catch {
  // Red phase: Hub still owns its inbox write sink.
}

test("forwards quick capture to Engine with only the shared server secret", async () => {
  assert.ok(captureClient, "capture-engine-client.js must exist");
  const requests = [];
  const command = {
    raw: "고객 후속 일정 확인",
    hint: "task",
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
  };
  const result = await captureClient.forwardCaptureCommand(command, {
    env: {
      COM_MOON_ENGINE_URL: "http://127.0.0.1:3001/",
      COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
      COM_MOON_HUB_WRITE_SECRET: "must-not-be-forwarded",
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ status: "saved", destinationType: "task" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:3001/api/capture/command");
  assert.equal(requests[0].init.headers["x-com-moon-shared-secret"], "shared-secret");
  assert.equal(requests[0].init.headers["x-com-moon-hub-write-secret"], undefined);
  assert.deepEqual(JSON.parse(requests[0].init.body), command);
  assert.deepEqual(result, {
    ok: true,
    httpStatus: 201,
    data: { status: "saved", destinationType: "task" },
  });
});
