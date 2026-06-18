import { NextResponse } from "next/server";

import {
  buildInstagramApiSetupUrls,
  fetchLatestInstagramApiConnection,
  hasInstagramApiOAuthStateSecret,
  resolveInstagramApiConfig,
  summarizeInstagramApiConnection,
} from "@/lib/instagram-api";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveInstagramApiConfig();
  const connection = workspaceId
    ? await fetchLatestInstagramApiConnection(workspaceId)
    : null;
  const connected = connection?.status === "connected";

  return NextResponse.json({
    status: connected
      ? "connected"
      : config.configured && hasInstagramApiOAuthStateSecret()
        ? "ready"
        : "missing-config",
    provider: "instagram_api",
    workspaceId: workspaceId || null,
    brandHandle: config.brandHandle,
    configured: config.configured,
    hasAppId: config.hasAppId,
    hasAppSecret: config.hasAppSecret,
    hasOAuthStateSecret: hasInstagramApiOAuthStateSecret(),
    scopes: config.scopes,
    connection: connection ? summarizeInstagramApiConnection(connection) : null,
    setup: buildInstagramApiSetupUrls(origin),
  });
}
