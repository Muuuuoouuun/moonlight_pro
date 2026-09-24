import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  buildYouTubeAuthUrl,
  decodeYouTubeState,
  exchangeYouTubeCode,
  fetchAuthenticatedYouTubeChannel,
  getUsableYouTubeAccessToken,
  getYouTubeConnectionStatus,
  isExpectedYouTubeChannel,
  resolveYouTubeOAuthConfig,
  saveYouTubeConnection,
  summarizeYouTubeConnection,
} from "./youtube-oauth.js";
import { assertPersistedSocialConnection } from "./social-oauth-persistence.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    COM_MOON_YOUTUBE_CLIENT_ID: "youtube-client-id",
    COM_MOON_YOUTUBE_CLIENT_SECRET: "youtube-client-secret",
    COM_MOON_OAUTH_STATE_SECRET: "youtube-state-test-secret",
    COM_MOON_HUB_URL: "http://localhost:3000",
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function signState(value) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", process.env.COM_MOON_OAUTH_STATE_SECRET)
    .update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test("YouTube OAuth uses its dedicated client, exact callback, offline grant and limited scopes", () => {
  const url = new URL(buildYouTubeAuthUrl({
    origin: "http://localhost:3000",
    workspaceId: "workspace-1",
    expectedChannelId: "UC123",
    brandKey: "bridgemaker",
    returnPath: "/dashboard/settings",
  }));

  assert.equal(url.searchParams.get("client_id"), "youtube-client-id");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/social/youtube/callback");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent select_account");
  assert.deepEqual(url.searchParams.get("scope").split(" "), [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.upload",
  ]);
  assert.deepEqual(decodeYouTubeState(url.searchParams.get("state")), {
    workspaceId: "workspace-1",
    expectedChannelId: "UC123",
    brandKey: "bridgemaker",
    returnPath: "/dashboard/settings",
    iat: JSON.parse(Buffer.from(url.searchParams.get("state").split(".")[0], "base64url")).iat,
  });
});

test("YouTube OAuth does not fall back to Calendar/Gmail credentials", () => {
  delete process.env.COM_MOON_YOUTUBE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = "unrelated-client";
  assert.equal(resolveYouTubeOAuthConfig().configured, false);
  assert.equal(buildYouTubeAuthUrl({ origin: "http://localhost:3000" }), null);
});

test("YouTube redirect override takes precedence over the Meta tunnel origin", () => {
  process.env.COM_MOON_HUB_URL = "https://meta-tunnel.example.com";
  process.env.COM_MOON_YOUTUBE_REDIRECT_URI = "http://localhost:3000/api/social/youtube/callback";
  const url = new URL(buildYouTubeAuthUrl({
    origin: "https://meta-tunnel.example.com",
    workspaceId: "workspace-1",
  }));
  assert.equal(url.searchParams.get("redirect_uri"), process.env.COM_MOON_YOUTUBE_REDIRECT_URI);
});

test("YouTube state rejects missing, forged, expired and future states", () => {
  assert.deepEqual(decodeYouTubeState(null), { invalid: true });
  assert.deepEqual(decodeYouTubeState(""), { invalid: true });
  assert.deepEqual(decodeYouTubeState(signState({ iat: Date.now() - 600_001 })), { invalid: true });
  assert.deepEqual(decodeYouTubeState(signState({ iat: Date.now() + 60_000 })), { invalid: true });
  assert.deepEqual(decodeYouTubeState(signState({ iat: "now" })), { invalid: true });
  const valid = signState({ iat: Date.now(), workspaceId: "workspace-1" });
  assert.deepEqual(decodeYouTubeState(`${valid}.extra`), { invalid: true });
  assert.deepEqual(decodeYouTubeState(`${valid.slice(0, -1)}x`), { invalid: true });
});

