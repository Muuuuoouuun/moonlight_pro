import { NextResponse } from "next/server";

import {
  buildYouTubeAuthUrl,
  hasYouTubeOAuthStateSecret,
  resolveYouTubeOAuthConfig,
} from "@/lib/youtube-oauth";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const target = new URL("/dashboard/settings", origin);
  const config = resolveYouTubeOAuthConfig();

  if (!config.configured || !hasYouTubeOAuthStateSecret()) {
    target.searchParams.set("youtube", "missing-config");
    return NextResponse.redirect(target);
  }

  const authUrl = buildYouTubeAuthUrl({
    origin,
    workspaceId: resolveDefaultWorkspaceId(),
    expectedChannelId: searchParams.get("channelId") || "",
    returnPath: searchParams.get("returnPath") || "/dashboard/settings",
  });
  if (!authUrl) {
    target.searchParams.set("youtube", "missing-workspace");
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(authUrl);
}
