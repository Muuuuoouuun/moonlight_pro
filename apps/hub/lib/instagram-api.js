import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
} from "@/lib/server-write";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { isValidSocialBrandKey, listSocialAccountConnections, saveSocialAccountConnection } from "@/lib/social-account-connections";
import { isValidMetaOAuthAppIdentity, resolveMetaOAuthApp } from "@/lib/meta-oauth-apps";

const INSTAGRAM_API_PROVIDER = "instagram_api";
const INSTAGRAM_API_SYNC_SOURCE = "instagram_api";
const DEFAULT_BRAND_HANDLE = "moon.classin";
const DEFAULT_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];
const INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_LONG_LIVED_TOKEN_URL = "https://graph.instagram.com/access_token";
const INSTAGRAM_REFRESH_TOKEN_URL = "https://graph.instagram.com/refresh_access_token";
const DEFAULT_INSTAGRAM_API_BASE = "https://graph.instagram.com/v21.0";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const OAUTH_PROVIDER = "instagram_api";

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function normalizeHandle(value, fallback = DEFAULT_BRAND_HANDLE) {
  return normalizeString(value, fallback).replace(/^@+/, "").toLowerCase();
}

function normalizeScopes(value) {
  if (!value) return DEFAULT_SCOPES;

  const scopes = String(value)
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return scopes.length ? scopes : DEFAULT_SCOPES;
}

export function resolveInstagramApiConfig() {
  const appId =
    process.env.COM_MOON_INSTAGRAM_APP_ID?.trim() ||
    process.env.INSTAGRAM_APP_ID?.trim() ||
    process.env.INSTAGRAM_CLIENT_ID?.trim();
  const appSecret =
    process.env.COM_MOON_INSTAGRAM_APP_SECRET?.trim() ||
    process.env.INSTAGRAM_APP_SECRET?.trim() ||
    process.env.INSTAGRAM_CLIENT_SECRET?.trim();
  const apiBase =
    process.env.COM_MOON_INSTAGRAM_API_BASE_URL?.trim()?.replace(/\/$/, "") ||
    DEFAULT_INSTAGRAM_API_BASE;

  return {
    appId,
    appSecret,
    apiBase,
    brandHandle: normalizeHandle(
      process.env.COM_MOON_INSTAGRAM_BRAND_HANDLE,
      DEFAULT_BRAND_HANDLE,
    ),
    scopes: normalizeScopes(process.env.COM_MOON_INSTAGRAM_SCOPES),
    configured: Boolean(appId && appSecret),
    hasAppId: Boolean(appId),
    hasAppSecret: Boolean(appSecret),
  };
}

