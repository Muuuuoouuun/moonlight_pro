import { NextResponse } from "next/server";

import {
  fetchLatestGoogleGmailConnection,
  summarizeGoogleGmailConnection,
} from "@/lib/google-gmail";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import {
  buildGoogleProviderStatus,
  resolveGoogleOAuthProviderReadiness,
} from "@/lib/integration-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const workspaceId = resolveDefaultWorkspaceId();
  const readiness = resolveGoogleOAuthProviderReadiness().gmail;
  const connection = readiness.enabled && workspaceId
    ? await fetchLatestGoogleGmailConnection(workspaceId)
    : null;
  const providerStatus = buildGoogleProviderStatus("gmail", {
    connected: connection?.status === "connected",
    ledgerConfigured: Boolean(workspaceId),
  });

  return NextResponse.json({
    provider: "google_gmail",
    workspaceId: workspaceId || null,
    ...providerStatus,
    connection: connection ? summarizeGoogleGmailConnection(connection) : null,
  });
}
