import { NextResponse } from "next/server";

import {
  buildGoogleGmailAuthUrl,
  fetchLatestGoogleGmailConnection,
  hasGoogleGmailOAuthStateSecret,
} from "@/lib/google-gmail";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function googleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

function fallbackRefreshTokenConfigured() {
  return Boolean(
    process.env.GOOGLE_REFRESH_TOKEN_BOSS?.trim() ||
      process.env.GOOGLE_REFRESH_TOKEN?.trim(),
  );
}

function summarizeConnection(connection) {
  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    mailbox: connection.config?.mailbox || "me",
    email: connection.config?.email || null,
    scope: connection.config?.scope || null,
    expiresAt: connection.config?.expiresAt || null,
    hasRefreshToken: Boolean(connection.config?.refreshToken),
    lastSyncedAt: connection.last_synced_at || null,
    createdAt: connection.created_at || null,
  };
}

export async function GET(req) {
  const { origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const connection = workspaceId
    ? await fetchLatestGoogleGmailConnection(workspaceId)
    : null;
  const connected = connection?.status === "connected";
  const authUrl = buildGoogleGmailAuthUrl({
    origin,
    workspaceId,
  });
  const ready =
    googleOAuthConfigured() &&
    hasGoogleGmailOAuthStateSecret() &&
    (connected || fallbackRefreshTokenConfigured());

  return NextResponse.json({
    status: connected ? "connected" : ready ? "ready" : "missing-config",
    provider: "google_gmail",
    workspaceId: workspaceId || null,
    configured: ready,
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
    hasOAuthStateSecret: hasGoogleGmailOAuthStateSecret(),
    hasFallbackRefreshToken: fallbackRefreshTokenConfigured(),
    senderEmail: process.env.GMAIL_SENDER_EMAIL?.trim() || null,
    connection: summarizeConnection(connection),
    setup: {
      oauthRedirectUri: `${origin}/api/email/gmail/callback`,
      connectUrl: authUrl,
    },
  });
}
