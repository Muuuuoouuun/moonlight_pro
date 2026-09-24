import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  updateSupabaseRecord,
} from "@/lib/server-write";
import { fetchSupabaseRowsDetailed } from "@com-moon/supabase-rest";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { isValidSocialBrandKey, listSocialAccountConnections, saveSocialAccountConnection } from "@/lib/social-account-connections";
import { configuredMetaOAuthApps, isValidMetaOAuthAppIdentity, resolveMetaOAuthApp } from "@/lib/meta-oauth-apps";

const META_THREADS_PROVIDER = "meta_threads";
const META_THREADS_SYNC_SOURCE = "meta_threads";
const DEFAULT_BRAND_HANDLE = "moon.classin";
const DEFAULT_SCOPES = ["threads_basic", "threads_content_publish"];
const THREADS_AUTH_URL = "https://www.threads.com/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_LONG_LIVED_TOKEN_URL = "https://graph.threads.net/access_token";
const THREADS_API_BASE = "https://graph.threads.net/v1.0";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const OAUTH_PROVIDER = "meta_threads";

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

export function parseMetaThreadsSignedRequest(value) {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return {
      valid: false,
      error: "missing-signed-request",
      payload: null,
    };
  }

  const apps = configuredMetaOAuthApps(OAUTH_PROVIDER);
  if (!apps.length) {
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
    const matching = apps.filter((app) => safeBufferEquals(signature,
      createHmac("sha256", app.appSecret).update(encodedPayload).digest()));
    if (matching.length !== 1) {
      return {
        valid: false,
        error: matching.length ? "ambiguous-app-secret" : "invalid-signature",
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
      appKey: matching[0].appKey,
      appId: matching[0].appId,
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
    process.env.COM_MOON_SOCIAL_OAUTH_BASE_URL?.trim() ||
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
  brandKey = null,
  expectedAccountId = null,
  returnPath = "/dashboard/settings",
}) {
  const config = resolveMetaOAuthApp({ provider: OAUTH_PROVIDER, brandKey, brandHandle });

  if (!config?.configured || !hasMetaThreadsOAuthStateSecret() || !workspaceId ||
    (brandKey != null && !isValidSocialBrandKey(brandKey)) ||
    (expectedAccountId != null && !/^[A-Za-z0-9_-]{1,128}$/.test(expectedAccountId))) {
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
      brandKey,
      appKey: config.appKey,
      appId: config.appId,
      provider: OAUTH_PROVIDER,
      nonce: randomBytes(32).toString("base64url"),
      expectedAccountId,
      returnPath: sanitizeReturnPath(returnPath, "/dashboard/settings"),
    }),
  });

  return `${THREADS_AUTH_URL}?${params.toString()}`;
}

async function exchangeThreadsToken(params, app) {
  const config = app;

  if (!config?.configured) throw new Error("threads-oauth-app-mismatch");

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

export async function exchangeMetaThreadsCode({ code, redirectUri, app }) {
  return exchangeThreadsToken({
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }, app);
}

export async function exchangeMetaThreadsLongLivedToken(accessToken, app) {
  const config = app;

  if (!config?.configured || !accessToken) throw new Error("threads-oauth-app-mismatch");

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
  const { connections } = await listSocialAccountConnections(META_THREADS_PROVIDER, workspaceId);
  return connections[0] || null;
}

export async function fetchMetaThreadsConnections(workspaceId = resolveDefaultWorkspaceId(), accountId = "") {
  return listSocialAccountConnections(META_THREADS_PROVIDER, workspaceId, accountId);
}

export async function fetchMetaThreadsConnectionsByUserId({
  workspaceId = resolveDefaultWorkspaceId(),
  userId,
}) {
  if (!userId || !workspaceId) throw new Error("threads-connection-identity-missing");

  const filters = [
    ["provider", `eq.${META_THREADS_PROVIDER}`],
    ["config->>userId", `eq.${userId}`],
  ];

  filters.push(["workspace_id", `eq.${workspaceId}`]);

  const rows = [];
  const ids = new Set();
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const result = await fetchSupabaseRowsDetailed("integration_connections", {
      filters,
      order: "created_at.desc,id.desc",
      limit: pageSize,
      offset,
      strictRows: true,
    });
    if (!result.configured || result.error || !Array.isArray(result.rows)) {
      throw new Error("threads-connection-read-failed");
    }
    for (const row of result.rows) {
      if (!row?.id || ids.has(row.id)) throw new Error("threads-connection-read-failed");
      ids.add(row.id);
      rows.push(row);
    }
    if (result.rows.length < pageSize) return rows;
  }
}

