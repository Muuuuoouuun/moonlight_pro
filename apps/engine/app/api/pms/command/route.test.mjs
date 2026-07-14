import assert from "node:assert/strict";
import { test } from "node:test";

let pmsRoute = null;

try {
  pmsRoute = await import("./route.ts");
} catch {
  // Red phase: the authenticated Engine PMS command route does not exist yet.
}

test("rejects a PMS command without the Hub-to-Engine shared secret", async () => {
  assert.ok(pmsRoute, "Engine PMS command route must exist");

  const previous = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "pms-test-shared-secret";
  try {
    const response = await pmsRoute.POST(new Request("http://engine.local/api/pms/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create_task", title: "Should not save" }),
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      status: "unauthorized",
      error: "invalid-shared-secret",
    });
  } finally {
    if (previous === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous;
  }
});

test("validates an authenticated PMS command before touching the ledger", async () => {
  const previousSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  const previousWorkspace = process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "pms-test-shared-secret";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
  try {
    const response = await pmsRoute.POST(new Request("http://engine.local/api/pms/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": "pms-test-shared-secret",
      },
      body: JSON.stringify({
        action: "create_task",
        id: "55555555-5555-4555-8555-555555555555",
        title: "",
      }),
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: "invalid-input",
      error: "missing-title",
    });
  } finally {
    if (previousSecret === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previousSecret;
    if (previousWorkspace === undefined) delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    else process.env.COM_MOON_DEFAULT_WORKSPACE_ID = previousWorkspace;
  }
});
