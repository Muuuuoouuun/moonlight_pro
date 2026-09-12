import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";
import { assertOperatorEmail, resolveOperatorEmail } from "@/lib/sales-os/operator-scope";
import { createHmac, timingSafeEqual } from "crypto";
import { isGoogleOAuthProviderEnabled } from "./integration-readiness.js";
import { fetchSupabaseRowsDetailed } from "./server-read.js";

const GOOGLE_GMAIL_PROVIDER = "google_gmail";
const GOOGLE_GMAIL_SYNC_SOURCE = "google_gmail";
// gmail.readonly supports the durable inquiry collector. Existing connections created
// before this scope was added will need to reconnect (buildGoogleGmailAuthUrl
// forces prompt=consent, so re-auth re-issues a refresh token with the wider
// scope) — reading inbox messages is not possible with a send-only grant.
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function resolveGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
  };
}

async function fetchSupabaseRows(table, options = {}) {
  if (!resolveSupabaseConfig()) return null;
  const result = await fetchSupabaseRowsDetailed(table, options);
  if (!Array.isArray(result?.rows) && options.strict) throw new Error("gmail-connection-read-failed");
  return result?.rows || null;
}

function resolveOAuthStateSecret() {
  return (
    process.env.COM_MOON_OAUTH_STATE_SECRET?.trim() ||
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

export function hasGoogleGmailOAuthStateSecret() {
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

export function decodeGoogleGmailState(value) {
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

export function resolveGoogleGmailRedirectUri(origin) {
  const baseUrl =
    process.env.COM_MOON_HUB_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    origin ||
    "";

  return `${baseUrl.replace(/\/$/, "")}/api/email/gmail/callback`;
}

export function buildGoogleGmailAuthUrl({
  origin,
  workspaceId = resolveDefaultWorkspaceId(),
  mailbox = resolveOperatorEmail(),
  returnPath = "/dashboard/automations/email",
}) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth || !isGoogleOAuthProviderEnabled("gmail") || !hasGoogleGmailOAuthStateSecret()) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: resolveGoogleGmailRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES.join(" "),
    login_hint: mailbox,
    state: encodeState({
      workspaceId: workspaceId || resolveDefaultWorkspaceId(),
      mailbox,
      returnPath: sanitizeReturnPath(returnPath, "/dashboard/automations/email"),
    }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeGoogleToken(params) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    ...params,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(`gmail-token-${response.status}`);
    error.status = response.status;
    if (detail.error === "invalid_grant" || [401, 403].includes(response.status)) error.code = "gmail-reconnect-required";
    throw error;
  }

  return await response.json();
}

export async function exchangeGoogleGmailCode({ code, redirectUri }) {
  return exchangeGoogleToken({
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshGoogleGmailAccessToken(refreshToken) {
  return exchangeGoogleToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function fetchLatestGoogleGmailConnection(
  workspaceId = resolveDefaultWorkspaceId(),
  { strict = false } = {},
) {
  const filters = [["provider", `eq.${GOOGLE_GMAIL_PROVIDER}`]];

  if (workspaceId) {
    filters.push(["workspace_id", `eq.${workspaceId}`]);
  }

  const rows = await fetchSupabaseRows("integration_connections", {
    strict, filters,
    order: "created_at.desc",
    limit: 1,
  });

  return rows?.[0] || null;
}

export async function fetchGoogleUserEmail(accessToken) {
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return typeof payload?.email === "string" ? payload.email.trim() || null : null;
  } catch {
    return null;
  }
}

export async function saveGoogleGmailConnection({
  workspaceId = resolveDefaultWorkspaceId(),
  mailbox = "me",
  tokenData,
}) {
  const existing = await fetchLatestGoogleGmailConnection(workspaceId);
  const now = new Date().toISOString();
  const resolvedEmail =
    (await fetchGoogleUserEmail(tokenData.access_token)) ||
    existing?.config?.email ||
    null;
  const emailCheck = assertOperatorEmail(resolvedEmail, GOOGLE_GMAIL_PROVIDER);
  if (!emailCheck.ok) {
    throw new Error(emailCheck.reason);
  }
  const config = {
    provider: "Gmail",
    mailbox: mailbox || resolveOperatorEmail(),
    scope: tokenData.scope || GOOGLE_SCOPES.join(" "),
    accessToken: tokenData.access_token || "",
    refreshToken: tokenData.refresh_token || existing?.config?.refreshToken || "",
    tokenType: tokenData.token_type || "Bearer",
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
    email: resolvedEmail,
  };
  const record = {
    workspace_id: workspaceId || null,
    provider: GOOGLE_GMAIL_PROVIDER,
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
  const latest = await fetchLatestGoogleGmailConnection(workspaceId);

  return {
    connectionId: latest?.id || null,
    persistence,
    config,
  };
}

export async function recordGoogleGmailSync({
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
      provider: GOOGLE_GMAIL_SYNC_SOURCE,
      ...payload,
    },
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
}

// --- message reading (scan pipeline) ----------------------------------------
// Mirrors google-sheets.js's resolveSheetsConnection / getValidAccessToken
// shape so gmail-intake.js can follow the same connect -> refresh -> call flow.

export async function resolveGmailConnection(workspaceId = resolveDefaultWorkspaceId()) {
  const stored = await fetchLatestGoogleGmailConnection(workspaceId, { strict: true });
  if (stored?.config?.refreshToken) {
    return {
      source: "connection",
      connectionId: stored.id,
      config: stored.config,
      refreshToken: stored.config.refreshToken,
      accessToken: stored.config.accessToken || null,
      expiresAt: stored.config.expiresAt || null,
      mailbox: stored.config.mailbox || resolveOperatorEmail(),
    };
  }

  // Fallback env refresh token (single-mailbox ops setup, no DB connection row).
  const envRefresh =
    process.env.GOOGLE_REFRESH_TOKEN_BOSS?.trim() ||
    process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (envRefresh) {
    return {
      source: "env",
      connectionId: null,
      config: null,
      refreshToken: envRefresh,
      accessToken: null,
      expiresAt: null,
      mailbox: resolveOperatorEmail(),
    };
  }

  return null;
}

function isAccessTokenFresh(connection) {
  if (!connection?.accessToken || !connection?.expiresAt) return false;
  return new Date(connection.expiresAt).getTime() - Date.now() > 60_000;
}

// Resolves a valid access token, refreshing if needed. Persists refreshed
// tokens back to the connection row (env source is read-only, same as Sheets).
export async function getValidGmailAccessToken(connection) {
  if (!connection?.refreshToken) return null;
  if (isAccessTokenFresh(connection)) return connection.accessToken;

  const tokenData = await refreshGoogleGmailAccessToken(connection.refreshToken);
  if (!tokenData?.access_token) return null;

  const accessToken = tokenData.access_token;
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  if (connection.source === "connection" && connection.connectionId) {
    const mergedConfig = {
      ...(connection.config || {}),
      accessToken,
      expiresAt,
      // Google omits refresh_token on refresh — keep the original.
      refreshToken: tokenData.refresh_token || connection.refreshToken,
    };
    await updateSupabaseRecord(
      "integration_connections",
      [["id", `eq.${connection.connectionId}`]],
      { config: mergedConfig, last_synced_at: new Date().toISOString() },
    );
  }

  return accessToken;
}

async function gmailJsonRequest(url, { accessToken, method = "GET", fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // Keep status for expired-history recovery; do not echo provider bodies or tokens.
    const error = new Error(`gmail-api-${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function gmailRequest(path, options = {}) {
  return gmailJsonRequest(`${GOOGLE_GMAIL_API_BASE}${path}`, options);
}

export function hasGmailReadScope(scope) {
  const granted = new Set(String(scope || "").split(/\s+/));
  return ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify", "https://mail.google.com/"].some(value => granted.has(value));
}

// Inquiry collection reads full messages and all messageAdded history pages.
// Existing callers of fetchRecentGmailMessages keep their compatibility behavior.
export function createGmailInquiryClient({ accessToken, fetchImpl = fetch, timeoutMs = 10000 }) {
  const options = { accessToken, fetchImpl, timeoutMs };
  return {
    getTokenInfo: () => gmailJsonRequest(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, options),
    getProfile: () => gmailRequest("/profile", options),
    getMessage: id => gmailRequest(`/messages/${encodeURIComponent(id)}?format=full`, options),
    getThread: id => gmailRequest(`/threads/${encodeURIComponent(id)}?format=full`, options),
    listMessages: ({ after, before, pageToken, maxResults = 50 }) => {
      const q = [`after:${Math.floor(Date.parse(after) / 1000)}`, `before:${Math.ceil(Date.parse(before) / 1000) + 1}`, "-in:sent", "-in:drafts", "-in:spam", "-in:trash"].join(" ");
      const params = new URLSearchParams({ q, maxResults: String(Math.min(50, maxResults)), includeSpamTrash: "false" });
      if (pageToken) params.set("pageToken", pageToken);
      return gmailRequest(`/messages?${params}`, options);
    },
    listHistory: ({ startHistoryId, pageToken, maxResults = 50 }) => {
      const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", maxResults: String(Math.min(50, maxResults)) });
      if (pageToken) params.set("pageToken", pageToken);
      return gmailRequest(`/history?${params}`, options);
    },
  };
}

function decodeHeaderValue(headers, name) {
  const header = Array.isArray(headers)
    ? headers.find((h) => String(h?.name || "").toLowerCase() === name.toLowerCase())
    : null;
  return header?.value || "";
}

// Lists recent INBOX message ids, then fetches metadata (from/subject/snippet)
// for each — no body content is fetched, only what the classifier needs.
export async function fetchRecentGmailMessages({ accessToken, maxMessages = 20 }) {
  const listData = await gmailRequest(
    `/messages?maxResults=${encodeURIComponent(maxMessages)}&labelIds=INBOX`,
    { accessToken },
  );
  const ids = Array.isArray(listData.messages) ? listData.messages.map((m) => m.id) : [];

  const messages = [];
  for (const id of ids) {
    const detail = await gmailRequest(
      `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      { accessToken },
    );
    messages.push({
      id: detail.id || id,
      threadId: detail.threadId || null,
      from: decodeHeaderValue(detail.payload?.headers, "From"),
      subject: decodeHeaderValue(detail.payload?.headers, "Subject"),
      snippet: detail.snippet || "",
    });
  }

  return messages;
}
