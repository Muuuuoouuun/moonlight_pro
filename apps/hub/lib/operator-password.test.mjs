import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, test } from "node:test";

import { hasOperatorSessionSecret } from "./operator-session.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

const password = "correct horse battery staple";
const salt = randomBytes(16).toString("hex");
const derived = scryptSync(password, Buffer.from(salt, "hex"), 64, {
  N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024,
}).toString("hex");
const passwordHash = `scrypt$131072$8$1$${salt}$${derived}`;

test("only an explicit session secret can sign browser sessions", () => {
  delete process.env.COM_MOON_OPERATOR_SESSION_SECRET;
  process.env.COM_MOON_HUB_WRITE_SECRET = "server-secret";
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "engine-secret";
  assert.equal(hasOperatorSessionSecret(), false);
  process.env.COM_MOON_OPERATOR_SESSION_SECRET = "separate-session-secret";
  assert.equal(hasOperatorSessionSecret(), true);
});

test("the configured username and salted password hash authorize one operator", async () => {
  process.env.COM_MOON_OPERATOR_USERNAME = "moonlight";
  process.env.COM_MOON_OPERATOR_PASSWORD_HASH = passwordHash;
  const module = await import("./operator-session.js");
  assert.equal(typeof module.operatorLoginCredentialsMatch, "function");
  assert.equal(await module.operatorLoginCredentialsMatch("moonlight", password), true);
  assert.equal(await module.operatorLoginCredentialsMatch("moonlight", "wrong password"), false);
  assert.equal(await module.operatorLoginCredentialsMatch("other", password), false);
});

test("missing or malformed credential configuration fails closed", async () => {
  const module = await import("./operator-session.js");
  delete process.env.COM_MOON_OPERATOR_USERNAME;
  delete process.env.COM_MOON_OPERATOR_PASSWORD_HASH;
  assert.equal(module.hasOperatorLoginCredentials?.(), false);
  assert.equal(await module.operatorLoginCredentialsMatch?.("moonlight", password), false);
  process.env.COM_MOON_OPERATOR_USERNAME = "moonlight";
  process.env.COM_MOON_OPERATOR_PASSWORD_HASH = "plaintext-password";
  assert.equal(module.hasOperatorLoginCredentials?.(), false);
  assert.equal(await module.operatorLoginCredentialsMatch?.("moonlight", password), false);
});

test("credential generator creates a fresh salted hash that authenticates", async () => {
  const module = await import("./operator-session.js");
  assert.equal(typeof module.createOperatorPasswordHash, "function");
  const hash = await module.createOperatorPasswordHash(password);
  assert.match(hash, /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  process.env.COM_MOON_OPERATOR_USERNAME = "moonlight";
  process.env.COM_MOON_OPERATOR_PASSWORD_HASH = hash;
  assert.equal(await module.operatorLoginCredentialsMatch("moonlight", password), true);
});
