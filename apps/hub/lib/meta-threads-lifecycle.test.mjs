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
      text: async () => JSON.stringify([
        { id: "company-row", config: { userId: "shared-id", oauthAppId: "company-id", oauthAppKey: "classmoon" } },
        { id: "politic-row", config: { userId: "shared-id", oauthAppId: "politic-id", oauthAppKey: "politic_officer" } },
      ]), headers: { get: () => null },
    };
    const id = new URL(url).searchParams.get("id");
    changed.push(id);
    return { ok: true, status: 200, text: async () => JSON.stringify([{ id: id.replace(/^eq\./, "") }]), headers: { get: () => null } };
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
  await assert.rejects(disableMetaThreadsConnectionsForUser({
    workspaceId: "workspace-1", userId: "shared-id",
  }), /threads-connection-identity-missing/);
  assert.equal(calls, 0);
});

test("Threads lifecycle reports a database read failure instead of an empty account set", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: false, status: 503, text: async () => "database unavailable", headers: { get: () => null },
  });
  await assert.rejects(disableMetaThreadsConnectionsForUser({
    workspaceId: "workspace-1", userId: "shared-id", appId: "company-id", appKey: "classmoon",
  }), /threads-connection-read-failed/);
});

test("Threads lifecycle scans beyond the first page and updates every matching connection", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: `company-${index}`, config: { userId: "shared-id", oauthAppId: "company-id", oauthAppKey: "classmoon" },
  }));
  const offsets = [];
  const changed = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (!options.method || options.method === "GET") {
      const offset = Number(parsed.searchParams.get("offset") || 0);
      offsets.push(offset);
      return {
        ok: true, status: 200, text: async () => JSON.stringify(rows.slice(offset, offset + 100)),
        headers: { get: () => null },
      };
    }
    const id = parsed.searchParams.get("id").replace(/^eq\./, "");
    changed.push(id);
    return {
      ok: true, status: 200, text: async () => JSON.stringify([{ id }]),
      headers: { get: () => null },
    };
  };

  const result = await disableMetaThreadsConnectionsForUser({
    workspaceId: "workspace-1", userId: "shared-id", appId: "company-id", appKey: "classmoon",
  });
  assert.deepEqual(result, { matched: 101, updated: 101 });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(changed.length, 101);
});

test("Threads lifecycle rejects a partial update response", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  globalThis.fetch = async (_url, options) => !options.method || options.method === "GET"
    ? { ok: true, status: 200, text: async () => JSON.stringify([{
      id: "company-row", config: { userId: "shared-id", oauthAppId: "company-id", oauthAppKey: "classmoon" },
    }]), headers: { get: () => null } }
    : { ok: true, status: 200, text: async () => "[]", headers: { get: () => null } };
  await assert.rejects(disableMetaThreadsConnectionsForUser({
    workspaceId: "workspace-1", userId: "shared-id", appId: "company-id", appKey: "classmoon",
  }), /threads-connection-update-failed/);
});
