import assert from "node:assert/strict";
import { test } from "node:test";

let captureRoute = null;

try {
  captureRoute = await import("./route.ts");
} catch {
  // Auth and validation regression guard for the Engine capture boundary.
}

test("rejects a capture command without the Hub-to-Engine shared secret", async () => {
  assert.ok(captureRoute, "Engine capture command route must exist");
  const previous = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "capture-test-shared-secret";
  try {
    const response = await captureRoute.POST(new Request("http://engine.local/api/capture/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: "Should not save", hint: "task" }),
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      status: "unauthorized",
      error: "invalid-shared-secret",
      retryable: false,
    });
  } finally {
    if (previous === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous;
  }
});

test("validates an authenticated capture before invoking the receipt RPC", async () => {
  assert.ok(captureRoute, "Engine capture command route must exist");
  const previousSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  const previousWorkspace = process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "capture-test-shared-secret";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
  try {
    const response = await captureRoute.POST(new Request("http://engine.local/api/capture/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": "capture-test-shared-secret",
      },
      body: JSON.stringify({
        raw: "",
        hint: "task",
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
      }),
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: "invalid-input",
      error: "empty-capture",
      retryable: false,
    });
  } finally {
    if (previousSecret === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previousSecret;
    if (previousWorkspace === undefined) delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    else process.env.COM_MOON_DEFAULT_WORKSPACE_ID = previousWorkspace;
  }
});
