import { createHmac, timingSafeEqual } from "node:crypto";

import {
  resolveDefaultWorkspaceId,
} from "@com-moon/supabase-rest";
import { isValidSocialBrandKey, listSocialAccountConnections, saveSocialAccountConnection } from "./social-account-connections.js";

const PROVIDER = "youtube";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
];

function safeReturnPath(path) {
  return typeof path === "string" && path.startsWith("/") &&
    !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/dashboard/settings";
}

export function resolveYouTubeOAuthConfig() {
  const clientId = process.env.COM_MOON_YOUTUBE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.COM_MOON_YOUTUBE_CLIENT_SECRET?.trim() || "";
  return {
    clientId,
    clientSecret,
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    configured: Boolean(clientId && clientSecret),
  };
}

export function hasYouTubeOAuthStateSecret() {
  return Boolean(process.env.COM_MOON_OAUTH_STATE_SECRET?.trim());
}

export function resolveYouTubeRedirectUri(origin) {
  const override = process.env.COM_MOON_YOUTUBE_REDIRECT_URI?.trim();
  if (override) return override;
  const base = process.env.COM_MOON_HUB_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() || origin;
  return `${String(base || "").replace(/\/$/, "")}/api/social/youtube/callback`;
}

function signState(payload) {
  const secret = process.env.COM_MOON_OAUTH_STATE_SECRET?.trim();
  return secret
    ? createHmac("sha256", secret).update(payload).digest("base64url")
    : "";
}

export function buildYouTubeAuthUrl({
  origin,
  workspaceId = resolveDefaultWorkspaceId(),
  expectedChannelId = "",
  brandKey = null,
  returnPath = "/dashboard/settings",
} = {}) {
  const config = resolveYouTubeOAuthConfig();
  if (!config.configured || !hasYouTubeOAuthStateSecret() || !workspaceId ||
    (brandKey != null && !isValidSocialBrandKey(brandKey))) return null;

  const payload = Buffer.from(JSON.stringify({
    workspaceId,
    expectedChannelId: String(expectedChannelId || "").trim(),
    brandKey,
    returnPath: safeReturnPath(returnPath),
    iat: Date.now(),
  })).toString("base64url");
  const state = `${payload}.${signState(payload)}`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: resolveYouTubeRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export function decodeYouTubeState(value) {
  try {
    const parts = String(value || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { invalid: true };
    const expected = signState(parts[0]);
    const provided = parts[1];
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
      return { invalid: true };
    }
    const state = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const age = Date.now() - state?.iat;
    if (!Number.isSafeInteger(state?.iat) || age < 0 || age > STATE_MAX_AGE_MS ||
      typeof state.workspaceId !== "string" || !state.workspaceId ||
      (state.brandKey != null && !isValidSocialBrandKey(state.brandKey))) {
      return { invalid: true };
    }
    return state;
  } catch {
    return { invalid: true };
  }
}

export async function exchangeYouTubeCode({ code, redirectUri }) {
  const config = resolveYouTubeOAuthConfig();
  if (!config.configured) throw new Error("youtube-client-not-configured");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("youtube-token-exchange-failed");
  const token = await response.json();
  if (!token?.access_token || !token?.refresh_token) {
    throw new Error("youtube-offline-grant-missing");
  }
  if (token.scope) {
    const granted = new Set(String(token.scope).split(/\s+/));
    if (!SCOPES.every((scope) => granted.has(scope))) {
      throw new Error("youtube-required-scope-missing");
    }
  }
  return token;
}

export async function fetchAuthenticatedYouTubeChannel(accessToken) {
  if (!accessToken) throw new Error("youtube-access-token-missing");
  const url = new URL(CHANNELS_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("youtube-channel-lookup-failed");
  const payload = await response.json();
  const channel = payload?.items?.[0];
  if (!channel?.id || !channel?.snippet?.title) {
    throw new Error("youtube-channel-not-found");
  }
  return { id: String(channel.id), title: String(channel.snippet.title) };
}

export function isExpectedYouTubeChannel(channel, expectedChannelId) {
  return !expectedChannelId || channel?.id === expectedChannelId;
}

export async function readLatestYouTubeConnection(workspaceId = resolveDefaultWorkspaceId()) {
  const result = await listSocialAccountConnections(PROVIDER, workspaceId);
  return {
    connection: result.connections[0] || null,
    available: result.available,
  };
}

export async function readYouTubeConnections(workspaceId = resolveDefaultWorkspaceId(), accountId = "") {
  return listSocialAccountConnections(PROVIDER, workspaceId, accountId);
}

export async function saveYouTubeConnection({ workspaceId, token, channel, brandKey = null }) {
  if (!channel?.id) throw new Error("social-account-id-missing");
  const refreshExpiresIn = Number(token.refresh_token_expires_in);
  const config = {
    provider: "YouTube",
    channelId: channel.id,
    channelTitle: channel.title,
    brandKey: brandKey || null,
    scope: token.scope || SCOPES.join(" "),
    tokenType: token.token_type || "Bearer",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Number.isFinite(Number(token.expires_in))
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null,
    refreshTokenExpiresAt: Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
      ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
      : null,
  };
  const persistence = await saveSocialAccountConnection({
    workspaceId, provider: PROVIDER, accountId: channel.id, config,
  });
  return { connectionId: persistence.id || null, persistence, config };
}

export function summarizeYouTubeConnection(connection) {
  const config = connection?.config || {};
  return {
    id: connection?.id || null,
    status: connection?.status || "pending",
    lastSyncedAt: connection?.last_synced_at || null,
    channelId: config.channelId || null,
    channelTitle: config.channelTitle || null,
    brandKey: config.brandKey || null,
    expiresAt: config.expiresAt || null,
    refreshTokenExpiresAt: config.refreshTokenExpiresAt || null,
    hasRefreshToken: Boolean(config.refreshToken),
  };
}
