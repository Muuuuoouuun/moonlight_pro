import { NextResponse } from "next/server";

import {
  buildMetaThreadsSetupUrls,
  fetchLatestMetaThreadsConnection,
  hasMetaThreadsOAuthStateSecret,
  resolveMetaThreadsConfig,
  summarizeMetaThreadsConnection,
} from "@/lib/meta-threads";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveMetaThreadsConfig();
  const connection = workspaceId
    ? await fetchLatestMetaThreadsConnection(workspaceId)
    : null;
  const connected = connection?.status === "connected";

  return NextResponse.json({
    status: connected
      ? "connected"
      : config.configured && hasMetaThreadsOAuthStateSecret()
        ? "ready"
        : "missing-config",
    provider: "meta_threads",
    workspaceId: workspaceId || null,
    brandHandle: config.brandHandle,
    configured: config.configured,
    hasAppId: config.hasAppId,
    hasAppSecret: config.hasAppSecret,
    hasOAuthStateSecret: hasMetaThreadsOAuthStateSecret(),
    connection: connection ? summarizeMetaThreadsConnection(connection) : null,
    setup: buildMetaThreadsSetupUrls(origin),
  });
}
