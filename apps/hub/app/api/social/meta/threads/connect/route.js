import { NextResponse } from "next/server";

import {
  buildMetaThreadsAuthUrl,
  hasMetaThreadsOAuthStateSecret,
  resolveMetaThreadsConfig,
} from "@/lib/meta-threads";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveMetaThreadsConfig();
  const brandHandle = searchParams.get("brand") || config.brandHandle;
  const returnPath = searchParams.get("returnPath") || "/dashboard/settings";

  if (!hasMetaThreadsOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const authUrl = buildMetaThreadsAuthUrl({
    origin,
    workspaceId,
    brandHandle,
    returnPath,
  });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "missing-meta-config");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
