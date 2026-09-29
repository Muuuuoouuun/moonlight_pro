import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { consumeSocialOAuthFlow, registerSocialOAuthFlow } from "./social-oauth-flow.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const state = {
  provider: "instagram_api",
  workspaceId: "11111111-1111-1111-1111-111111111111",
  nonce: "a".repeat(43),
  appKey: "moonlight",
  appId: "instagram-app-id",
  iat: Date.now(),
};

test("OAuth flow stores a nonce hash and consumes it exactly once", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  let stored = null;
  let used = false;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/rest/v1/social_oauth_flows");
    if (options.method === "POST") {
      stored = JSON.parse(options.body);
      assert.notEqual(stored.nonce_hash, state.nonce);
      assert.equal(stored.nonce_hash.length, 64);
      assert.equal(stored.app_key, state.appKey);
      assert.equal(stored.app_id, state.appId);
      return { ok: true, status: 201, text: async () => "", headers: { get: () => null } };
    }
    assert.equal(options.method, "PATCH");
    assert.equal(parsed.searchParams.get("nonce_hash"), `eq.${stored.nonce_hash}`);
    assert.equal(parsed.searchParams.get("provider"), "eq.instagram_api");
    assert.equal(parsed.searchParams.get("workspace_id"), `eq.${state.workspaceId}`);
    assert.equal(parsed.searchParams.get("app_key"), `eq.${state.appKey}`);
    assert.equal(parsed.searchParams.get("app_id"), `eq.${state.appId}`);
    assert.equal(parsed.searchParams.get("consumed_at"), "is.null");
    const rows = used ? [] : [{ nonce_hash: stored.nonce_hash }];
    used = true;
    return { ok: true, status: 200, text: async () => JSON.stringify(rows), headers: { get: () => null } };
  };

  assert.equal(await registerSocialOAuthFlow(state), true);
  assert.equal(await consumeSocialOAuthFlow(state), true);
  assert.equal(await consumeSocialOAuthFlow(state), false);
});

test("OAuth flow fails closed when durable storage is unavailable", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(await registerSocialOAuthFlow(state), false);
  assert.equal(await consumeSocialOAuthFlow(state), false);
});

test("OAuth flow rejects malformed nonce and unknown provider before storage", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected fetch"); };
  assert.equal(await registerSocialOAuthFlow({ ...state, nonce: "short" }), false);
  assert.equal(await consumeSocialOAuthFlow({ ...state, provider: "youtube" }), false);
  assert.equal(await consumeSocialOAuthFlow({ ...state, appKey: "unknown" }), false);
  assert.equal(calls, 0);
});
