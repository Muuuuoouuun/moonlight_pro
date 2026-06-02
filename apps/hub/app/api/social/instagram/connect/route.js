import { NextResponse } from "next/server";

import {
  buildInstagramApiAuthUrl,
  hasInstagramApiOAuthStateSecret,
  resolveInstagramApiConfig,
} from "@/lib/instagram-api";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const config = resolveInstagramApiConfig();
  const brandHandle = searchParams.get("brand") || config.brandHandle;
  const returnPath = searchParams.get("returnPath") || "/dashboard/settings";

  if (!hasInstagramApiOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("instagram", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const authUrl = buildInstagramApiAuthUrl({
    origin,
    workspaceId,
    brandHandle,
    returnPath,
  });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("instagram", "missing-instagram-config");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
