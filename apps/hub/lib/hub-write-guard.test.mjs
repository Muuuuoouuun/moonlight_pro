import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import * as hubWriteGuard from "./hub-write-guard.js";

const {
  HUB_OPERATOR_SESSION_COOKIE,
  HUB_WRITE_SECRET_HEADER,
  assertHubWriteAllowed,
  createHubOperatorSession,
  verifyHubOperatorSessionToken,
} = hubWriteGuard;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makeRequest(headers = {}) {
  return new Request("https://hub.example.com/api/projects/update", {
    method: "POST",
    headers,
  });
}

function decodeTokenPayload(token) {
  const [encodedPayload] = token.split(".");
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
}

test("an unconfigured production write secret returns a retryable degraded response", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  delete process.env.COM_MOON_HUB_WRITE_SECRET;

  const result = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com" }));

  assert.ok(result instanceof Response);
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), {
    status: "degraded",
    httpStatus: 503,
    retryable: true,
    reason: "write-secret-not-configured",
    error: "Hub write secret is not configured.",
  });
});

test("a configured write secret rejects missing and invalid credentials consistently", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";

  for (const headers of [{}, { [HUB_WRITE_SECRET_HEADER]: "wrong-secret" }]) {
    const result = assertHubWriteAllowed(makeRequest(headers));

    assert.ok(result instanceof Response);
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), {
      status: "failed",
      httpStatus: 401,
      retryable: false,
      reason: "unauthorized",
      error: "Hub write routes require a valid Hub write secret.",
    });
  }
});

test("production hub writes allow a matching Hub write secret", () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";

  const result = assertHubWriteAllowed(
    makeRequest({
      [HUB_WRITE_SECRET_HEADER]: "expected-secret",
    }),
  );

  assert.equal(result, null);
});

test("production same-origin writes still require the configured Hub write secret", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";

  const result = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com" }));

  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).reason, "unauthorized");
});

test("Web Crypto sessions cross-verify with the synchronous write guard and expire on time", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  const now = Date.UTC(2026, 6, 13, 9, 0, 0);

  const session = await createHubOperatorSession("expected-secret", {
    now,
    nonce: "fixed-test-nonce",
    ttlMs: 60_000,
  });

  assert.ok(session);
  assert.deepEqual(decodeTokenPayload(session.token), {
    v: 1,
    exp: now + 60_000,
    nonce: "fixed-test-nonce",
  });
  assert.doesNotMatch(session.token, /expected-secret/);
  assert.equal(verifyHubOperatorSessionToken(session.token, { now: now + 59_999 }), true);
  assert.equal(verifyHubOperatorSessionToken(session.token, { now: now + 60_000 }), false);
});

test("production hub writes allow a valid operator session cookie", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  const now = Date.UTC(2026, 6, 13, 9, 0, 0);
  const session = await createHubOperatorSession("expected-secret", {
    now,
    nonce: "fixed-test-nonce",
    ttlMs: 60_000,
  });

  const result = assertHubWriteAllowed(
    makeRequest({
      cookie: `${HUB_OPERATOR_SESSION_COOKIE}=${session.token}`,
      origin: "https://hub.example.com",
    }),
    { now: now + 1 },
  );

  assert.equal(result, null);
});

test("expired and tampered operator session cookies do not relax production writes", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  const now = Date.UTC(2026, 6, 13, 9, 0, 0);
  const session = await createHubOperatorSession("expected-secret", {
    now,
    nonce: "fixed-test-nonce",
    ttlMs: 60_000,
  });
  const [payload, signature] = session.token.split(".");
  const credentials = [
    { token: session.token, checkedAt: now + 60_000 },
    { token: `${payload}.${signature.slice(0, -1)}x`, checkedAt: now + 1 },
  ];

  for (const { token, checkedAt } of credentials) {
    const result = assertHubWriteAllowed(
      makeRequest({ cookie: `${HUB_OPERATOR_SESSION_COOKIE}=${token}` }),
      { now: checkedAt },
    );

    assert.ok(result instanceof Response);
    assert.equal(result.status, 401);
    assert.equal((await result.json()).reason, "unauthorized");
  }
});

test("operator session route validates the secret and manages a secure HttpOnly cookie", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  const { DELETE, GET, POST } = await import("../app/api/hub/session/route.js");

  const rejected = await POST(
    new Request("https://hub.example.com/api/hub/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "wrong-secret" }),
    }),
  );
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get("set-cookie"), null);
  assert.deepEqual(await rejected.json(), { unlocked: false });

  const unlocked = await POST(
    new Request("https://hub.example.com/api/hub/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "expected-secret" }),
    }),
  );
  assert.equal(unlocked.status, 200);
  assert.deepEqual(await unlocked.json(), { unlocked: true });

  const setCookie = unlocked.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, new RegExp(`^${HUB_OPERATOR_SESSION_COOKIE}=`));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\//i);
  assert.doesNotMatch(setCookie, /expected-secret/);

  const cookie = setCookie.split(";", 1)[0];
  const status = await GET(
    new Request("https://hub.example.com/api/hub/session", {
      headers: { cookie },
    }),
  );
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { unlocked: true });

  const locked = await DELETE();
  assert.equal(locked.status, 200);
  assert.deepEqual(await locked.json(), { unlocked: false });
  assert.match(locked.headers.get("set-cookie") || "", /Max-Age=0/i);
});

test("operator session POST reuses the shared JSON body limit", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  const { POST } = await import("../app/api/hub/session/route.js");

  const result = await POST(
    new Request("https://hub.example.com/api/hub/session", {
      method: "POST",
      headers: {
        "content-length": String(65 * 1024),
        "content-type": "application/json",
      },
      body: JSON.stringify({ secret: "expected-secret" }),
    }),
  );

  assert.equal(result.status, 413);
  assert.equal((await result.json()).status, "payload-too-large");
});

test("local hub writes keep the same-origin fallback for smoke testing", () => {
  process.env.NODE_ENV = "development";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  delete process.env.COM_MOON_HUB_WRITE_SECRET;

  const result = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com" }));

  assert.equal(result, null);
});

test("local same-origin writes remain available when a Hub write secret is configured", () => {
  process.env.NODE_ENV = "development";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";

  const result = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com" }));

  assert.equal(result, null);
});