test("authenticated YouTube channel is read with mine=true and identified by ID", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).searchParams.get("mine"), "true");
    assert.equal(new URL(url).searchParams.get("part"), "snippet");
    assert.equal(options.headers.authorization, "Bearer access-token");
    return { ok: true, json: async () => ({ items: [{ id: "UC123", snippet: { title: "Moon Channel" } }] }) };
  };

  const channel = await fetchAuthenticatedYouTubeChannel("access-token");
  assert.deepEqual(channel, { id: "UC123", title: "Moon Channel" });
  assert.equal(isExpectedYouTubeChannel(channel, "UC123"), true);
  assert.equal(isExpectedYouTubeChannel(channel, "UC999"), false);
});

test("missing authenticated channel fails closed", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [] }) });
  await assert.rejects(fetchAuthenticatedYouTubeChannel("access-token"), /channel-not-found/);
});

test("token exchange requires an offline refresh grant", async () => {
  globalThis.fetch = async (_url, options) => {
    const body = new URLSearchParams(options.body);
    assert.equal(body.get("client_id"), "youtube-client-id");
    assert.equal(body.get("redirect_uri"), "http://localhost:3000/api/social/youtube/callback");
    return { ok: true, json: async () => ({ access_token: "access-only" }) };
  };
  await assert.rejects(
    exchangeYouTubeCode({
      code: "auth-code",
      redirectUri: "http://localhost:3000/api/social/youtube/callback",
    }),
    /youtube-offline-grant-missing/,
  );
});

test("connection summary never includes tokens and reports refresh expiry", () => {
  const summary = summarizeYouTubeConnection({
    id: "connection-1",
    status: "connected",
    config: {
      channelId: "UC123",
      channelTitle: "Moon Channel",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      expiresAt: "2026-09-24T00:00:00.000Z",
      refreshTokenExpiresAt: "2026-10-01T00:00:00.000Z",
    },
  });
  assert.equal(summary.channelId, "UC123");
  assert.equal(summary.hasRefreshToken, true);
  assert.equal(summary.refreshTokenExpiresAt, "2026-10-01T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(summary), /access-secret|refresh-secret/);
});

test("a zero-row upsert cannot report a YouTube connection as persisted", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "db-test-key";
  globalThis.fetch = async (_url, options) => {
    if (options.method === "POST") {
      return { ok: true, status: 200, text: async () => "[]", headers: { get: () => null } };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{
        id: "connection-1",
        status: "connected",
        config: { channelId: "UC123" },
      }]),
      headers: { get: () => null },
    };
  };
  const saved = await saveYouTubeConnection({
    workspaceId: "workspace-1",
    channel: { id: "UC123", title: "Moon Channel" },
    token: { access_token: "access-token", refresh_token: "refresh-token" },
  });
  assert.equal(saved.persistence.persisted, false);
  assert.throws(() => assertPersistedSocialConnection(saved), /connection-not-persisted/);
});

test("server token helper returns a valid token without contacting Google or rewriting storage", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "db-test-key";
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    assert.equal(options.method || "GET", "GET");
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify([{
        id: "connection-1", workspace_id: "workspace-1", provider: "youtube",
        account_key: "UC123", status: "connected", last_synced_at: "2026-09-24T00:00:00.000Z",
        config: {
          channelId: "UC123", accessToken: "still-valid", refreshToken: "refresh-secret",
          expiresAt: "2026-09-24T02:00:00.000Z", refreshTokenExpiresAt: "2026-10-01T00:00:00.000Z",
        },
      }]),
      headers: { get: () => null },
    };
  };

  const result = await getUsableYouTubeAccessToken({
    workspaceId: "workspace-1", channelId: "UC123", now: Date.parse("2026-09-24T01:00:00.000Z"),
  });
  assert.deepEqual(result, { accessToken: "still-valid", refreshed: false, expiresAt: "2026-09-24T02:00:00.000Z" });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get("account_key"), "eq.UC123");
});

