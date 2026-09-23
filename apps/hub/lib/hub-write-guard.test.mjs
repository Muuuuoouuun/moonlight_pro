import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { HUB_WRITE_SECRET_HEADER, assertHubWriteAllowed } from "./hub-write-guard.js";
import { createOperatorSessionToken, OPERATOR_SESSION_COOKIE } from "./operator-session.js";

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

test("production browser writes require a signed operator session and exact same origin", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_OPERATOR_SESSION_SECRET = "separate-session-secret";
  process.env.COM_MOON_OPERATOR_USERNAME = "moonlight";
  process.env.COM_MOON_OPERATOR_PASSWORD_HASH = `scrypt$131072$8$1$${'a'.repeat(32)}$${'b'.repeat(128)}`;
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  const cookie = `${OPERATOR_SESSION_COOKIE}=${createOperatorSessionToken()}`;

  assert.equal(assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com", cookie })), null);
  assert.equal(assertHubWriteAllowed(makeRequest({ referer: "https://hub.example.com/dashboard", cookie })), null);
  for (const headers of [
    { origin: "https://hub.example.com" },
    { origin: "https://evil.example.com", cookie },
    { origin: "https://other.example.com", cookie },
  ]) {
    const denied = assertHubWriteAllowed(makeRequest(headers));
    assert.ok(denied instanceof Response);
    assert.equal(denied.status, 403);
  }
  delete process.env.COM_MOON_OPERATOR_PASSWORD_HASH;
  const revoked = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com", cookie }));
  assert.ok(revoked instanceof Response);
  assert.equal(revoked.status, 403);
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

test("production localhost requires a signed session for browser writes", () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "http://127.0.0.1:3000";
  process.env.COM_MOON_HUB_WRITE_SECRET = "server-only-secret";

  const result = assertHubWriteAllowed(makeRequest(
    { origin: "http://127.0.0.1:3000" },
    "http://127.0.0.1:3000/api/hub/projects",
  ));

  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
});

test("production loopback aliases do not bypass browser authentication", async () => {
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

  assert.ok(aliasResult instanceof Response);
  assert.equal(aliasResult.status, 401);
  assert.ok(wrongPortResult instanceof Response);
  assert.equal(wrongPortResult.status, 401);
});

test("브라우저 거절 문구는 운영자가 읽을 한국어 안내다", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_URL = "https://hub.example.com";
  delete process.env.COM_MOON_HUB_WRITE_SECRET;

  const result = assertHubWriteAllowed(makeRequest({ origin: "https://hub.example.com" }));
  const body = await result.json();

  assert.equal(body.status, "forbidden");
  assert.equal(body.error, "로그인 후 다시 시도하세요.");
  // 영어 원문이 운영자 화면에 그대로 노출되던 회귀를 막는다 (DESIGN.md §10).
  assert.ok(!/Hub write routes/.test(body.error));
});

test("서버 간 호출 거절은 시크릿 문제임을 그대로 말한다", async () => {
  process.env.NODE_ENV = "production";
  process.env.COM_MOON_HUB_WRITE_SECRET = "expected-secret";

  // Origin·Referer 없음 = 브라우저가 아니다 (MCP·스크립트).
  const result = assertHubWriteAllowed(makeRequest({ [HUB_WRITE_SECRET_HEADER]: "wrong" }));
  const body = await result.json();

  assert.equal(result.status, 401);
  assert.equal(body.error, "Hub 쓰기에는 유효한 Hub write secret이 필요합니다.");
});
