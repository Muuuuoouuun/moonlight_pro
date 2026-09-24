import { NextResponse } from "next/server";

import {
  decodeYouTubeState,
  exchangeYouTubeCode,
  fetchAuthenticatedYouTubeChannel,
  isExpectedYouTubeChannel,
  resolveYouTubeRedirectUri,
  saveYouTubeConnection,
} from "@/lib/youtube-oauth";
import { assertPersistedSocialConnection } from "@/lib/social-oauth-persistence";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const state = decodeYouTubeState(searchParams.get("state"));
  const fallback = new URL("/dashboard/settings", origin);
  if (state.invalid) {
    fallback.searchParams.set("youtube", "invalid-state");
    return NextResponse.redirect(fallback);
  }

  const returnPath = typeof state.returnPath === "string" &&
    state.returnPath.startsWith("/") && !state.returnPath.startsWith("//") &&
    !state.returnPath.includes("\\")
    ? state.returnPath
    : "/dashboard/settings";
  const target = new URL(returnPath, origin);
  if (searchParams.has("error")) {
    target.searchParams.set("youtube", "oauth-denied");
    return NextResponse.redirect(target);
  }
  const code = searchParams.get("code");
  if (!code) {
    target.searchParams.set("youtube", "missing-code");
    return NextResponse.redirect(target);
  }

  try {
    const token = await exchangeYouTubeCode({
      code,
      redirectUri: resolveYouTubeRedirectUri(origin),
    });
    const channel = await fetchAuthenticatedYouTubeChannel(token.access_token);
    if (!isExpectedYouTubeChannel(channel, state.expectedChannelId)) {
      target.searchParams.set("youtube", "channel-mismatch");
      return NextResponse.redirect(target);
    }
    assertPersistedSocialConnection(await saveYouTubeConnection({
      workspaceId: state.workspaceId,
      token,
      channel,
    }));
    target.searchParams.set("youtube", "connected");
  } catch (error) {
    const known = new Set([
      "youtube-existing-channel-mismatch",
      "youtube-offline-grant-missing",
      "youtube-required-scope-missing",
      "youtube-channel-not-found",
    ]);
    target.searchParams.set("youtube", known.has(error?.message) ? error.message : "connect-failed");
  }
  return NextResponse.redirect(target);
}
