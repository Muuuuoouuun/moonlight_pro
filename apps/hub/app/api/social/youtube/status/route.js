import { NextResponse } from "next/server";

import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import {
  hasYouTubeOAuthStateSecret,
  readLatestYouTubeConnection,
  resolveYouTubeOAuthConfig,
  resolveYouTubeRedirectUri,
  summarizeYouTubeConnection,
} from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveYouTubeOAuthConfig();
  const hasStateSecret = hasYouTubeOAuthStateSecret();
  const { connection, available } = await readLatestYouTubeConnection(workspaceId);
  const summary = connection ? summarizeYouTubeConnection(connection) : null;
  const refreshExpired = summary?.refreshTokenExpiresAt &&
    Date.parse(summary.refreshTokenExpiresAt) <= Date.now();

  return NextResponse.json({
    status: !available
      ? "storage-error"
      : !config.configured || !hasStateSecret
        ? "missing-config"
        : connection?.status === "connected" && summary?.hasRefreshToken
          ? refreshExpired ? "reauthorization-required" : "connected"
          : "ready",
    provider: "youtube",
    workspaceId: workspaceId || null,
    configured: config.configured,
    hasClientId: config.hasClientId,
    hasClientSecret: config.hasClientSecret,
    hasOAuthStateSecret: hasStateSecret,
    connection: summary,
    setup: {
      redirectUri: resolveYouTubeRedirectUri(req.nextUrl.origin),
      connectPath: "/api/social/youtube/connect",
      oneChannelPerWorkspace: true,
    },
  });
}
