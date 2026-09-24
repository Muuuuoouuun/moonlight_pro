import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server.js";

import { GET as instagramStatus } from "./instagram/status/route.js";
import { GET as threadsStatus } from "./meta/threads/status/route.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

for (const [name, route, prefix] of [
  ["Instagram", instagramStatus, "COM_MOON_INSTAGRAM"],
  ["Threads", threadsStatus, "COM_MOON_META_THREADS"],
]) {
  test(`${name} status excludes a company account connected through another app`, async () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
    process.env.COM_MOON_OAUTH_STATE_SECRET = "state-secret";
    process.env[`${prefix}_CLASSMOON_APP_ID`] = "company-id";
    process.env[`${prefix}_CLASSMOON_APP_SECRET`] = "company-secret";
    const rows = [{ id: "other-app", status: "connected", account_key: "account-1", config: {
      brandHandle: "moon.classin", username: "moon.classin", brandKey: "classmoon",
      oauthAppId: "wrong-app-id", oauthAppKey: "classmoon",
    } }];
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => JSON.stringify(rows),
      headers: { get: () => null },
    });
    const url = "http://localhost:3000/api/social/status?brand=moon.classin&brandKey=classmoon&accountId=account-1";
    const wrong = await (await route(new NextRequest(url))).json();
    assert.equal(wrong.status, "ready");
    assert.equal(wrong.connection, null);
    assert.equal(wrong.brandKey, "classmoon");

    rows[0].config.oauthAppId = "company-id";
    const right = await (await route(new NextRequest(url))).json();
    assert.equal(right.status, "connected");
    assert.equal(right.connection?.id, "other-app");
  });

  test(`${name} status accepts an untagged BridgeMaker connection only for BridgeMaker`, async () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
    process.env.COM_MOON_OAUTH_STATE_SECRET = "state-secret";
    process.env[`${prefix}_APP_ID`] = "legacy-id";
    process.env[`${prefix}_APP_SECRET`] = "legacy-secret";
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify([{ id: "bridge-row", status: "connected", account_key: "bridge-id", config: {
        brandHandle: "ml_bridgemaker", username: "ml_bridgemaker", brandKey: null,
      } }]),
      headers: { get: () => null },
    });
    const result = await (await route(new NextRequest(
      "http://localhost:3000/api/social/status?brand=ml_bridgemaker&brandKey=bridgemaker",
    ))).json();
    assert.equal(result.status, "connected");
    assert.equal(result.connection?.id, "bridge-row");
  });
}
