import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import { POST } from "../app/api/operator/session/route.js";

const originalEnv = { ...process.env };
const password = "correct horse battery staple";
const salt = randomBytes(16).toString("hex");
const derived = scryptSync(password, Buffer.from(salt, "hex"), 64, {
  N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024,
}).toString("hex");

beforeEach(() => {
  process.env = {
    ...originalEnv,
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
