import { NextResponse } from "next/server";

import {
  buildMetaThreadsSetupUrls,
  fetchMetaThreadsConnections,
  hasMetaThreadsOAuthStateSecret,
  resolveMetaThreadsConfig,
  summarizeMetaThreadsConnection,
} from "@/lib/meta-threads";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { summarizeSocialAccountStatus } from "@/lib/social-account-status";
import { resolveMetaOAuthApp } from "@/lib/meta-oauth-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const legacyConfig = resolveMetaThreadsConfig();
  const requestedHandle = (req.nextUrl.searchParams.get("brand") || legacyConfig.brandHandle)
    .replace(/^@+/, "").toLowerCase();
  const config = resolveMetaOAuthApp({
    provider: "meta_threads",
    brandKey: req.nextUrl.searchParams.get("brandKey"),
    brandHandle: requestedHandle,
  });
  const accountId = req.nextUrl.searchParams.get("accountId") || "";
  const { connections, available } = await fetchMetaThreadsConnections(workspaceId);
  const summary = summarizeSocialAccountStatus({
    rows: connections,
    configured: Boolean(config?.configured && hasMetaThreadsOAuthStateSecret()),
    available,
    selector: accountId
      ? (row) => row.account_key === accountId
      : (row) => row.config?.brandHandle === requestedHandle,
    summarize: summarizeMetaThreadsConnection,
  });

  return NextResponse.json({
    status: summary.status,
    provider: "meta_threads",
    workspaceId: workspaceId || null,
    brandHandle: requestedHandle,
    configured: Boolean(config?.configured),
    appKey: config?.appKey || null,
    hasAppId: Boolean(config?.hasAppId),
    hasAppSecret: Boolean(config?.hasAppSecret),
    hasOAuthStateSecret: hasMetaThreadsOAuthStateSecret(),
    connection: summary.connection,
    connections: summary.connections,
    setup: buildMetaThreadsSetupUrls(origin),
  });
}
