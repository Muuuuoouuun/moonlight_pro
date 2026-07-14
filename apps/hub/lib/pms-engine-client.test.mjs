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
