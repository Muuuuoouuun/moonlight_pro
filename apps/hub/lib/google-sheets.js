// Google Sheets adapter (raw `fetch`, no `googleapis` SDK).
//
// Mirrors the `google-gmail.js` connection model: OAuth grant persisted to
// `integration_connections` (provider `google_sheets`), sync logged to
// `sync_runs`. For a single operator there is also an env fast-path
// (`GOOGLE_SHEETS_REFRESH_TOKEN` + `GOOGLE_SHEETS_SPREADSHEET_ID`) so the sheet
// can be wired without the OAuth UI. The Gmail grant is NOT reused — Sheets
// needs the `spreadsheets` scope, which requires its own consent (re-consent).

import {
  insertSupabaseRecord,
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";
import {
  buildGoogleAuthUrl,
  decodeState,
  encodeState,
  exchangeGoogleCode,
  fetchGoogleUserEmail,
  hasOAuthStateSecret,
  refreshGoogleAccessToken,
  sanitizeReturnPath,
} from "@/lib/google-oauth";

const GOOGLE_SHEETS_PROVIDER = "google_sheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];
const DEFAULT_RETURN_PATH = "/dashboard/automations/integrations";

export { hasOAuthStateSecret as hasGoogleSheetsOAuthStateSecret };
export { decodeState as decodeGoogleSheetsState };

// --- connection persistence -------------------------------------------------

async function fetchSupabaseRows(table, { filters = [], order, limit } = {}) {
  const config = resolveSupabaseConfig();
  if (!config) return null;

  const params = new URLSearchParams();
  params.set("select", "*");
  if (order) params.set("order", order);
  if (typeof limit === "number") params.set("limit", String(limit));
  filters.forEach(([key, value]) => params.append(key, value));

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}?${params.toString()}`, {
      headers: makeSupabaseHeaders(config.apiKey),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchLatestGoogleSheetsConnection(workspaceId = resolveDefaultWorkspaceId()) {
  const filters = [["provider", `eq.${GOOGLE_SHEETS_PROVIDER}`]];
  if (workspaceId) filters.push(["workspace_id", `eq.${workspaceId}`]);

  const rows = await fetchSupabaseRows("integration_connections", {
    filters,
    order: "created_at.desc",
    limit: 1,
  });
  return rows?.[0] || null;
}

export function resolveGoogleSheetsRedirectUri(origin) {
  const baseUrl =
    process.env.COM_MOON_HUB_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    origin ||
    "";
  return `${baseUrl.replace(/\/$/, "")}/api/integrations/sheets/callback`;
}

export function buildGoogleSheetsAuthUrl({
  origin,
  workspaceId = resolveDefaultWorkspaceId(),
  spreadsheetId = "",
  returnPath = DEFAULT_RETURN_PATH,
}) {
  return buildGoogleAuthUrl({
    scopes: SHEETS_SCOPES,
    redirectUri: resolveGoogleSheetsRedirectUri(origin),
    state: encodeState({
      provider: GOOGLE_SHEETS_PROVIDER,
      workspaceId: workspaceId || resolveDefaultWorkspaceId(),
      spreadsheetId,
      returnPath: sanitizeReturnPath(returnPath, DEFAULT_RETURN_PATH),
    }),
  });
}

export async function exchangeGoogleSheetsCode({ code, redirectUri }) {
  return exchangeGoogleCode({ code, redirectUri });
}

function buildConnectionConfig(tokenData, { spreadsheetId, email, existing } = {}) {
  return {
    provider: "Google Sheets",
    scope: tokenData.scope || SHEETS_SCOPES.join(" "),
    accessToken: tokenData.access_token || "",
    refreshToken: tokenData.refresh_token || existing?.refreshToken || "",
    tokenType: tokenData.token_type || "Bearer",
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
    email: email || existing?.email || null,
    spreadsheetId: spreadsheetId || existing?.spreadsheetId || "",
  };
}

export async function saveGoogleSheetsConnection({
  workspaceId = resolveDefaultWorkspaceId(),
  spreadsheetId = "",
  tokenData,
}) {
  const existing = await fetchLatestGoogleSheetsConnection(workspaceId);
  const email = (await fetchGoogleUserEmail(tokenData.access_token)) || existing?.config?.email || null;
  const config = buildConnectionConfig(tokenData, {
    spreadsheetId,
    email,
    existing: existing?.config,
  });
  const record = {
    workspace_id: workspaceId || null,
    provider: GOOGLE_SHEETS_PROVIDER,
    status: "connected",
    config,
    last_synced_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const persistence = await updateSupabaseRecord(
      "integration_connections",
      [["id", `eq.${existing.id}`]],
      record,
    );
    return { connectionId: existing.id, persistence, config };
  }

  const persistence = await insertSupabaseRecord("integration_connections", record);
  const latest = await fetchLatestGoogleSheetsConnection(workspaceId);
  return { connectionId: latest?.id || null, persistence, config };
}

export async function recordGoogleSheetsSync({
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
    payload: { provider: GOOGLE_SHEETS_PROVIDER, ...payload },
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
}

// --- access-token resolution ------------------------------------------------

// Returns a working connection descriptor or null. Prefers a stored OAuth
// grant; falls back to the single-operator env token.
export async function resolveSheetsConnection(workspaceId = resolveDefaultWorkspaceId()) {
  const stored = await fetchLatestGoogleSheetsConnection(workspaceId);
  if (stored?.config?.refreshToken) {
    return {
      source: "connection",
      connectionId: stored.id,
      config: stored.config,
      refreshToken: stored.config.refreshToken,
      accessToken: stored.config.accessToken || null,
      expiresAt: stored.config.expiresAt || null,
      spreadsheetId: stored.config.spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || "",
    };
  }

  const envRefresh = process.env.GOOGLE_SHEETS_REFRESH_TOKEN?.trim();
  const envSheet = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (envRefresh) {
    return {
      source: "env",
      connectionId: null,
      config: null,
      refreshToken: envRefresh,
      accessToken: null,
      expiresAt: null,
      spreadsheetId: envSheet || "",
    };
  }

  return null;
}

function isAccessTokenFresh(connection) {
  if (!connection?.accessToken || !connection?.expiresAt) return false;
  return new Date(connection.expiresAt).getTime() - Date.now() > 60_000;
}

// Resolves a valid access token, refreshing if needed. Persists refreshed
// tokens back to the connection row (env source is read-only).
export async function getValidAccessToken(connection) {
  if (!connection?.refreshToken) return null;
  if (isAccessTokenFresh(connection)) return connection.accessToken;

  const tokenData = await refreshGoogleAccessToken(connection.refreshToken);
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

// --- Sheets values API ------------------------------------------------------

function sheetsValuesUrl(spreadsheetId, range, suffix = "") {
  return `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}${suffix}`;
}

async function sheetsRequest(url, { accessToken, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Sheets API ${method} failed with ${response.status}`);
  }

  return response.json().catch(() => ({}));
}

export async function readSheetValues({ accessToken, spreadsheetId, range }) {
  const data = await sheetsRequest(sheetsValuesUrl(spreadsheetId, range), { accessToken });
  return Array.isArray(data.values) ? data.values : [];
}

export async function writeSheetValues({ accessToken, spreadsheetId, range, values }) {
  return sheetsRequest(sheetsValuesUrl(spreadsheetId, range, "?valueInputOption=RAW"), {
    accessToken,
    method: "PUT",
    body: { values },
  });
}

export async function appendSheetValues({ accessToken, spreadsheetId, range, values }) {
  return sheetsRequest(
    sheetsValuesUrl(spreadsheetId, range, ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"),
    { accessToken, method: "POST", body: { values } },
  );
}
