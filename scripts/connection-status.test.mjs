import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

let status = null;

try {
  status = await import("./connection-status.mjs");
} catch {
  // Red phase: optional provider status reporting does not exist yet.
}

test("separates configured Google OAuth from disabled and misconfigured providers", () => {
  assert.ok(status, "connection-status.mjs must exist");
  assert.deepEqual(
    status.summarizeGoogleOAuthProviders({
      integrations: {
        googleOAuth: {
          calendar: { enabled: true, configured: true, reason: "ok" },
          gmail: { enabled: false, configured: false, reason: "provider-not-enabled" },
          sheets: { enabled: true, configured: false, reason: "missing-client" },
        },
      },
    }),
    [
      { provider: "Calendar", level: "PASS", detail: "enabled/configured" },
      { provider: "Gmail", level: "INFO", detail: "disabled (provider-not-enabled)" },
      { provider: "Sheets", level: "WARN", detail: "enabled/not-configured (missing-client)" },
    ],
  );
});

test("health checks use only the matching server credential and refuse redirects", () => {
  const env = { COM_MOON_HUB_WRITE_SECRET: " hub-health-secret ", COM_MOON_SHARED_WEBHOOK_SECRET: " engine-health-secret " };
  assert.deepEqual(status.healthRequestOptions("hub", env), {
    headers: { "x-com-moon-hub-write-secret": "hub-health-secret" }, redirect: "error",
  });
  assert.deepEqual(status.healthRequestOptions("engine", env), {
    headers: { "x-com-moon-shared-secret": "engine-health-secret" }, redirect: "error",
  });
  assert.deepEqual(status.healthRequestOptions("hub", {}), { headers: {}, redirect: "error" });
  assert.deepEqual(status.healthRequestOptions("engine", {}), { headers: {}, redirect: "error" });
});

test("public health remains a valid readiness result without pretending diagnostics were checked", () => {
  for (const field of ["ok", "reachable"]) {
    const publicHealth = { status: "ok", database: { supabase: { [field]: true } } };
    assert.equal(status.healthSupabaseOk(publicHealth), true);
    assert.equal(status.healthSupabaseOk({ database: { supabase: { [field]: false } } }), false);
    assert.ok(status.summarizeGoogleOAuthProviders(publicHealth).every(provider =>
      provider.level === "INFO" && provider.detail === "not checked (server credential required)"));
  }
  assert.equal(status.healthSupabaseOk({ status: "ok" }), false);
});

test("health credential is not forwarded to a redirected destination", async t => {
  let redirectedRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/api/health") {
      assert.equal(req.headers["x-com-moon-hub-write-secret"], "health-redirect-test-secret");
      res.writeHead(302, { location: "/redirected" }).end();
    } else {
      redirectedRequests += 1;
      res.end("{}");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  await assert.rejects(fetch(url, status.healthRequestOptions("hub", { COM_MOON_HUB_WRITE_SECRET: "health-redirect-test-secret" })));
  assert.equal(redirectedRequests, 0);
});
