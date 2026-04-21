import {
  insertSupabaseRecord,
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";

const GOOGLE_GMAIL_PROVIDER = "google_gmail";
const GOOGLE_GMAIL_SYNC_SOURCE = "google_gmail";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

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

function encodeState(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeGoogleGmailState(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export function resolveGoogleGmailRedirectUri(origin) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || origin || "";

  return `${baseUrl.replace(/\/$/, "")}/api/email/gmail/callback`;
}

export function buildGoogleGmailAuthUrl({
  origin,
  workspaceId = resolveDefaultWorkspaceId(),
  mailbox = "me",
  returnPath = "/dashboard/automations/email",
}) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: resolveGoogleGmailRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES.join(" "),
    state: encodeState({
      workspaceId,
      mailbox,
      returnPath,
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
) {
  const filters = [["provider", `eq.${GOOGLE_GMAIL_PROVIDER}`]];

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

async function fetchGoogleUserEmail(accessToken) {
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
  const config = {
    provider: "Gmail",
    mailbox: mailbox || "me",
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
