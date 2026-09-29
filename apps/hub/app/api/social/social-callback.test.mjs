import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server.js";

import { GET as instagramCallback } from "./instagram/callback/route.js";
import { GET as threadsCallback } from "./meta/threads/callback/route.js";
import { buildInstagramApiAuthUrl } from "../../../lib/instagram-api.js";
import { buildMetaThreadsAuthUrl } from "../../../lib/meta-threads.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

for (const [provider, callback, authUrl] of [
  ["instagram", instagramCallback, buildInstagramApiAuthUrl],
  ["metaThreads", threadsCallback, buildMetaThreadsAuthUrl],
]) {
  test(`${provider} Class.Moon callback saves the verified account under its company app`, async () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.COM_MOON_OAUTH_STATE_SECRET = "oauth-state-test-secret";
    process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_ID = "company-instagram-id";
    process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET = "company-instagram-secret";
    process.env.COM_MOON_META_THREADS_CLASSMOON_APP_ID = "company-threads-id";
    process.env.COM_MOON_META_THREADS_CLASSMOON_APP_SECRET = "company-threads-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const appId = provider === "instagram" ? "company-instagram-id" : "company-threads-id";
    const appSecret = provider === "instagram" ? "company-instagram-secret" : "company-threads-secret";
    const state = new URL(authUrl({
      origin: "http://localhost:3000", workspaceId: "11111111-1111-1111-1111-111111111111",
      brandHandle: "moon.classin", brandKey: "classmoon",
    })).searchParams.get("state");
    const nonce = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8")).nonce;
    const nonceHash = createHash("sha256").update(nonce).digest("hex");
    let saved = null;
    const reply = (payload, status = 200) => ({
      ok: true, status, text: async () => JSON.stringify(payload),
      json: async () => payload, headers: { get: () => null },
    });
    globalThis.fetch = async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/social_oauth_flows")) {
        assert.equal(parsed.searchParams.get("app_id"), `eq.${appId}`);
        return reply([{ nonce_hash: nonceHash }]);
      }
      if (parsed.pathname.endsWith("/oauth/access_token")) {
        assert.equal(new URLSearchParams(options.body).get("client_secret"), appSecret);
        return reply({ access_token: "short-token", expires_in: 3600 });
      }
      if (parsed.pathname.endsWith("/access_token")) {
        assert.equal(parsed.searchParams.get("client_secret"), appSecret);
        return reply({ access_token: "long-token", expires_in: 3600 });
      }
      if (parsed.pathname.endsWith("/me")) return reply({ id: "verified-id", username: "moon.classin" });
      if (parsed.pathname.endsWith("/integration_connections") && options.method === "GET") return reply([]);
      if (parsed.pathname.endsWith("/integration_connections") && options.method === "POST") {
        saved = JSON.parse(options.body)[0];
        return reply([{ id: "connection-id" }], 201);
      }
      if (parsed.pathname.endsWith("/sync_runs")) return reply([], 201);
      throw new Error(`Unexpected request: ${parsed.pathname}`);
    };

    const response = await callback(new NextRequest(
      `http://localhost:3000/api/social/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    ));
    assert.equal(new URL(response.headers.get("location")).searchParams.get(provider), "connected");
    assert.equal(saved?.config?.brandKey, "classmoon");
    assert.equal(saved?.config?.oauthAppId, appId);
    assert.equal(saved?.config?.oauthAppKey, "classmoon");
  });

  test(`${provider} callback stops before storage and token exchange if the app ID changes`, async () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.COM_MOON_OAUTH_STATE_SECRET = "oauth-state-test-secret";
    process.env.COM_MOON_INSTAGRAM_APP_ID = "instagram-app";
    process.env.COM_MOON_INSTAGRAM_APP_SECRET = "instagram-secret";
    process.env.COM_MOON_META_THREADS_APP_ID = "threads-app";
    process.env.COM_MOON_META_THREADS_APP_SECRET = "threads-secret";
    const state = new URL(authUrl({
      origin: "http://localhost:3000", workspaceId: "11111111-1111-1111-1111-111111111111",
      brandHandle: "ml_bridgemaker", brandKey: "bridgemaker",
    })).searchParams.get("state");
    if (provider === "instagram") process.env.COM_MOON_INSTAGRAM_APP_ID = "replaced-id";
    else process.env.COM_MOON_META_THREADS_APP_ID = "replaced-id";
    let calls = 0;
    const nonce = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8")).nonce;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify([{ nonce_hash: createHash("sha256").update(nonce).digest("hex") }]),
        headers: { get: () => null },
      };
    };

    const response = await callback(new NextRequest(
      `http://localhost:3000/api/social/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    ));
    assert.equal(new URL(response.headers.get("location")).searchParams.get(provider), "invalid-state");
    assert.equal(calls, 0);
  });

  test(`${provider} callback rejects an unregistered or replayed state before token exchange`, async () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.COM_MOON_OAUTH_STATE_SECRET = "oauth-state-test-secret";
    process.env.COM_MOON_INSTAGRAM_APP_ID = "instagram-app";
    process.env.COM_MOON_INSTAGRAM_APP_SECRET = "instagram-secret";
    process.env.COM_MOON_META_THREADS_APP_ID = "threads-app";
    process.env.COM_MOON_META_THREADS_APP_SECRET = "threads-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const state = new URL(authUrl({
      origin: "http://localhost:3000", workspaceId: "11111111-1111-1111-1111-111111111111",
      brandHandle: "ml_bridgemaker",
    })).searchParams.get("state");
    let tokenCalls = 0;
    globalThis.fetch = async (url, options) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/social_oauth_flows") && options.method === "PATCH") {
        return { ok: true, status: 200, text: async () => "[]", headers: { get: () => null } };
      }
      if (path.endsWith("/sync_runs")) {
        return { ok: true, status: 201, text: async () => "", headers: { get: () => null } };
      }
      tokenCalls += 1;
      return { ok: false, status: 400, text: async () => "unexpected token call", headers: { get: () => null } };
    };

    const response = await callback(new NextRequest(
      `http://localhost:3000/api/social/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    ));
    const location = new URL(response.headers.get("location"));
    assert.equal(location.searchParams.get(provider), "invalid-state");
    assert.equal(tokenCalls, 0);
  });

  test(`${provider} callback rejects a matching handle with a replaced account ID`, async () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.COM_MOON_OAUTH_STATE_SECRET = "oauth-state-test-secret";
    process.env.COM_MOON_INSTAGRAM_APP_ID = "instagram-app";
    process.env.COM_MOON_INSTAGRAM_APP_SECRET = "instagram-secret";
    process.env.COM_MOON_META_THREADS_APP_ID = "threads-app";
    process.env.COM_MOON_META_THREADS_APP_SECRET = "threads-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const state = new URL(authUrl({
      origin: "http://localhost:3000", workspaceId: "11111111-1111-1111-1111-111111111111",
      brandHandle: "ml_bridgemaker", expectedAccountId: "original-id",
    })).searchParams.get("state");
    const statePayload = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8"));
    const nonceHash = createHash("sha256").update(statePayload.nonce).digest("hex");
    let connectionWrites = 0;
    const responseFor = (payload) => ({
      ok: true, status: 200,
      text: async () => JSON.stringify(payload), json: async () => payload,
      headers: { get: () => null },
    });
    globalThis.fetch = async (url, options) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/social_oauth_flows") && options.method === "PATCH") {
        return responseFor([{ nonce_hash: nonceHash }]);
      }
      if (path.endsWith("/oauth/access_token") || path.endsWith("/access_token")) {
        return responseFor({ access_token: "issued-token", expires_in: 3600 });
      }
      if (path.endsWith("/me")) {
        return responseFor({ id: "replacement-id", username: "ml_bridgemaker" });
      }
      if (path.endsWith("/sync_runs")) return responseFor([]);
      if (path.endsWith("/integration_connections")) {
        connectionWrites += 1;
        return responseFor([]);
      }
      throw new Error(`Unexpected request ${path}`);
    };

    const response = await callback(new NextRequest(
      `http://localhost:3000/api/social/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    ));
    const location = new URL(response.headers.get("location"));
    assert.equal(location.searchParams.get(provider), "account-mismatch");
    assert.equal(connectionWrites, 0);
  });
}
