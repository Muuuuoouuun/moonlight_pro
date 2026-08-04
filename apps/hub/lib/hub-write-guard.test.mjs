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

function makeRequest(headers = {}, url = "https://hub.example.com/api/projects/update") {
  return new Request(url, {
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

test("production localhost allows same-origin browser writes without exposing a secret", () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "http://127.0.0.1:3000";
  process.env.COM_MOON_HUB_WRITE_SECRET = "server-only-secret";

  const result = assertHubWriteAllowed(makeRequest(
    { origin: "http://127.0.0.1:3000" },
    "http://127.0.0.1:3000/api/hub/projects",
  ));

  assert.equal(result, null);
});

test("production loopback accepts localhost and 127 aliases only on the same port", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "http://localhost:3000";
  process.env.COM_MOON_HUB_WRITE_SECRET = "server-only-secret";

  const aliasResult = assertHubWriteAllowed(makeRequest(
    { origin: "http://127.0.0.1:3000" },
    "http://localhost:3000/api/hub/projects",
  ));
  const wrongPortResult = assertHubWriteAllowed(makeRequest(
    { origin: "http://127.0.0.1:3001" },
    "http://localhost:3000/api/hub/projects",
  ));

  assert.equal(aliasResult, null);
  assert.ok(wrongPortResult instanceof Response);
  assert.equal(wrongPortResult.status, 401);
});
