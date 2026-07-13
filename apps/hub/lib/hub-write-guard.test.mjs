import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { HUB_WRITE_SECRET_HEADER, assertHubWriteAllowed } from "./hub-write-guard.js";

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
