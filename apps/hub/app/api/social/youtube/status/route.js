import { NextResponse } from "next/server";

import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import {
  hasYouTubeOAuthStateSecret,
  readYouTubeConnections,
  resolveYouTubeOAuthConfig,
  resolveYouTubeRedirectUri,
  summarizeYouTubeConnection,
} from "@/lib/youtube-oauth";
import { summarizeSocialAccountStatus } from "@/lib/social-account-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveYouTubeOAuthConfig();
  const hasStateSecret = hasYouTubeOAuthStateSecret();
  const { connections, available } = await readYouTubeConnections(workspaceId);
  const channelId = req.nextUrl.searchParams.get("channelId") || "";
  const brandKey = req.nextUrl.searchParams.get("brandKey") || "";
  const summary = summarizeSocialAccountStatus({
    rows: connections,
    configured: config.configured && hasStateSecret,
    available,
    selector: channelId
      ? (row) => row.account_key === channelId
      : brandKey ? (row) => row.config?.brandKey === brandKey : () => true,
    summarize: summarizeYouTubeConnection,
    connectedStatus: (_row, selected) => {
      if (!selected.hasRefreshToken ||
        (selected.refreshTokenExpiresAt && Date.parse(selected.refreshTokenExpiresAt) <= Date.now())) {
        return "reauthorization-required";
      }
      return "connected";
    },
  });

  return NextResponse.json({
    status: summary.status,
    provider: "youtube",
    workspaceId: workspaceId || null,
    configured: config.configured,
    hasClientId: config.hasClientId,
    hasClientSecret: config.hasClientSecret,
    hasOAuthStateSecret: hasStateSecret,
    connection: summary.connection,
    connections: summary.connections,
    setup: {
      redirectUri: resolveYouTubeRedirectUri(req.nextUrl.origin),
      connectPath: "/api/social/youtube/connect",
      oneChannelPerWorkspace: false,
    },
  });
}
