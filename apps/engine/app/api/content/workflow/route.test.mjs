import assert from "node:assert/strict";
import { test } from "node:test";
let route;
try { route = await import("./route.ts"); } catch {}
const workspaceId = "11111111-1111-1111-1111-111111111111";
const requestId = "22222222-2222-2222-2222-222222222222";
const body = { action: "save", requestId, item: { sourceIdea: "원문" }, variant: { body: "초안", variantType: "x_thread", channel: "threads" } };
async function withEnv(run) {
  const snapshot = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, COM_MOON_SHARED_WEBHOOK_SECRET: "workflow-secret", SUPABASE_URL: "https://db.example.test", SUPABASE_SERVICE_ROLE_KEY: "db-secret" });
  try { return await run(); } finally { process.env = snapshot; globalThis.fetch = originalFetch; }
}
const request = (value, headers = {}) => new Request("http://engine.test/api/content/workflow", { method: "POST", headers: { "content-type": "application/json", "x-com-moon-shared-secret": "workflow-secret", ...headers }, body: typeof value === "string" ? value : JSON.stringify(value) });

test("requires a configured shared secret, including when legacy open-webhook mode is enabled", async () => {
  assert.ok(route, "workflow route must exist");
  await withEnv(async () => {
    assert.equal((await route.POST(request(body, { "x-com-moon-shared-secret": "wrong" }))).status, 401);
    delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = "true";
    assert.equal((await route.POST(request(body))).status, 401);
  });
});

test("rejects oversized UTF-8 and non-object JSON before persistence", async () => {
  assert.ok(route);
  await withEnv(async () => {
    globalThis.fetch = async () => { throw new Error("must not fetch"); };
    assert.equal((await route.POST(request({ ...body, item: { sourceIdea: "한".repeat(90000) } }))).status, 413);
    assert.equal((await route.POST(request("[]"))).status, 400);
    assert.equal((await route.POST(request("not json"))).status, 400);
  });
});

test("uses server workspace, sends one RPC, and propagates conflict", async () => {
  assert.ok(route);
  await withEnv(async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ status: "conflict", error: "stale-item", item: { id: "current" }, variant: null }), { status: 200 });
    };
    const response = await route.POST(request({ ...body, workspaceId: "99999999-9999-9999-9999-999999999999" }));
    assert.equal(response.status, 409);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rpc\/content_workflow_v1$/);
    assert.equal(JSON.parse(calls[0].init.body).p_workspace_id, workspaceId);
  });
});
