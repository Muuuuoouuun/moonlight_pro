import { NextResponse } from "next/server.js";

import {
  buildInstagramApiSetupUrls,
  fetchInstagramApiConnections,
  hasInstagramApiOAuthStateSecret,
  resolveInstagramApiConfig,
  summarizeInstagramApiConnection,
} from "@/lib/instagram-api";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { summarizeSocialAccountStatus } from "@/lib/social-account-status";
import { matchesMetaOAuthConnection, resolveMetaOAuthApp } from "@/lib/meta-oauth-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const legacyConfig = resolveInstagramApiConfig();
  const requestedHandle = (req.nextUrl.searchParams.get("brand") || legacyConfig.brandHandle)
    .replace(/^@+/, "").toLowerCase();
  const config = resolveMetaOAuthApp({
    provider: "instagram_api",
    brandKey: req.nextUrl.searchParams.get("brandKey"),
    brandHandle: requestedHandle,
  });
  const accountId = req.nextUrl.searchParams.get("accountId") || "";
  const { connections, available } = await fetchInstagramApiConnections(workspaceId);
  const summary = summarizeSocialAccountStatus({
    rows: connections,
    configured: Boolean(config?.configured && hasInstagramApiOAuthStateSecret()),
    available,
    selector: (row) => matchesMetaOAuthConnection(row, config, accountId),
    summarize: summarizeInstagramApiConnection,
  });

  return NextResponse.json({
    status: summary.status,
    provider: "instagram_api",
    workspaceId: workspaceId || null,
    brandHandle: requestedHandle,
    brandKey: config?.brandKey || null,
    configured: Boolean(config?.configured),
    appKey: config?.appKey || null,
    hasAppId: Boolean(config?.hasAppId),
    hasAppSecret: Boolean(config?.hasAppSecret),
    hasOAuthStateSecret: hasInstagramApiOAuthStateSecret(),
    scopes: config?.scopes || [],
    connection: summary.connection,
    connections: summary.connections,
    setup: buildInstagramApiSetupUrls(origin),
  });
}
