import { fetchSupabaseRows } from "../supabase-rest";
import {
  buildMultipartAlternativeEmail,
  textToHtml,
  type EmailRecipient,
} from "./format";

const GOOGLE_GMAIL_PROVIDER = "google_gmail";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

interface GmailSendInput {
  workspaceId?: string | null;
  dryRun?: boolean;
  to: EmailRecipient[];
  subject: string;
  text: string;
  html?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
}

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

function resolveFallbackRefreshToken() {
  return (
    process.env.GOOGLE_REFRESH_TOKEN_BOSS?.trim() ||
    process.env.GOOGLE_REFRESH_TOKEN?.trim() ||
    ""
  );
}

function resolveFallbackSenderEmail() {
  return (
    process.env.GMAIL_SENDER_EMAIL?.trim() ||
    process.env.EMAIL_FROM_ADDRESS?.trim() ||
    ""
  );
}

export async function fetchLatestGoogleGmailConnection(workspaceId = "") {
  const filters: Array<[string, string]> = [["provider", `eq.${GOOGLE_GMAIL_PROVIDER}`]];

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

async function exchangeGoogleRefreshToken(refreshToken: string) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
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
    throw new Error(detail || `gmail-token-http-${response.status}`);
  }

  return await response.json();
}

async function resolveGmailAccess(workspaceId = "") {
  const connection = await fetchLatestGoogleGmailConnection(workspaceId);
  const refreshToken =
    connection?.config?.refreshToken || resolveFallbackRefreshToken();

  if (!refreshToken) {
    return {
      ok: false as const,
      reason: "missing-gmail-refresh-token",
      connection,
    };
  }

  const tokenData = await exchangeGoogleRefreshToken(refreshToken);
  const senderEmail =
    connection?.config?.email || resolveFallbackSenderEmail();

  if (!tokenData?.access_token) {
    return {
      ok: false as const,
      reason: "missing-gmail-access-token",
      connection,
    };
  }

  if (!senderEmail) {
    return {
      ok: false as const,
      reason: "missing-gmail-sender-email",
      connection,
    };
  }

  return {
    ok: true as const,
    connection,
    senderEmail,
    accessToken: tokenData.access_token,
  };
}

export async function sendWithGmail(input: GmailSendInput) {
  const access = await resolveGmailAccess(input.workspaceId || "");

  if (!access.ok) {
    return access;
  }

  const html = input.html?.trim() || textToHtml(input.text);
  const preview = {
    from: access.senderEmail,
    to: input.to.map((item) => item.email),
    subject: input.subject,
    replyTo: input.replyTo || null,
  };

  if (input.dryRun) {
    return {
      ok: true as const,
      provider: "gmail",
      messageId: null,
      preview,
      connection: access.connection,
    };
  }

  const raw = buildMultipartAlternativeEmail({
    from: {
      email: access.senderEmail,
      name: input.fromName || undefined,
    },
    to: input.to,
    replyTo: input.replyTo || null,
    subject: input.subject,
    text: input.text,
    html,
  });

  const response = await fetch(GMAIL_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${access.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false as const,
      reason: detail || `gmail-send-http-${response.status}`,
      connection: access.connection,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    threadId?: string;
  };

  return {
    ok: true as const,
    provider: "gmail",
    messageId: payload.id || payload.threadId || null,
    preview,
    connection: access.connection,
  };
}
