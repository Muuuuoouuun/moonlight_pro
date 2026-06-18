import {
  insertSupabaseRecord,
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";
import { createHmac, timingSafeEqual } from "crypto";

const META_THREADS_PROVIDER = "meta_threads";
const META_THREADS_SYNC_SOURCE = "meta_threads";
const DEFAULT_BRAND_HANDLE = "moon.classin";
const DEFAULT_SCOPES = ["threads_basic", "threads_content_publish"];
const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_LONG_LIVED_TOKEN_URL = "https://graph.threads.net/access_token";
const THREADS_API_BASE = "https://graph.threads.net/v1.0";

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

export function resolveMetaThreadsConfig() {
  const appId =
    process.env.COM_MOON_META_THREADS_APP_ID?.trim() ||
    process.env.META_THREADS_APP_ID?.trim() ||
    process.env.THREADS_APP_ID?.trim();
  const appSecret =
    process.env.COM_MOON_META_THREADS_APP_SECRET?.trim() ||
    process.env.META_THREADS_APP_SECRET?.trim() ||
    process.env.THREADS_APP_SECRET?.trim();

  return {
    appId,
    appSecret,
    brandHandle: normalizeHandle(
      process.env.COM_MOON_META_THREADS_BRAND_HANDLE,
      DEFAULT_BRAND_HANDLE,
    ),
    scopes: normalizeScopes(process.env.COM_MOON_META_THREADS_SCOPES),
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

export function hasMetaThreadsOAuthStateSecret() {
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

function safeBufferEquals(a, b) {
  return a.length === b.length && timingSafeEqual(a, b);
}

function decodeBase64Url(value, output = "utf8") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString(output);
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

export function decodeMetaThreadsState(value) {
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

export function parseMetaThreadsSignedRequest(value) {
  const config = resolveMetaThreadsConfig();
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return {
      valid: false,
      error: "missing-signed-request",
      payload: null,
    };
  }

  if (!config.appSecret) {
    return {
      valid: false,
      error: "missing-app-secret",
      payload: null,
    };
  }

  const [encodedSignature, encodedPayload] = raw.split(".", 2);

  if (!encodedSignature || !encodedPayload) {
    return {
      valid: false,
      error: "malformed-signed-request",
      payload: null,
    };
  }

  try {
    const signature = Buffer.from(
      String(encodedSignature).replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    const expected = createHmac("sha256", config.appSecret)
      .update(encodedPayload)
      .digest();

    if (!safeBufferEquals(signature, expected)) {
      return {
        valid: false,
        error: "invalid-signature",
        payload: null,
      };
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    const algorithm = String(payload.algorithm || "").toUpperCase();

    if (algorithm && algorithm !== "HMAC-SHA256") {
      return {
        valid: false,
        error: "unsupported-algorithm",
        payload,
      };
    }

    return {
      valid: true,
      error: null,
      payload,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      payload: null,
    };
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

export function resolveMetaThreadsRedirectUri(origin) {
  return `${resolveBaseUrl(origin)}/api/social/meta/threads/callback`;
}

export function buildMetaThreadsSetupUrls(origin) {
  const baseUrl = resolveBaseUrl(origin);

  return {
    appDomain: baseUrl ? new URL(baseUrl).host : "",
    oauthRedirectUri: resolveMetaThreadsRedirectUri(origin),
    deauthorizeCallbackUrl: `${baseUrl}/api/social/meta/threads/deauthorize`,
    dataDeletionCallbackUrl: `${baseUrl}/api/social/meta/threads/data-deletion`,
    privacyUrl: `${baseUrl}/legal/privacy`,
    termsUrl: `${baseUrl}/legal/terms`,
    dataDeletionUrl: `${baseUrl}/legal/data-deletion`,
  };
}

export function buildMetaThreadsAuthUrl({
  origin,
  workspaceId = resolveDefaultWorkspaceId(),
  brandHandle = DEFAULT_BRAND_HANDLE,
  returnPath = "/dashboard/settings",
}) {
  const config = resolveMetaThreadsConfig();

  if (!config.configured || !hasMetaThreadsOAuthStateSecret()) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: resolveMetaThreadsRedirectUri(origin),
    response_type: "code",
    scope: config.scopes.join(","),
    state: encodeState({
      workspaceId: workspaceId || resolveDefaultWorkspaceId(),
      brandHandle: normalizeHandle(brandHandle, config.brandHandle),
      returnPath: sanitizeReturnPath(returnPath, "/dashboard/settings"),
    }),
  });

  return `${THREADS_AUTH_URL}?${params.toString()}`;
}

async function exchangeThreadsToken(params) {
  const config = resolveMetaThreadsConfig();

  if (!config.configured) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    ...params,
  });

  const response = await fetch(THREADS_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Threads token exchange failed with ${response.status}`);
  }

  return await response.json();
}

export async function exchangeMetaThreadsCode({ code, redirectUri }) {
  return exchangeThreadsToken({
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function exchangeMetaThreadsLongLivedToken(accessToken) {
  const config = resolveMetaThreadsConfig();

  if (!config.configured || !accessToken) {
    return null;
  }

  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: config.appSecret,
    access_token: accessToken,
  });

  const response = await fetch(`${THREADS_LONG_LIVED_TOKEN_URL}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Threads long-lived token exchange failed with ${response.status}`);
  }

  return await response.json();
}

export async function refreshMetaThreadsAccessToken(accessToken) {
  if (!accessToken) {
    return null;
  }

  const params = new URLSearchParams({
    grant_type: "th_refresh_token",
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.threads.net/refresh_access_token?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Threads token refresh failed with ${response.status}`);
  }

  return await response.json();
}

export async function fetchMetaThreadsProfile(accessToken) {
  if (!accessToken) {
    return null;
  }

  const params = new URLSearchParams({
    fields: "id,username,threads_profile_picture_url,threads_biography",
    access_token: accessToken,
  });

  try {
    const response = await fetch(`${THREADS_API_BASE}/me?${params.toString()}`, {
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

export async function fetchLatestMetaThreadsConnection(
  workspaceId = resolveDefaultWorkspaceId(),
) {
  const filters = [["provider", `eq.${META_THREADS_PROVIDER}`]];

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

export async function fetchMetaThreadsConnectionsByUserId({
  workspaceId = resolveDefaultWorkspaceId(),
  userId,
}) {
  if (!userId) {
    return [];
  }

  const filters = [
    ["provider", `eq.${META_THREADS_PROVIDER}`],
    ["config->>userId", `eq.${userId}`],
  ];

  if (workspaceId) {
    filters.push(["workspace_id", `eq.${workspaceId}`]);
  }

  const rows = await fetchSupabaseRows("integration_connections", {
    filters,
    order: "created_at.desc",
    limit: 20,
  });

  return Array.isArray(rows) ? rows : [];
}

export async function disableMetaThreadsConnectionsForUser({
  workspaceId = resolveDefaultWorkspaceId(),
  userId,
  reason = "deauthorize",
}) {
  const rows = await fetchMetaThreadsConnectionsByUserId({ workspaceId, userId });
  const now = new Date().toISOString();

  if (!rows.length) {
    return {
      matched: 0,
      updated: 0,
    };
  }

  const updates = await Promise.all(rows.map((row) => {
    const config = {
      ...(row.config || {}),
      accessToken: "",
      disabledAt: now,
      disabledReason: reason,
    };

    if (reason === "data-deletion") {
      config.dataDeletionRequestedAt = now;
    }

    return updateSupabaseRecord(
      "integration_connections",
      [["id", `eq.${row.id}`]],
      {
        status: "disabled",
        config,
        last_synced_at: now,
      },
    );
  }));

  return {
    matched: rows.length,
    updated: updates.filter((result) => result.persisted).length,
  };
}

export async function saveMetaThreadsConnection({
  workspaceId = resolveDefaultWorkspaceId(),
  brandHandle = DEFAULT_BRAND_HANDLE,
  tokenData,
  longLivedTokenData,
  profile,
}) {
  const existing = await fetchLatestMetaThreadsConnection(workspaceId);
  const now = new Date().toISOString();
  const accessToken =
    longLivedTokenData?.access_token ||
    tokenData?.access_token ||
    existing?.config?.accessToken ||
    "";
  const expiresIn = longLivedTokenData?.expires_in || tokenData?.expires_in || null;
  const config = {
    provider: "Threads",
    brandHandle: normalizeHandle(brandHandle),
    scope:
      longLivedTokenData?.scope ||
      tokenData?.scope ||
      resolveMetaThreadsConfig().scopes.join(","),
    accessToken,
    tokenType: longLivedTokenData?.token_type || tokenData?.token_type || "Bearer",
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : existing?.config?.expiresAt || null,
    userId: profile?.id || tokenData?.user_id || existing?.config?.userId || null,
    username: profile?.username || existing?.config?.username || null,
    profilePictureUrl:
      profile?.threads_profile_picture_url ||
      existing?.config?.profilePictureUrl ||
      null,
    biography: profile?.threads_biography || existing?.config?.biography || null,
  };
  const record = {
    workspace_id: workspaceId || null,
    provider: META_THREADS_PROVIDER,
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
  const latest = await fetchLatestMetaThreadsConnection(workspaceId);

  return {
    connectionId: latest?.id || null,
    persistence,
    config,
  };
}

export async function recordMetaThreadsSync({
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
      provider: META_THREADS_SYNC_SOURCE,
      ...payload,
    },
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
}

export function summarizeMetaThreadsConnection(connection) {
  const config = connection?.config || {};

  return {
    id: connection?.id || null,
    status: connection?.status || "pending",
    lastSyncedAt: connection?.last_synced_at || null,
    brandHandle: normalizeHandle(config.brandHandle),
    userId: config.userId || null,
    username: config.username || null,
    profileHandle: config.username ? `@${config.username}` : null,
    expiresAt: config.expiresAt || null,
  };
}

export function isExpectedMetaThreadsProfile(profile, expectedHandle) {
  if (!profile?.username) {
    return null;
  }

  return normalizeHandle(profile.username) === normalizeHandle(expectedHandle);
}
