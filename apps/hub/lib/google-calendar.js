import {
  insertSupabaseRecord,
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";
import { createHmac, timingSafeEqual } from "crypto";

const GOOGLE_CALENDAR_PROVIDER = "google_calendar";
const GOOGLE_CALENDAR_SYNC_SOURCE = "google_calendar";
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

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

export function hasGoogleCalendarOAuthStateSecret() {
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

export function decodeGoogleCalendarState(value) {
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

export function resolveGoogleCalendarRedirectUri(origin) {
  const baseUrl =
    process.env.COM_MOON_HUB_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    origin ||
    "";

  return `${baseUrl.replace(/\/$/, "")}/api/calendar/google/callback`;
}

export function buildGoogleCalendarAuthUrl({
  origin,
  workspaceId = resolveDefaultWorkspaceId(),
  calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
  returnPath = "/dashboard/work/calendar",
}) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth || !hasGoogleCalendarOAuthStateSecret()) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: resolveGoogleCalendarRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES.join(" "),
    state: encodeState({
      workspaceId: workspaceId || resolveDefaultWorkspaceId(),
      calendarId,
      returnPath: sanitizeReturnPath(returnPath, "/dashboard/work/calendar"),
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
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Google token exchange failed with ${response.status}`);
  }

  return await response.json();
}

export async function exchangeGoogleCalendarCode({ code, redirectUri }) {
  return exchangeGoogleToken({
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshGoogleCalendarAccessToken(refreshToken) {
  return exchangeGoogleToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function fetchLatestGoogleCalendarConnection(workspaceId = resolveDefaultWorkspaceId()) {
  const rows = await fetchSupabaseRows("integration_connections", {
    filters: [
      ["provider", `eq.${GOOGLE_CALENDAR_PROVIDER}`],
      ["workspace_id", `eq.${workspaceId}`],
    ],
    order: "created_at.desc",
    limit: 1,
  });

  return rows?.[0] || null;
}

export async function saveGoogleCalendarConnection({
  workspaceId = resolveDefaultWorkspaceId(),
  calendarId,
  tokenData,
}) {
  const existing = await fetchLatestGoogleCalendarConnection(workspaceId);
  const now = new Date().toISOString();
  const config = {
    provider: "Google Calendar",
    calendarId: calendarId || "primary",
    scope: tokenData.scope || GOOGLE_SCOPES.join(" "),
    accessToken: tokenData.access_token || "",
    refreshToken: tokenData.refresh_token || existing?.config?.refreshToken || "",
    tokenType: tokenData.token_type || "Bearer",
    expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
  };
  const record = {
    workspace_id: workspaceId || null,
    provider: GOOGLE_CALENDAR_PROVIDER,
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
  const latest = await fetchLatestGoogleCalendarConnection(workspaceId);

  return {
    connectionId: latest?.id || null,
    persistence,
    config,
  };
}

export async function recordGoogleCalendarSync({
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
    payload,
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
}

async function refreshConnectionAccessToken(connection) {
  const refreshToken = connection?.config?.refreshToken;

  if (!refreshToken) {
    return {
      accessToken: connection?.config?.accessToken || "",
      connection,
      refreshed: false,
    };
  }

  const refreshed = await refreshGoogleCalendarAccessToken(refreshToken);
  const nextConfig = {
    ...connection.config,
    accessToken: refreshed.access_token || connection.config?.accessToken || "",
    tokenType: refreshed.token_type || connection.config?.tokenType || "Bearer",
    expiresAt: refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : connection.config?.expiresAt || null,
  };

  if (connection.id) {
    await updateSupabaseRecord(
      "integration_connections",
      [["id", `eq.${connection.id}`]],
      {
        config: nextConfig,
        last_synced_at: new Date().toISOString(),
      },
    );
  }

  return {
    accessToken: nextConfig.accessToken || "",
    connection: {
      ...connection,
      config: nextConfig,
    },
    refreshed: true,
  };
}

export async function ensureGoogleCalendarAccess({
  workspaceId = resolveDefaultWorkspaceId(),
  calendarId,
}) {
  const connection = await fetchLatestGoogleCalendarConnection(workspaceId);

  if (!connection) {
    return {
      ok: false,
      reason: "missing-connection",
      connection: null,
      accessToken: "",
      calendarId: calendarId || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
    };
  }

  const expiresAt = connection.config?.expiresAt ? new Date(connection.config.expiresAt).getTime() : 0;
  const needsRefresh = !connection.config?.accessToken || !expiresAt || expiresAt <= Date.now() + 60_000;
  const access = needsRefresh
    ? await refreshConnectionAccessToken(connection)
    : {
        accessToken: connection.config?.accessToken || "",
        connection,
        refreshed: false,
      };

  if (!access.accessToken) {
    return {
      ok: false,
      reason: "missing-access-token",
      connection: access.connection,
      accessToken: "",
      calendarId: calendarId || access.connection?.config?.calendarId || "primary",
    };
  }

  return {
    ok: true,
    reason: access.refreshed ? "refreshed" : "ok",
    connection: access.connection,
    accessToken: access.accessToken,
    calendarId: calendarId || access.connection?.config?.calendarId || "primary",
  };
}

async function fetchGoogleCalendarJson(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Google Calendar request failed with ${response.status}`);
  }

  return await response.json();
}

export async function listGoogleCalendarEvents({
  workspaceId = resolveDefaultWorkspaceId(),
  calendarId,
  timeMin,
  timeMax,
  maxResults = 20,
}) {
  try {
    const access = await ensureGoogleCalendarAccess({ workspaceId, calendarId });

    if (!access.ok) {
      return {
        ok: false,
        reason: access.reason,
        items: [],
        connection: access.connection,
      };
    }

    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(maxResults),
    });

    if (timeMin) {
      params.set("timeMin", timeMin);
    }

    if (timeMax) {
      params.set("timeMax", timeMax);
    }

    const encodedCalendarId = encodeURIComponent(access.calendarId);
    const payload = await fetchGoogleCalendarJson(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodedCalendarId}/events?${params.toString()}`,
      access.accessToken,
    );

    return {
      ok: true,
      reason: "ok",
      items: Array.isArray(payload.items) ? payload.items : [],
      connection: access.connection,
      calendarId: access.calendarId,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      items: [],
      connection: null,
      calendarId: calendarId || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
    };
  }
}

function buildGoogleCalendarEventPayload(input) {
  const title = String(input.title || "").trim() || "Com_Moon schedule";
  const description = String(input.description || "").trim();
  const location = String(input.location || "").trim();
  const allDay = Boolean(input.allDay);
  const startAt = String(input.startAt || "").trim();
  const endAt = String(input.endAt || "").trim();
  const timeZone = String(input.timeZone || "Asia/Seoul").trim() || "Asia/Seoul";
  const startDate = startAt.slice(0, 10);
  const rawEndDate = (endAt || startAt).slice(0, 10);
  const exclusiveAllDayEndDate =
    allDay && startDate && (!rawEndDate || rawEndDate <= startDate)
      ? new Date(Date.parse(`${startDate}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : rawEndDate;

  return {
    summary: title,
    description: description || undefined,
    location: location || undefined,
    start: allDay
      ? { date: startDate }
      : { dateTime: startAt, timeZone },
    end: allDay
      ? { date: exclusiveAllDayEndDate || startDate }
      : { dateTime: endAt || startAt, timeZone },
  };
}

