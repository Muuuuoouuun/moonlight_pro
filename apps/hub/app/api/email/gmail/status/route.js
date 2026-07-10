import { NextResponse } from "next/server";

import {
  fetchLatestGoogleGmailConnection,
  hasGoogleGmailOAuthStateSecret,
  resolveGoogleGmailConfig,
  summarizeGoogleGmailConnection,
} from "@/lib/google-gmail";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveGoogleGmailConfig();
  const connection = workspaceId
    ? await fetchLatestGoogleGmailConnection(workspaceId)
    : null;
  const connected = connection?.status === "connected";

  return NextResponse.json({
    status: connected
      ? "connected"
      : config.configured && hasGoogleGmailOAuthStateSecret()
        ? "ready"
        : "missing-config",
    provider: "google_gmail",
    workspaceId: workspaceId || null,
    configured: config.configured,
    hasOAuthStateSecret: hasGoogleGmailOAuthStateSecret(),
    connection: connection ? summarizeGoogleGmailConnection(connection) : null,
  });
}