export async function disableMetaThreadsConnectionsForUser({
  workspaceId = resolveDefaultWorkspaceId(),
  userId,
  appId = null,
  appKey = null,
  reason = "deauthorize",
}) {
  if (!userId || !workspaceId || !appId || !appKey) {
    throw new Error("threads-connection-identity-missing");
  }
  const rows = (await fetchMetaThreadsConnectionsByUserId({ workspaceId, userId }))
    .filter((row) =>
      (row.config?.oauthAppId === appId && row.config?.oauthAppKey === appKey) ||
      (appKey === "moonlight" && !row.config?.oauthAppId && !row.config?.oauthAppKey));
  const now = new Date().toISOString();

  if (!rows.length) {
    return {
      matched: 0,
      updated: 0,
    };
  }

  for (const row of rows) {
    const config = {
      ...(row.config || {}),
      accessToken: "",
      disabledAt: now,
      disabledReason: reason,
    };

    if (reason === "data-deletion") {
      config.dataDeletionRequestedAt = now;
    }

    const result = await updateSupabaseRecord(
      "integration_connections",
      [
        ["id", `eq.${row.id}`],
        ["workspace_id", `eq.${workspaceId}`],
        ["provider", `eq.${META_THREADS_PROVIDER}`],
        ["config->>userId", `eq.${userId}`],
        ["config->>oauthAppId", row.config?.oauthAppId ? `eq.${row.config.oauthAppId}` : "is.null"],
        ["config->>oauthAppKey", row.config?.oauthAppKey ? `eq.${row.config.oauthAppKey}` : "is.null"],
      ],
      {
        status: "disabled",
        config,
        last_synced_at: now,
      },
      { returnRepresentation: true, select: "id" },
    );
    if (!result.persisted || result.record?.id !== row.id || result.records?.length !== 1) {
      throw new Error("threads-connection-update-failed");
    }
  }

  return {
    matched: rows.length,
    updated: rows.length,
  };
}

export async function saveMetaThreadsConnection({
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
    provider: "Threads",
    brandHandle: normalizeHandle(brandHandle),
    brandKey: brandKey || null,
    ...(app ? { oauthAppKey: app.appKey, oauthAppId: app.appId } : {}),
    scope:
      longLivedTokenData?.scope ||
      tokenData?.scope ||
      (app || resolveMetaThreadsConfig()).scopes.join(","),
    accessToken,
    tokenType: longLivedTokenData?.token_type || tokenData?.token_type || "Bearer",
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    userId: profile.id,
    username: profile.username,
    profilePictureUrl: profile.threads_profile_picture_url || null,
    biography: profile.threads_biography || null,
  };
  const persistence = await saveSocialAccountConnection({
    workspaceId, provider: META_THREADS_PROVIDER, accountId: profile.id, config,
  });
  return {
    connectionId: persistence.id || null,
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
    brandKey: config.brandKey || null,
    userId: config.userId || null,
    username: config.username || null,
    profileHandle: config.username ? `@${config.username}` : null,
    expiresAt: config.expiresAt || null,
  };
}

export function isExpectedMetaThreadsProfile(profile, expectedHandle, expectedAccountId = null) {
  if (!profile?.id || !profile?.username) {
    return null;
  }

  return normalizeHandle(profile.username) === normalizeHandle(expectedHandle) &&
    (!expectedAccountId || profile.id === expectedAccountId);
}
