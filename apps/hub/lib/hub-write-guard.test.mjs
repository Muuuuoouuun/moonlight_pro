import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { HUB_WRITE_SECRET_HEADER, assertHubWriteAllowed } from "./hub-write-guard.js";
import { OPERATOR_SESSION_COOKIE, createOperatorSessionToken } from "./operator-session.js";

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

test("production hub writes require the Hub write secret even for same-origin requests", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  delete process.env.COM_MOON_HUB_WRITE_SECRET;

  const result = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com" }));

  assert.ok(result instanceof Response);
  assert.equal(result.status, 403);
  assert.equal((await result.json()).status, "forbidden");
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

test("local hub writes keep the same-origin fallback for smoke testing", () => {
  process.env.NODE_ENV = "development";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  delete process.env.COM_MOON_HUB_WRITE_SECRET;

  const result = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com" }));

  assert.equal(result, null);
});

test("production hub writes allow a valid operator session cookie on same-origin requests", () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  process.env.COM_MOON_OPERATOR_SESSION_SECRET = "session-secret";
  const token = createOperatorSessionToken();

  const result = assertHubWriteAllowed(
    makeRequest({
      origin: "https://hub.example.com",
      cookie: `${OPERATOR_SESSION_COOKIE}=${token}`,
    }),
  );

  assert.equal(result, null);
});

test("production hub writes reject tampered operator session cookies", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  process.env.COM_MOON_OPERATOR_SESSION_SECRET = "session-secret";
  const token = `${createOperatorSessionToken()}x`;

  const result = assertHubWriteAllowed(
    makeRequest({
      origin: "https://hub.example.com",
      cookie: `${OPERATOR_SESSION_COOKIE}=${token}`,
    }),
  );

  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
});

test("production hub writes reject expired operator session cookies", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  process.env.COM_MOON_OPERATOR_SESSION_SECRET = "session-secret";
  const token = createOperatorSessionToken({ ttlSeconds: 1, now: Date.now() - 60000 });

  const result = assertHubWriteAllowed(
    makeRequest({
      origin: "https://hub.example.com",
      cookie: `${OPERATOR_SESSION_COOKIE}=${token}`,
    }),
  );

  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
});

test("production hub writes reject valid operator sessions from cross-origin requests", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";
  process.env.COM_MOON_OPERATOR_SESSION_SECRET = "session-secret";
  const token = createOperatorSessionToken();

  const result = assertHubWriteAllowed(
    makeRequest({
      origin: "https://evil.example.com",
      cookie: `${OPERATOR_SESSION_COOKIE}=${token}`,
    }),
  );

  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
});
