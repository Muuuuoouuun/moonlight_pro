import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, test } from "node:test";

const engineRoot = new URL("../../engine/", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (context.parentURL?.startsWith(engineRoot) && specifier.startsWith(".")) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { GET: engineStatus } = await import("../../engine/app/api/integrations/github/sync/route.ts");
const { GET: hubStatus } = await import("../app/api/integrations/github/sync/route.js");
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const sharedSecret = "github-status-test-secret";
let fetchCalls;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: "https://github-status-db.example",
    SUPABASE_SERVICE_ROLE_KEY: "github-status-db-key",
    COM_MOON_DEFAULT_WORKSPACE_ID: "github-status-workspace",
    COM_MOON_SHARED_WEBHOOK_SECRET: sharedSecret,
    COM_MOON_ENGINE_URL: "https://github-status-engine.example",
    GITHUB_REPOSITORIES: "private-status-test/internal-repository",
    GITHUB_WEBHOOK_SECRET: "github-webhook-test-secret",
  };
  fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push(String(url));
    if (new URL(url).hostname === "github-status-engine.example") {
      assert.equal(options.headers["x-com-moon-shared-secret"], sharedSecret);
      return engineStatus(new Request(url, options));
    }
    assert.equal(new URL(url).hostname, "github-status-db.example");
    return Response.json([]);
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function request(headers = {}) {
  return new Request("https://github-status-engine.example/api/integrations/github/sync", { headers });
}

test("GitHub diagnostics reject absent, wrong, and local open-mode credentials before database reads", async () => {
  for (const headers of [{}, { "x-com-moon-shared-secret": "wrong-secret" }]) {
    const response = await engineStatus(request(headers));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "unauthorized" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = "true";
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;
  const response = await engineStatus(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { status: "unauthorized" });
  assert.equal(fetchCalls.length, 0);
});

test("GitHub diagnostics preserve status for existing header and bearer credentials", async () => {
  for (const headers of [{ "x-com-moon-shared-secret": sharedSecret }, { authorization: `Bearer ${sharedSecret}` }]) {
    const response = await engineStatus(request(headers));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.status.configured, true);
    assert.equal(body.status.repositories[0].fullName, "private-status-test/internal-repository");
    assert.equal(body.status.webhookSecretConfigured, true);
  }
});

test("Hub GitHub status forwards its existing credential to the protected Engine GET", async () => {
  const response = await hubStatus();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status.configured, true);
  assert.equal(body.status.repositories[0].fullName, "private-status-test/internal-repository");
  assert.equal(fetchCalls.length, 2);
});