function resolveOAuthStateSecret() {
  return (
    process.env.COM_MOON_OAUTH_STATE_SECRET?.trim() ||
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

export function hasInstagramApiOAuthStateSecret() {
  return Boolean(resolveOAuthStateSecret());
}

function signStatePayload(payload) {
  const secret = resolveOAuthStateSecret();

  if (!secret) {
    return "";
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEquals(a, b) {
  const aBuffer = Buffer.from(String(a || ""));
  const bBuffer = Buffer.from(String(b || ""));

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function encodeState(value) {
  const payload = Buffer.from(
    JSON.stringify({
      ...value,
      iat: Date.now(),
    }),
    "utf8",
  ).toString("base64url");
  const signature = signStatePayload(payload);

  return signature ? `${payload}.${signature}` : payload;
}

export function decodeInstagramApiState(value) {
  if (!value) {
    return { invalid: true };
  }

  try {
    const raw = String(value);
    const parts = raw.split(".");
    if (parts.length !== 2) {
      return { invalid: true };
    }
    const [payload, signature] = parts;
    const expected = signStatePayload(payload);

    if (!expected || !signature || !safeEquals(expected, signature)) {
      return { invalid: true };
    }

    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Date.now();
    if (
      !state ||
      typeof state !== "object" ||
      Array.isArray(state) ||
      !Number.isSafeInteger(state.iat) ||
      state.iat > now ||
      now - state.iat > OAUTH_STATE_MAX_AGE_MS ||
      typeof state.workspaceId !== "string" || !state.workspaceId ||
      typeof state.brandHandle !== "string" || !state.brandHandle ||
      state.provider !== OAUTH_PROVIDER ||
      typeof state.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state.nonce) ||
      (state.expectedAccountId != null && !/^[A-Za-z0-9_-]{1,128}$/.test(state.expectedAccountId)) ||
      (state.brandKey != null && !isValidSocialBrandKey(state.brandKey)) ||
      !isValidMetaOAuthAppIdentity(state)
    ) {
      return { invalid: true };
    }

    return state;
  } catch {
    return { invalid: true };
  }
}

function sanitizeReturnPath(value, fallback) {
  const path = typeof value === "string" ? value.trim() : "";

  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }

  return path;
}

function resolveBaseUrl(origin) {
  return (
    process.env.COM_MOON_SOCIAL_OAUTH_BASE_URL?.trim() ||
    process.env.COM_MOON_HUB_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    origin ||
    ""
  ).replace(/\/$/, "");
}

export function resolveInstagramApiRedirectUri(origin) {
  return `${resolveBaseUrl(origin)}/api/social/instagram/callback`;
}

export function buildInstagramApiSetupUrls(origin) {
  const baseUrl = resolveBaseUrl(origin);

  return {
    appDomain: baseUrl ? new URL(baseUrl).host : "",
    oauthRedirectUri: resolveInstagramApiRedirectUri(origin),
    privacyUrl: `${baseUrl}/legal/privacy`,
    termsUrl: `${baseUrl}/legal/terms`,
    dataDeletionUrl: `${baseUrl}/legal/data-deletion`,
  };
}

export function buildInstagramApiAuthUrl({
  origin,
  workspaceId = resolveDefaultWorkspaceId(),
  brandHandle = DEFAULT_BRAND_HANDLE,
  brandKey = null,
  expectedAccountId = null,
  returnPath = "/dashboard/settings",
}) {
  const config = resolveMetaOAuthApp({ provider: OAUTH_PROVIDER, brandKey, brandHandle });

  if (!config?.configured || !hasInstagramApiOAuthStateSecret() || !workspaceId ||
    (brandKey != null && !isValidSocialBrandKey(brandKey)) ||
    (expectedAccountId != null && !/^[A-Za-z0-9_-]{1,128}$/.test(expectedAccountId))) {
    return null;
  }

  const params = new URLSearchParams({
    enable_fb_login: "0",
    force_authentication: "1",
    client_id: config.appId,
    redirect_uri: resolveInstagramApiRedirectUri(origin),
    response_type: "code",
    scope: config.scopes.join(","),
    state: encodeState({
      workspaceId: workspaceId || resolveDefaultWorkspaceId(),
      brandHandle: normalizeHandle(brandHandle, config.brandHandle),
      brandKey,
      appKey: config.appKey,
      appId: config.appId,
      provider: OAUTH_PROVIDER,
      nonce: randomBytes(32).toString("base64url"),
      expectedAccountId,
      returnPath: sanitizeReturnPath(returnPath, "/dashboard/settings"),
    }),
  });

  return `${INSTAGRAM_AUTH_URL}?${params.toString()}`;
}

export async function exchangeInstagramApiCode({ code, redirectUri, app }) {
  const config = app;

  if (!config?.configured) throw new Error("instagram-oauth-app-mismatch");

  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Instagram token exchange failed with ${response.status}`);
  }

  return await response.json();
}

export async function exchangeInstagramApiLongLivedToken(accessToken, app) {
  const config = app;

  if (!config?.configured || !accessToken) throw new Error("instagram-oauth-app-mismatch");

  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: accessToken,
  });

  const response = await fetch(`${INSTAGRAM_LONG_LIVED_TOKEN_URL}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Instagram long-lived token exchange failed with ${response.status}`);
  }

  return await response.json();
}

export async function refreshInstagramApiAccessToken(accessToken) {
  if (!accessToken) {
    return null;
  }

  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  });

  const response = await fetch(`${INSTAGRAM_REFRESH_TOKEN_URL}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Instagram token refresh failed with ${response.status}`);
  }

  return await response.json();
}

export async function fetchInstagramApiProfile(accessToken) {
  const config = resolveInstagramApiConfig();

  if (!accessToken) {
    return null;
  }

  const params = new URLSearchParams({
    fields: [
      "id",
      "user_id",
      "username",
      "name",
      "account_type",
      "profile_picture_url",
      "followers_count",
      "follows_count",
      "media_count",
    ].join(","),
    access_token: accessToken,
  });

  try {
    const response = await fetch(`${config.apiBase}/me?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data[0] || null : payload;
  } catch {
    return null;
  }
}

export async function fetchLatestInstagramApiConnection(
  workspaceId = resolveDefaultWorkspaceId(),
) {
  const { connections } = await listSocialAccountConnections(INSTAGRAM_API_PROVIDER, workspaceId);
  return connections[0] || null;
}

export async function fetchInstagramApiConnections(workspaceId = resolveDefaultWorkspaceId(), accountId = "") {
  return listSocialAccountConnections(INSTAGRAM_API_PROVIDER, workspaceId, accountId);
}

export async function saveInstagramApiConnection({
  workspaceId = resolveDefaultWorkspaceId(),
  brandHandle = DEFAULT_BRAND_HANDLE,
  brandKey = null,
  tokenData,
  longLivedTokenData,
  profile,
  app = null,
}) {
  if (!profile?.id || !profile?.username) throw new Error("social-account-id-missing");
  const accessToken =
    longLivedTokenData?.access_token ||
    tokenData?.access_token ||
    "";
  const expiresIn = longLivedTokenData?.expires_in || tokenData?.expires_in || null;
  const config = {
    provider: "Instagram API",
    brandHandle: normalizeHandle(brandHandle),
    brandKey: brandKey || null,
    ...(app ? { oauthAppKey: app.appKey, oauthAppId: app.appId } : {}),
    scope:
      longLivedTokenData?.scope ||
      tokenData?.scope ||
      (app || resolveInstagramApiConfig()).scopes.join(","),
    accessToken,
    tokenType: longLivedTokenData?.token_type || tokenData?.token_type || "Bearer",
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    appScopedId: profile.id,
    userId: profile.user_id || null,
    username: profile.username,
    name: profile.name || null,
    accountType: profile.account_type || null,
    profilePictureUrl: profile.profile_picture_url || null,
    followersCount: profile.followers_count ?? null,
    followsCount: profile.follows_count ?? null,
    mediaCount: profile.media_count ?? null,
  };
  const persistence = await saveSocialAccountConnection({
    workspaceId, provider: INSTAGRAM_API_PROVIDER, accountId: profile.id, config,
  });
  return {
    connectionId: persistence.id || null,
    persistence,
    config,
  };
}

export async function recordInstagramApiSync({
  workspaceId = resolveDefaultWorkspaceId(),
  connectionId = null,
  status = "success",
  payload = {},
  errorMessage = null,
}) {
  return insertSupabaseRecord("sync_runs", {
    workspace_id: workspaceId || null,
    connection_id: connectionId,
    status,
    payload: {
      provider: INSTAGRAM_API_SYNC_SOURCE,
      ...payload,
    },
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
}

export function summarizeInstagramApiConnection(connection) {
  const config = connection?.config || {};

  return {
    id: connection?.id || null,
    status: connection?.status || "pending",
    lastSyncedAt: connection?.last_synced_at || null,
    brandHandle: normalizeHandle(config.brandHandle),
    brandKey: config.brandKey || null,
    appScopedId: config.appScopedId || null,
    userId: config.userId || null,
    username: config.username || null,
    profileHandle: config.username ? `@${config.username}` : null,
    accountType: config.accountType || null,
    followersCount: config.followersCount ?? null,
    mediaCount: config.mediaCount ?? null,
    expiresAt: config.expiresAt || null,
  };
}

export function isExpectedInstagramApiProfile(profile, expectedHandle) {
  if (!profile?.username) {
    return null;
  }

  return normalizeHandle(profile.username) === normalizeHandle(expectedHandle);
}

export async function checkInstagramApiProfileMatch({
  workspaceId,
  brandHandle,
  expectedAccountId = null,
  profile,
  recordSync = recordInstagramApiSync,
}) {
  const profileMatch = Boolean(profile?.id && isExpectedInstagramApiProfile(profile, brandHandle) &&
    (!expectedAccountId || profile.id === expectedAccountId));
  if (profileMatch) {
    return { profileMatch, rejected: false };
  }

  await recordSync({
    workspaceId,
    status: "failure",
    payload: {
      action: "oauth_connect",
      brandHandle,
      username: profile?.username || null,
      result: "account-mismatch",
    },
    errorMessage: `Authorized Instagram account does not match @${brandHandle}.`,
  });
  return { profileMatch, rejected: true };
}