export async function createOrUpdateGoogleCalendarEvent({
  workspaceId = resolveDefaultWorkspaceId(),
  calendarId,
  eventId,
  input,
}) {
  const access = await ensureGoogleCalendarAccess({ workspaceId, calendarId });

  if (!access.ok) {
    return {
      ok: false,
      reason: access.reason,
      connection: access.connection,
      event: null,
    };
  }

  const encodedCalendarId = encodeURIComponent(access.calendarId);
  const payload = buildGoogleCalendarEventPayload(input);
  const isUpdate = Boolean(eventId);
  const endpoint = isUpdate
    ? `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodedCalendarId}/events/${encodeURIComponent(eventId)}`
    : `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodedCalendarId}/events`;
  const event = await fetchGoogleCalendarJson(endpoint, access.accessToken, {
    method: isUpdate ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });

  await recordGoogleCalendarSync({
    workspaceId,
    connectionId: access.connection?.id || null,
    status: "success",
    payload: {
      provider: GOOGLE_CALENDAR_SYNC_SOURCE,
      action: isUpdate ? "update" : "create",
      eventId: event.id,
      calendarId: access.calendarId,
      title: event.summary || payload.summary,
    },
  });

  return {
    ok: true,
    reason: isUpdate ? "updated" : "created",
    connection: access.connection,
    event,
  };
}

export { GOOGLE_CALENDAR_PROVIDER };
