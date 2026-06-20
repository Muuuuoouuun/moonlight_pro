import { NextResponse } from "next/server";

import {
  buildGoogleCalendarAuthUrl,
  fetchLatestGoogleCalendarConnection,
  hasGoogleCalendarOAuthStateSecret,
} from "@/lib/google-calendar";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function googleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
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
    calendarId: connection.config?.calendarId || "primary",
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
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const connection = workspaceId
    ? await fetchLatestGoogleCalendarConnection(workspaceId)
    : null;
  const connected = connection?.status === "connected";
  const authUrl = buildGoogleCalendarAuthUrl({
    origin,
    workspaceId,
    calendarId,
  });

  return NextResponse.json({
    status: connected
      ? "connected"
      : googleOAuthConfigured() && hasGoogleCalendarOAuthStateSecret()
        ? "ready"
        : "missing-config",
    provider: "google_calendar",
    workspaceId: workspaceId || null,
    configured: Boolean(googleOAuthConfigured() && hasGoogleCalendarOAuthStateSecret() && calendarId),
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
    hasOAuthStateSecret: hasGoogleCalendarOAuthStateSecret(),
    calendarId,
    connection: summarizeConnection(connection),
    setup: {
      oauthRedirectUri: `${origin}/api/calendar/google/callback`,
      connectUrl: authUrl,
    },
  });
}