test("server token helper refreshes an expired token and saves only the selected account", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "db-test-key";
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    if (parsed.hostname === "db.example.com" && (options.method || "GET") === "GET") {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify([{
          id: "connection-1", workspace_id: "workspace-1", provider: "youtube",
          account_key: "UC123", status: "connected", last_synced_at: "2026-09-24T00:00:00.000Z",
          config: {
            channelId: "UC123", channelTitle: "Channel", brandKey: "bridgemaker",
            accessToken: "expired", refreshToken: "refresh-secret",
            expiresAt: "2026-09-24T00:30:00.000Z", refreshTokenExpiresAt: "2026-10-01T00:00:00.000Z",
          },
        }]),
        headers: { get: () => null },
      };
    }
    if (parsed.hostname === "oauth2.googleapis.com") {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "refresh-secret");
      assert.equal(body.get("client_id"), "youtube-client-id");
      assert.equal(body.get("client_secret"), "youtube-client-secret");
      return { ok: true, json: async () => ({
        access_token: "new-access", refresh_token: "rotated-refresh", expires_in: 3600,
      }) };
    }
    assert.equal(options.method, "PATCH");
    const record = JSON.parse(options.body);
    assert.equal(parsed.searchParams.get("workspace_id"), "eq.workspace-1");
    assert.equal(parsed.searchParams.get("provider"), "eq.youtube");
    assert.equal(parsed.searchParams.get("account_key"), "eq.UC123");
    assert.equal(parsed.searchParams.get("status"), "eq.connected");
    assert.equal(parsed.searchParams.get("last_synced_at"), "eq.2026-09-24T00:00:00.000Z");
    assert.equal(record.config.accessToken, "new-access");
    assert.equal(record.config.refreshToken, "rotated-refresh");
    assert.equal(record.config.brandKey, "bridgemaker");
    assert.equal(record.config.channelTitle, "Channel");
    assert.equal(record.config.expiresAt, "2026-09-24T02:00:00.000Z");
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify([{ id: "connection-1", ...record }]),
      headers: { get: () => null },
    };
  };

  const result = await getUsableYouTubeAccessToken({
    workspaceId: "workspace-1", channelId: "UC123", now: Date.parse("2026-09-24T01:00:00.000Z"),
  });
  assert.deepEqual(result, { accessToken: "new-access", refreshed: true, expiresAt: "2026-09-24T02:00:00.000Z" });
  assert.deepEqual(calls.map((call) => call.options.method || "GET"), ["GET", "POST", "PATCH"]);
});

test("server token helper refuses an expired refresh grant before calling Google", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "db-test-key";
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify([{
        id: "connection-1", workspace_id: "workspace-1", provider: "youtube",
        account_key: "UC123", status: "connected",
        config: { channelId: "UC123", accessToken: "expired", refreshToken: "refresh-secret",
          expiresAt: "2026-09-24T00:00:00.000Z", refreshTokenExpiresAt: "2026-09-24T00:30:00.000Z" },
      }]),
      headers: { get: () => null },
    };
  };
  await assert.rejects(getUsableYouTubeAccessToken({
    workspaceId: "workspace-1", channelId: "UC123", now: Date.parse("2026-09-24T01:00:00.000Z"),
  }), /youtube-reauthorization-required/);
  assert.equal(callCount, 1);
});

test("status distinguishes cached access, refresh needed and reauthorization", () => {
  const now = Date.parse("2026-09-24T01:00:00.000Z");
  const connection = { hasAccessToken: true, hasRefreshToken: true,
    expiresAt: "2026-09-24T02:00:00.000Z", refreshTokenExpiresAt: "2026-10-01T00:00:00.000Z" };
  assert.equal(getYouTubeConnectionStatus(connection, now), "connected");
  assert.equal(getYouTubeConnectionStatus({ ...connection, expiresAt: "2026-09-24T00:00:00.000Z" }, now), "refresh-required");
  assert.equal(getYouTubeConnectionStatus({ ...connection, refreshTokenExpiresAt: "2026-09-24T00:00:00.000Z" }, now), "reauthorization-required");
  assert.equal(getYouTubeConnectionStatus({ ...connection, hasRefreshToken: false }, now), "reauthorization-required");
});
