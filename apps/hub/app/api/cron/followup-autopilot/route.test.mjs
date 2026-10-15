import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, beforeEach, afterEach, mock, test } from "node:test";
import { assertHubWriteAllowed } from "../../../../lib/hub-write-guard.js";

const routeUrl = new URL("./route.js", import.meta.url).href;
const dependencies = new Set();
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(routeUrl)) dependencies.add(specifier);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
after(() => hooks.deregister());
const { GET } = await import("./route.js");
let env;
let network;
beforeEach(() => {
  env = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "retired-cron-test-secret";
  process.env.COM_MOON_ENGINE_URL = "https://engine.test";
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "engine-test-secret";
  network = mock.method(globalThis, "fetch", async () => {
    throw new Error("A retired automation must not call the network");
  });
});
afterEach(() => {
  process.env = env;
  mock.restoreAll();
});

function request(headers = {}) {
  return new Request("https://hub.test/api/cron/followup-autopilot", { headers });
}

test("authenticated legacy execution returns 410 and directs requests to 고객", async () => {
  const response = await GET(request({ authorization: "Bearer retired-cron-test-secret" }));
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.status, "disabled");
  assert.equal(body.reason, "automation-retired");
  assert.match(body.message, /고객/);
  assert.match(body.message, /요청/);
  assert.equal(network.mock.callCount(), 0, "no model, database, or run-record requests");
});

test("retired route loads only the response and authentication dependencies", () => {
  assert.deepEqual([...dependencies].sort(), ["@/lib/hub-write-guard", "next/server"].sort());
});

for (const [label, headers, secret, status] of [
  ["missing credential", {}, "retired-cron-test-secret", 401],
  ["wrong credential", { authorization: "Bearer wrong-secret" }, "retired-cron-test-secret", 401],
  ["unconfigured secret", {}, "", 403],
  ["unauthenticated production browser", { origin: "https://hub.test" }, "retired-cron-test-secret", 401],
]) {
  test(`preserves the existing guard response for ${label}`, async () => {
    process.env.COM_MOON_HUB_WRITE_SECRET = secret;
    const expected = assertHubWriteAllowed(request(headers));
    const response = await GET(request(headers));
    assert.equal(response.status, status);
    assert.equal(response.status, expected.status);
    assert.deepEqual(await response.json(), await expected.json());
    assert.equal(network.mock.callCount(), 0);
  });
}
