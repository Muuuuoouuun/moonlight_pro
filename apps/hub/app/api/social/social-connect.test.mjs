import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server.js";

import { GET as instagramConnect } from "./instagram/connect/route.js";
import { GET as threadsConnect } from "./meta/threads/connect/route.js";
import { decodeInstagramApiState } from "../../../lib/instagram-api.js";
import { decodeMetaThreadsState } from "../../../lib/meta-threads.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

for (const [provider, connect, decode] of [
  ["instagram_api", instagramConnect, decodeInstagramApiState],
  ["meta_threads", threadsConnect, decodeMetaThreadsState],
]) {
  test(`${provider} connect binds a known account and stores a one-time OAuth flow`, async () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
    process.env.COM_MOON_OAUTH_STATE_SECRET = "oauth-state-test-secret";
    process.env.COM_MOON_INSTAGRAM_APP_ID = "instagram-app";
    process.env.COM_MOON_INSTAGRAM_APP_SECRET = "instagram-secret";
    process.env.COM_MOON_META_THREADS_APP_ID = "threads-app";
    process.env.COM_MOON_META_THREADS_APP_SECRET = "threads-secret";
    let createdFlow = null;
    globalThis.fetch = async (url, options) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/brands")) return { ok: true, status: 200,
        text: async () => JSON.stringify([{ id: "brand-1" }]), headers: { get: () => null } };
      if (path.endsWith("/integration_connections")) return { ok: true, status: 200,
        text: async () => JSON.stringify([{ account_key: "account-1", config: { username: "ml_bridgemaker", brandKey: "bridgemaker" } }]),
        headers: { get: () => null } };
      if (path.endsWith("/social_oauth_flows") && options.method === "POST") {
        createdFlow = JSON.parse(options.body);
        return { ok: true, status: 201, text: async () => "", headers: { get: () => null } };
      }
      throw new Error(`Unexpected request ${path}`);
    };
    const req = new NextRequest(`http://localhost:3000/api/social/connect?brand=ml_bridgemaker&brandKey=bridgemaker`);
    const response = await connect(req);
    const location = new URL(response.headers.get("location"));
    const state = decode(location.searchParams.get("state"));
    assert.equal(state.provider, provider);
    assert.equal(state.expectedAccountId, "account-1");
    assert.equal(state.brandKey, "bridgemaker");
    assert.equal(createdFlow.provider, provider);
    assert.equal(createdFlow.workspace_id, state.workspaceId);
  });
}
