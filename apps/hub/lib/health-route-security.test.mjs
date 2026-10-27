import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, test } from "node:test";

// Resolve the Engine's Next-style TypeScript imports without replacing route logic.
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

const { GET: hubHealth } = await import("../app/api/health/route.js");
const { GET: engineHealth } = await import("../../engine/app/api/health/route.ts");
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const hubSecret = "health-hub-test-secret";
const engineSecret = "health-engine-test-secret";
let fetchCalls;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: "https://health-db.example",
    SUPABASE_SERVICE_ROLE_KEY: "health-db-test-key",
    COM_MOON_HUB_WRITE_SECRET: hubSecret,
    COM_MOON_OAUTH_STATE_SECRET: hubSecret,
    COM_MOON_SHARED_WEBHOOK_SECRET: engineSecret,
    COM_MOON_ENGINE_URL: "https://health-engine.example",
    COM_MOON_ALLOW_OPEN_WEBHOOKS: "false",
    GITHUB_REPOSITORIES: "private-health-test/internal-repository",
    GITHUB_PROJECT_MAP: "private-health-test/internal-repository=private-project",
  };
  fetchCalls = [];
  globalThis.fetch = async url => {
    fetchCalls.push(String(url));
    assert.ok(["health-db.example", "health-engine.example"].includes(new URL(url).hostname));
    return Response.json({ status: "ok" });
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function request(headers = {}) {
  return new Request("https://health.example/api/health", { headers });
}

for (const [name, handler, readinessKey, header, secret] of [
  ["Hub", hubHealth, "ok", "x-com-moon-hub-write-secret", hubSecret],
  ["Engine", engineHealth, "reachable", "x-com-moon-shared-secret", engineSecret],
]) {
  test(`${name} public health exposes only readiness, including invalid credentials`, async () => {
    for (const headers of [{}, { [header]: "wrong-secret" }, { origin: "https://health.example" }]) {
      const response = await handler(request(headers));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok", database: { supabase: { [readinessKey]: true } } });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    // Anonymous liveness must not fan out into control-plane diagnostics.
    assert.ok(fetchCalls.every(url => new URL(url).hostname === "health-db.example"));
  });

  test(`${name} accepts existing header and bearer server credentials for private diagnostics`, async () => {
    for (const headers of [{ [header]: secret }, { authorization: `Bearer ${secret}` }]) {
      const response = await handler(request(headers));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.ok(body.routes.length > 0);
      assert.equal(body.database.supabase[readinessKey], true);
      if (name === "Hub") assert.deepEqual(body.integrations.secrets.coupled, ["oauthState:hubWrite"]);
      else assert.equal(body.integrations.github.repositories[0].fullName, "private-health-test/internal-repository");
    }
  });

  test(`${name} public degraded health keeps failure status without internal configuration`, async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "degraded", database: { supabase: { [readinessKey]: false } } });
    assert.equal(fetchCalls.length, 0);
  });
}

test("Hub failure messages are available only with its server credential", async () => {
  globalThis.fetch = async () => { throw new Error("private-upstream-diagnostic"); };
  const publicResponse = await hubHealth(request());
  assert.equal(publicResponse.status, 503);
  assert.deepEqual(await publicResponse.json(), { status: "degraded", database: { supabase: { ok: false } } });
  const privateBody = await (await hubHealth(request({ "x-com-moon-hub-write-secret": hubSecret }))).json();
  assert.equal(privateBody.database.supabase.detail, "private-upstream-diagnostic");
});

test("Engine local open-webhook mode does not authorize health diagnostics", async () => {
  delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_ALLOW_OPEN_WEBHOOKS = "true";
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;
  const response = await engineHealth(request());
  assert.deepEqual(await response.json(), { status: "ok", database: { supabase: { reachable: true } } });
});
