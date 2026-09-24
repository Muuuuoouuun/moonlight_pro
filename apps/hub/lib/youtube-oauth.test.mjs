import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  buildYouTubeAuthUrl,
  decodeYouTubeState,
  exchangeYouTubeCode,
  fetchAuthenticatedYouTubeChannel,
  isExpectedYouTubeChannel,
  resolveYouTubeOAuthConfig,
  summarizeYouTubeConnection,
} from "./youtube-oauth.js";

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
