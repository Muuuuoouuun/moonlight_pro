import assert from "node:assert/strict";
import { test } from "node:test";

let contentRoute = null;

try {
  contentRoute = await import("./route.ts");
} catch {
  // Red phase: the authenticated Engine content route does not exist yet.
}

test("rejects a content command without the Hub-to-Engine shared secret", async () => {
  assert.ok(contentRoute, "Engine content command route must exist");

  const previous = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "content-test-shared-secret";
  try {
    const response = await contentRoute.POST(new Request("http://engine.local/api/content/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create_draft" }),
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

test("validates an authenticated content command before persistence", async () => {
  assert.ok(contentRoute, "Engine content command route must exist");
  const previousSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  const previousWorkspace = process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "content-test-shared-secret";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
  try {
    const response = await contentRoute.POST(new Request("http://engine.local/api/content/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": "content-test-shared-secret",
      },
      body: JSON.stringify({ action: "create_draft" }),
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: "invalid-input",
      error: "missing-item-record",
    });
  } finally {
    if (previousSecret === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previousSecret;
    if (previousWorkspace === undefined) delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    else process.env.COM_MOON_DEFAULT_WORKSPACE_ID = previousWorkspace;
  }
});
