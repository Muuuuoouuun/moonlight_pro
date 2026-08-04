import assert from "node:assert/strict";
import { test } from "node:test";

let contentClient = null;

try {
  contentClient = await import("./content-engine-client.js");
} catch {
  // Red phase: Hub content writes still bypass Engine.
}

test("forwards a content command to Engine with only the shared server secret", async () => {
  assert.ok(contentClient, "content-engine-client.js must exist");
  const requests = [];
  const result = await contentClient.forwardContentCommand(
    { action: "create_draft", workspaceId: "workspace-id" },
    {
      env: {
        COM_MOON_ENGINE_URL: "http://127.0.0.1:3001/",
        COM_MOON_SHARED_WEBHOOK_SECRET: "shared-secret",
        COM_MOON_HUB_WRITE_SECRET: "must-not-be-forwarded",
      },
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return new Response(JSON.stringify({ status: "saved", contentId: "content-id" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:3001/api/content/command");
  assert.equal(requests[0].init.headers["x-com-moon-shared-secret"], "shared-secret");
  assert.equal(requests[0].init.headers["x-com-moon-hub-write-secret"], undefined);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    action: "create_draft",
    workspaceId: "workspace-id",
  });
  assert.deepEqual(result, {
    ok: true,
    httpStatus: 201,
    data: { status: "saved", contentId: "content-id" },
  });
});
