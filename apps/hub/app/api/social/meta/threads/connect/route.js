import { NextResponse } from "next/server";

import {
  buildMetaThreadsAuthUrl,
  hasMetaThreadsOAuthStateSecret,
  resolveMetaThreadsConfig,
} from "@/lib/meta-threads";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { resolveSocialBrandKey } from "@/lib/social-account-connections";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveMetaThreadsConfig();
  const brandHandle = searchParams.get("brand") || config.brandHandle;
  const requestedReturnPath = searchParams.get("returnPath") || "";
  const returnPath = requestedReturnPath.startsWith("/") &&
    !requestedReturnPath.startsWith("//") && !requestedReturnPath.includes("\\")
    ? requestedReturnPath : "/dashboard/settings";
  let brandKey;
  try {
    brandKey = await resolveSocialBrandKey(workspaceId, searchParams.get("brandKey"));
  } catch {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "invalid-brand");
    return NextResponse.redirect(target);
  }

  if (!hasMetaThreadsOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const authUrl = buildMetaThreadsAuthUrl({
    origin,
    workspaceId,
    brandHandle,
    brandKey,
    returnPath,
  });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("metaThreads", "missing-meta-config");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
