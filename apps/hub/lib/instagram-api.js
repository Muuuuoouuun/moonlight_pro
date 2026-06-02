import {
  insertSupabaseRecord,
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";
import { createHmac, timingSafeEqual } from "crypto";

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

function buildSupabaseReadUrl(table, { select = "*", filters = [], order, limit } = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("select", select);

  if (order) {
    params.set("order", order);
  }

  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  filters.forEach(([key, value]) => {
    params.append(key, value);
  });

  return `${config.url}/rest/v1/${table}?${params.toString()}`;
}

async function fetchSupabaseRows(table, options = {}) {
  const config = resolveSupabaseConfig();
  const url = buildSupabaseReadUrl(table, options);

  if (!config || !url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: makeSupabaseHeaders(config.apiKey),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
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
    return {};
  }

  try {
    const raw = String(value);
    const [payload, signature] = raw.split(".");
    const expected = signStatePayload(payload);

    if (!expected || !signature || !safeEquals(expected, signature)) {
      return { invalid: true };
    }

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
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
  returnPath = "/dashboard/settings",
}) {
  const config = resolveInstagramApiConfig();

  if (!config.configured || !hasInstagramApiOAuthStateSecret()) {
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
      returnPath: sanitizeReturnPath(returnPath, "/dashboard/settings"),
    }),
  });

  return `${INSTAGRAM_AUTH_URL}?${params.toString()}`;
}

export async function exchangeInstagramApiCode({ code, redirectUri }) {
  const config = resolveInstagramApiConfig();

  if (!config.configured) {
    return null;
  }

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

export async function exchangeInstagramApiLongLivedToken(accessToken) {
  const config = resolveInstagramApiConfig();

  if (!config.configured || !accessToken) {
    return null;
  }

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
  const filters = [["provider", `eq.${INSTAGRAM_API_PROVIDER}`]];

  if (workspaceId) {
    filters.push(["workspace_id", `eq.${workspaceId}`]);
  }

  const rows = await fetchSupabaseRows("integration_connections", {
    filters,
    order: "created_at.desc",
    limit: 1,
  });

  return rows?.[0] || null;
}

export async function saveInstagramApiConnection({
  workspaceId = resolveDefaultWorkspaceId(),
  brandHandle = DEFAULT_BRAND_HANDLE,
  tokenData,
  longLivedTokenData,
  profile,
}) {
  const existing = await fetchLatestInstagramApiConnection(workspaceId);
  const now = new Date().toISOString();
  const accessToken =
    longLivedTokenData?.access_token ||
    tokenData?.access_token ||
    existing?.config?.accessToken ||
    "";
  const expiresIn = longLivedTokenData?.expires_in || tokenData?.expires_in || null;
  const config = {
    provider: "Instagram API",
    brandHandle: normalizeHandle(brandHandle),
    scope:
      longLivedTokenData?.scope ||
      tokenData?.scope ||
      resolveInstagramApiConfig().scopes.join(","),
    accessToken,
    tokenType: longLivedTokenData?.token_type || tokenData?.token_type || "Bearer",
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : existing?.config?.expiresAt || null,
    appScopedId: profile?.id || tokenData?.user_id || existing?.config?.appScopedId || null,
    userId: profile?.user_id || existing?.config?.userId || null,
    username: profile?.username || existing?.config?.username || null,
    name: profile?.name || existing?.config?.name || null,
    accountType: profile?.account_type || existing?.config?.accountType || null,
    profilePictureUrl:
      profile?.profile_picture_url ||
      existing?.config?.profilePictureUrl ||
      null,
    followersCount: profile?.followers_count ?? existing?.config?.followersCount ?? null,
    followsCount: profile?.follows_count ?? existing?.config?.followsCount ?? null,
    mediaCount: profile?.media_count ?? existing?.config?.mediaCount ?? null,
  };
  const record = {
    workspace_id: workspaceId || null,
    provider: INSTAGRAM_API_PROVIDER,
    status: "connected",
    config,
    last_synced_at: now,
  };

  if (existing?.id) {
    const persistence = await updateSupabaseRecord(
      "integration_connections",
      [["id", `eq.${existing.id}`]],
      record,
    );

    return {
      connectionId: existing.id,
      persistence,
      config,
    };
  }

  const persistence = await insertSupabaseRecord("integration_connections", record);
  const latest = await fetchLatestInstagramApiConnection(workspaceId);

  return {
    connectionId: latest?.id || null,
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
