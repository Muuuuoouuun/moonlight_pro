import { NextResponse } from "next/server";

import {
  decodeInstagramApiState,
  exchangeInstagramApiCode,
  exchangeInstagramApiLongLivedToken,
  fetchInstagramApiProfile,
  isExpectedInstagramApiProfile,
  recordInstagramApiSync,
  resolveInstagramApiRedirectUri,
  saveInstagramApiConnection,
} from "@/lib/instagram-api";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

function cleanInstagramCode(value) {
  return typeof value === "string" ? value.split("#")[0].trim() : "";
}

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const code = cleanInstagramCode(searchParams.get("code"));
  const error = searchParams.get("error");
  const state = decodeInstagramApiState(searchParams.get("state"));
  const fallbackReturnPath = "/dashboard/settings";

  if (state.invalid) {
    const target = new URL(fallbackReturnPath, origin);
    target.searchParams.set("instagram", "invalid-state");
    return NextResponse.redirect(target);
  }

  const workspaceId = state.workspaceId || resolveDefaultWorkspaceId();
  const brandHandle = state.brandHandle || "moon.classin";
  const returnPath =
    typeof state.returnPath === "string" &&
    state.returnPath.startsWith("/") &&
    !state.returnPath.startsWith("//")
      ? state.returnPath
      : fallbackReturnPath;
  const target = new URL(returnPath, origin);

  if (error) {
    await recordInstagramApiSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "oauth_callback",
        brandHandle,
      },
      errorMessage: error,
    });
    target.searchParams.set("instagram", "oauth-denied");
    return NextResponse.redirect(target);
  }

  if (!code) {
    target.searchParams.set("instagram", "missing-code");
    return NextResponse.redirect(target);
  }

  try {
    const tokenData = await exchangeInstagramApiCode({
      code,
      redirectUri: resolveInstagramApiRedirectUri(origin),
    });
    const longLivedTokenData = await exchangeInstagramApiLongLivedToken(
      tokenData?.access_token,
    );
    const accessToken = longLivedTokenData?.access_token || tokenData?.access_token;
    const profile = await fetchInstagramApiProfile(accessToken);
    const profileMatch = isExpectedInstagramApiProfile(profile, brandHandle);
    const saved = await saveInstagramApiConnection({
      workspaceId,
      brandHandle,
      tokenData,
      longLivedTokenData,
      profile,
    });

    await recordInstagramApiSync({
      workspaceId,
      connectionId: saved.connectionId,
      status: "success",
      payload: {
        action: "oauth_connect",
        brandHandle,
        username: saved.config.username || null,
        userId: saved.config.userId || null,
        accountType: saved.config.accountType || null,
        profileVerified: profileMatch,
      },
    });

    target.searchParams.set("instagram", profileMatch === false ? "connected-mismatch" : "connected");
    return NextResponse.redirect(target);
  } catch (callbackError) {
    await recordInstagramApiSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "oauth_connect",
        brandHandle,
      },
      errorMessage:
        callbackError instanceof Error ? callbackError.message : String(callbackError),
    });
    target.searchParams.set("instagram", "connect-failed");
    return NextResponse.redirect(target);
  }
}
