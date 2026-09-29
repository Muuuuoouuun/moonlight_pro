import { NextResponse } from "next/server";

import {
  buildYouTubeAuthUrl,
  hasYouTubeOAuthStateSecret,
  resolveYouTubeOAuthConfig,
} from "@/lib/youtube-oauth";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { resolveSocialBrandKey } from "@/lib/social-account-connections";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const target = new URL("/dashboard/settings", origin);
  const config = resolveYouTubeOAuthConfig();
  const workspaceId = resolveDefaultWorkspaceId();
  let brandKey;
  try {
    brandKey = await resolveSocialBrandKey(workspaceId, searchParams.get("brandKey"));
  } catch {
    target.searchParams.set("youtube", "invalid-brand");
    return NextResponse.redirect(target);
  }

  if (!config.configured || !hasYouTubeOAuthStateSecret()) {
    target.searchParams.set("youtube", "missing-config");
    return NextResponse.redirect(target);
  }

  const authUrl = buildYouTubeAuthUrl({
    origin,
    workspaceId,
    expectedChannelId: searchParams.get("channelId") || "",
    brandKey,
    returnPath: searchParams.get("returnPath") || "/dashboard/settings",
  });
  if (!authUrl) {
    target.searchParams.set("youtube", "missing-workspace");
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(authUrl);
}
