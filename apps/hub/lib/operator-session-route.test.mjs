import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";

import { POST } from "../app/api/operator/session/route.js";
import { operatorLoginTtl, verifyOperatorSessionToken } from "./operator-session.js";

const originalEnv = { ...process.env };
const password = "correct horse battery staple";
const salt = randomBytes(16).toString("hex");
const derived = scryptSync(password, Buffer.from(salt, "hex"), 64, {
  N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024,
}).toString("hex");

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: "development",
    VERCEL_ENV: "development",
    COM_MOON_OPERATOR_USERNAME: "moonlight",
    COM_MOON_OPERATOR_PASSWORD_HASH: `scrypt$131072$8$1$${salt}$${derived}`,
    COM_MOON_OPERATOR_SESSION_SECRET: "distinct-session-secret",
    COM_MOON_HUB_WRITE_SECRET: "server-only-secret",
  };
});
afterEach(() => { process.env = { ...originalEnv }; });

function login(body) {
  return POST(new Request("https://hub.example.com/api/operator/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://hub.example.com" },
    body: JSON.stringify(body),
  }));
}

test("username and password create a signed browser session", async () => {
  const response = await login({ username: "moonlight", password });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "authenticated");
  assert.match(response.headers.get("set-cookie") || "", /com_moon_operator_session=.*HttpOnly/);
});

test("remembered login aligns the signed expiry and persistent cookie at 30 days", async () => {
  for (const [rememberMe, seconds] of [[true, 30 * 86400], [false, 12 * 3600]]) {
    const response = await login({ username: "moonlight", password, rememberMe });
    const cookie = response.cookies.get("com_moon_operator_session");
    const verified = verifyOperatorSessionToken(cookie.value);
    assert.equal(verified.ok, true);
    assert.equal((verified.session.exp - verified.session.iat) / 1000, seconds);
    assert.match(response.headers.get("set-cookie"), new RegExp(`Max-Age=${seconds};`));
    assert.equal(verifyOperatorSessionToken(cookie.value, { now: verified.session.exp }).reason, "expired");
  }
  for (const rememberMe of [undefined, "true", 1, {}, null]) assert.equal(operatorLoginTtl(rememberMe), 12 * 3600);
});

test("wrong username or password and the old Hub secret get the same generic rejection", async () => {
  for (const body of [
    { username: "other", password },
    { username: "moonlight", password: "wrong password" },
    { secret: "server-only-secret" },
  ]) {
    const response = await login(body);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "invalid-operator-credentials");
  }
});

test("incomplete configuration and oversized login bodies fail closed", async () => {
  delete process.env.COM_MOON_OPERATOR_PASSWORD_HASH;
  const missing = await login({ username: "moonlight", password });
  assert.equal(missing.status, 503);
  process.env.COM_MOON_OPERATOR_PASSWORD_HASH = `scrypt$131072$8$1$${salt}$${derived}`;
  const oversized = await login({ username: "moonlight", password: "x".repeat(5000) });
  assert.equal(oversized.status, 413);
});

test("session changes reject cross-origin requests, while same-origin logout clears the cookie", async () => {
  for (const action of [{ username: "moonlight", password }, { action: "logout" }]) {
    const response = await POST(new Request("https://hub.example.com/api/operator/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://other.example.com" },
      body: JSON.stringify(action),
    }));
    assert.equal(response.status, 403);
  }
  const loggedOut = await login({ action: "logout" });
  assert.equal(loggedOut.status, 200);
  assert.match(loggedOut.headers.get("set-cookie") || "", /Max-Age=0/);
});

function localSessionRequest(body, headers = { origin: "http://127.0.0.1:3000" }) {
  return new NextRequest("http://127.0.0.1:3000/api/operator/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("development login accepts NextRequest's normalized loopback origin", async () => {
  const request = localSessionRequest({ username: "moonlight", password });
  assert.equal(new URL(request.url).origin, "http://localhost:3000");
  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "authenticated");
  assert.match(response.headers.get("set-cookie") || "", /com_moon_operator_session=.*HttpOnly/);
});

test("development logout accepts NextRequest's normalized loopback origin", async () => {
  const response = await POST(localSessionRequest({ action: "logout" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "logged_out");
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});

test("development session changes accept an equivalent loopback Referer when Origin is absent", async () => {
  const response = await POST(localSessionRequest({ action: "logout" }, {
    referer: "http://127.0.0.1:3000/login",
  }));
  assert.equal(response.status, 200);
});

test("either production runtime setting rejects loopback aliases", async () => {
  for (const productionVariable of ["NODE_ENV", "VERCEL_ENV"]) {
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "development";
    process.env[productionVariable] = "production";
    for (const body of [{ username: "moonlight", password }, { action: "logout" }]) {
      const response = await POST(localSessionRequest(body));
      assert.equal(response.status, 403, productionVariable);
      assert.equal((await response.json()).error, "same-origin-required");
    }
    const exactOrigin = await POST(localSessionRequest({ action: "logout" }, {
      origin: "http://localhost:3000",
    }));
    assert.equal(exactOrigin.status, 200, productionVariable);
  }
});

test("development loopback aliases still reject different ports, protocols and external origins", async () => {
  for (const origin of [
    "http://127.0.0.1:3001",
    "https://127.0.0.1:3000",
    "https://other.example.com",
    "http://localhost.evil.example.com:3000",
    "http://127.0.0.1.evil.example.com:3000",
  ]) {
    const response = await POST(localSessionRequest({ action: "logout" }, { origin }));
    assert.equal(response.status, 403, origin);
    assert.equal((await response.json()).error, "same-origin-required");
  }
});

test("development loopback aliases require valid browser origin evidence", async () => {
  for (const headers of [
    {},
    { origin: "null" },
    { origin: "invalid", referer: "http://127.0.0.1:3000/login" },
    { origin: "https://other.example.com", referer: "http://127.0.0.1:3000/login" },
  ]) {
    const response = await POST(localSessionRequest({ action: "logout" }, headers));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "same-origin-required");
  }
});

test("development loopback aliases do not authorize a deployed request origin", async () => {
  const response = await POST(new NextRequest("https://hub.example.com/api/operator/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ action: "logout" }),
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "same-origin-required");
});
