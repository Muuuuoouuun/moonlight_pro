import { NextResponse } from "next/server";

import {
  buildInstagramApiSetupUrls,
  fetchInstagramApiConnections,
  hasInstagramApiOAuthStateSecret,
  resolveInstagramApiConfig,
  summarizeInstagramApiConnection,
} from "@/lib/instagram-api";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { summarizeSocialAccountStatus } from "@/lib/social-account-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveInstagramApiConfig();
  const requestedHandle = (req.nextUrl.searchParams.get("brand") || config.brandHandle)
    .replace(/^@+/, "").toLowerCase();
  const accountId = req.nextUrl.searchParams.get("accountId") || "";
  const { connections, available } = await fetchInstagramApiConnections(workspaceId);
  const summary = summarizeSocialAccountStatus({
    rows: connections,
    configured: config.configured && hasInstagramApiOAuthStateSecret(),
    available,
    selector: accountId
      ? (row) => row.account_key === accountId
      : (row) => row.config?.brandHandle === requestedHandle,
    summarize: summarizeInstagramApiConnection,
  });

  return NextResponse.json({
    status: summary.status,
    provider: "instagram_api",
    workspaceId: workspaceId || null,
    brandHandle: requestedHandle,
    configured: config.configured,
    hasAppId: config.hasAppId,
    hasAppSecret: config.hasAppSecret,
    hasOAuthStateSecret: hasInstagramApiOAuthStateSecret(),
    scopes: config.scopes,
    connection: summary.connection,
    connections: summary.connections,
    setup: buildInstagramApiSetupUrls(origin),
  });
}
