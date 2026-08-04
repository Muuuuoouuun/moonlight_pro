import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

let readiness = null;

try {
  readiness = await import("./integration-readiness.js");
} catch {
  // The first red run proves the new readiness contract does not exist yet.
}

let server;
let baseUrl;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/api/health" || req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("readiness module exists", () => {
  assert.ok(readiness, "integration-readiness.js must exist");
});

test("enables only explicitly registered Google OAuth providers", () => {
  const result = readiness.resolveGoogleOAuthProviderReadiness({
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_ENABLED_PROVIDERS: "calendar",
  });

  assert.equal(result.calendar.configured, true);
  assert.equal(result.gmail.configured, false);
  assert.equal(result.gmail.reason, "provider-not-enabled");
  assert.equal(result.sheets.configured, false);
});

test("exposes the same explicit provider gate to OAuth connect builders", () => {
  const env = {
    GOOGLE_OAUTH_ENABLED_PROVIDERS: "calendar,sheets",
  };

  assert.equal(readiness.isGoogleOAuthProviderEnabled("calendar", env), true);
  assert.equal(readiness.isGoogleOAuthProviderEnabled("gmail", env), false);
  assert.equal(readiness.isGoogleOAuthProviderEnabled("sheets", env), true);
});

test("builds provider status from the allowlist instead of generic client or ledger presence", () => {
  const env = {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_ENABLED_PROVIDERS: "calendar",
    COM_MOON_OAUTH_STATE_SECRET: "oauth-state",
  };

  assert.deepEqual(
    readiness.buildGoogleProviderStatus("gmail", { connected: false, ledgerConfigured: true }, env),
    {
      status: "disabled",
      configured: false,
      enabled: false,
      connected: false,
      ledgerConfigured: true,
      reason: "provider-not-enabled",
      callbackPath: "/api/email/gmail/callback",
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    },
  );
});

test("marks an enabled provider ready only when its OAuth client and state secret exist", () => {
  const base = {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_ENABLED_PROVIDERS: "sheets",
  };

  assert.equal(
    readiness.buildGoogleProviderStatus("sheets", { connected: false }, base).status,
    "missing-config",
  );
  assert.equal(
    readiness.buildGoogleProviderStatus(
      "sheets",
      { connected: false },
      { ...base, COM_MOON_OAUTH_STATE_SECRET: "oauth-state" },
    ).status,
    "ready",
  );
});

test("does not treat a shared webhook secret as an OAuth state secret", () => {
  const result = readiness.resolveSecretReadiness({
    COM_MOON_SHARED_WEBHOOK_SECRET: "shared-only",
  });

  assert.equal(result.oauthState.configured, false);
  assert.equal(result.sharedWebhook.configured, true);
});

test("resolves OAuth state signing material only from its dedicated secret", () => {
  assert.equal(
    readiness.resolveOAuthStateSecret({
      COM_MOON_SHARED_WEBHOOK_SECRET: "shared-only",
    }),
    "",
  );
  assert.equal(
    readiness.resolveOAuthStateSecret({
      COM_MOON_OAUTH_STATE_SECRET: "oauth-only",
      COM_MOON_SHARED_WEBHOOK_SECRET: "shared-only",
    }),
    "oauth-only",
  );
});

test("reports matching responsibility-specific secrets as coupled without exposing them", () => {
  const result = readiness.resolveSecretReadiness({
    COM_MOON_OAUTH_STATE_SECRET: "same-secret",
    COM_MOON_SHARED_WEBHOOK_SECRET: "same-secret",
    COM_MOON_HUB_WRITE_SECRET: "different-secret",
  });

  assert.equal(result.separated, false);
  assert.deepEqual(result.coupled, ["oauthState:sharedWebhook"]);
  assert.equal(JSON.stringify(result).includes("same-secret"), false);
});

test("probes Engine and OpenClaw health instead of trusting URL presence", async () => {
  const result = await readiness.resolveControlPlaneReadiness(
    {
      COM_MOON_ENGINE_URL: baseUrl,
      OPENCLAW_LOCAL_URL: `${baseUrl}/webhook/moonlight`,
    },
    { timeoutMs: 500 },
  );

  assert.deepEqual(result.engine, {
    configured: true,
    reachable: true,
    status: "live",
    reason: "ok",
  });
  assert.deepEqual(result.openclawRelay, {
    configured: true,
    reachable: true,
    status: "live",
    reason: "ok",
  });
});

test("marks an unreachable configured endpoint as degraded", async () => {
  const result = await readiness.resolveControlPlaneReadiness(
    {
      COM_MOON_ENGINE_URL: "http://127.0.0.1:1",
      OPENCLAW_LOCAL_URL: "http://127.0.0.1:1/webhook/moonlight",
    },
    { timeoutMs: 100 },
  );

  assert.equal(result.engine.configured, true);
  assert.equal(result.engine.reachable, false);
  assert.equal(result.engine.status, "degraded");
  assert.equal(result.openclawRelay.reachable, false);
});
