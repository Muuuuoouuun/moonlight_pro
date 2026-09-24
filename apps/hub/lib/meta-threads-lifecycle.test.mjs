import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";

import { disableMetaThreadsConnectionsForUser, parseMetaThreadsSignedRequest } from "./meta-threads.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function signedRequest(secret, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${signature}.${encoded}`;
}

test("Threads lifecycle verifies the exact dedicated app secret", () => {
  process.env.COM_MOON_META_THREADS_APP_ID = "legacy-id";
  process.env.COM_MOON_META_THREADS_APP_SECRET = "legacy-secret";
  process.env.COM_MOON_META_THREADS_CLASSMOON_APP_ID = "company-id";
  process.env.COM_MOON_META_THREADS_CLASSMOON_APP_SECRET = "company-secret";
  const payload = { algorithm: "HMAC-SHA256", user_id: "company-user" };

  const company = parseMetaThreadsSignedRequest(signedRequest("company-secret", payload));
  assert.equal(company.valid, true);
  assert.deepEqual([company.appKey, company.appId], ["classmoon", "company-id"]);
  assert.equal(parseMetaThreadsSignedRequest(signedRequest("other-secret", payload)).valid, false);
});

test("a Threads lifecycle callback only disables a connection from the signing app", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const changed = [];
  globalThis.fetch = async (url, options) => {
    if (!options.method || options.method === "GET") return {
      ok: true, status: 200,
      json: async () => [
        { id: "company-row", config: { userId: "shared-id", oauthAppId: "company-id", oauthAppKey: "classmoon" } },
        { id: "politic-row", config: { userId: "shared-id", oauthAppId: "politic-id", oauthAppKey: "politic_officer" } },
      ],
    };
    changed.push(new URL(url).searchParams.get("id"));
    return { ok: true, status: 204, text: async () => "", headers: { get: () => null } };
  };

  const result = await disableMetaThreadsConnectionsForUser({
    workspaceId: "workspace-1", userId: "shared-id", appId: "company-id", appKey: "classmoon",
  });
  assert.deepEqual(result, { matched: 1, updated: 1 });
  assert.deepEqual(changed, ["eq.company-row"]);
});

test("Threads lifecycle never disables an account without verified app identity", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => [{
      id: "legacy-row", config: { userId: "shared-id" },
    }] };
  };
  assert.deepEqual(await disableMetaThreadsConnectionsForUser({
    workspaceId: "workspace-1", userId: "shared-id",
  }), { matched: 0, updated: 0 });
  assert.equal(calls, 0);
});
