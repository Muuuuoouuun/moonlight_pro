import assert from "node:assert/strict";
import { test } from "node:test";
let route;
try { route = await import("./route.js"); } catch {}
const workspaceId = "11111111-1111-1111-1111-111111111111";
const contentId = "33333333-3333-3333-3333-333333333333";
async function withEnv(run) {
  const snapshot = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { NODE_ENV: "production", COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, COM_MOON_HUB_WRITE_SECRET: "hub-secret", COM_MOON_SHARED_WEBHOOK_SECRET: "engine-secret", COM_MOON_ENGINE_URL: "https://engine.test", SUPABASE_URL: "https://db.example.test", SUPABASE_SERVICE_ROLE_KEY: "db-secret" });
  try { return await run(); } finally { process.env = snapshot; globalThis.fetch = originalFetch; }
}
const request = (body, authenticated = true) => new Request("https://hub.test/api/hub/content/workflow", { method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { "x-com-moon-hub-write-secret": "hub-secret" } : {}) }, body: JSON.stringify(body) });

test("guards writes before forwarding and measures UTF-8 payload size", async () => {
  assert.ok(route, "Hub workflow route must exist");
  await withEnv(async () => {
    globalThis.fetch = async () => { throw new Error("must not forward"); };
    assert.equal((await route.POST(request({}, false))).status, 401);
    assert.equal((await route.POST(request({ body: "한".repeat(90000) }))).status, 413);
    assert.equal((await route.POST(request([]))).status, 400);
  });
});

test("injects server workspace and forwards only the Engine shared secret", async () => {
  assert.ok(route);
  await withEnv(async () => {
    let forwarded;
    globalThis.fetch = async (url, init) => { forwarded = { url, init }; return new Response(JSON.stringify({ status: "saved", contentId }), { status: 200 }); };
    const response = await route.POST(request({ action: "save", workspaceId: "foreign" }));
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, "https://engine.test/api/content/workflow");
    assert.equal(JSON.parse(forwarded.init.body).workspaceId, workspaceId);
    assert.equal(forwarded.init.headers["x-com-moon-shared-secret"], "engine-secret");
    assert.equal(forwarded.init.headers["x-com-moon-hub-write-secret"], undefined);
  });
});

test("exact GET reports read failures with HTTP 200 and an error envelope", async () => {
  assert.ok(route);
  await withEnv(async () => {
    globalThis.fetch = async () => new Response("failed", { status: 500 });
    const response = await route.GET(new Request(`https://hub.test/api/hub/content/workflow?item=${contentId}`));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "error");
  });
});
