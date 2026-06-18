import { NextResponse } from "next/server";

import {
  decodeMetaThreadsState,
  exchangeMetaThreadsCode,
  exchangeMetaThreadsLongLivedToken,
  fetchMetaThreadsProfile,
  isExpectedMetaThreadsProfile,
  recordMetaThreadsSync,
  resolveMetaThreadsRedirectUri,
  saveMetaThreadsConnection,
} from "@/lib/meta-threads";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = decodeMetaThreadsState(searchParams.get("state"));
  const fallbackReturnPath = "/dashboard/settings";

  if (state.invalid) {
    const target = new URL(fallbackReturnPath, origin);
    target.searchParams.set("metaThreads", "invalid-state");
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
    await recordMetaThreadsSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "oauth_callback",
        brandHandle,
      },
      errorMessage: error,
    });
    target.searchParams.set("metaThreads", "oauth-denied");
    return NextResponse.redirect(target);
  }

  if (!code) {
    target.searchParams.set("metaThreads", "missing-code");
    return NextResponse.redirect(target);
  }

  try {
    const tokenData = await exchangeMetaThreadsCode({
      code,
      redirectUri: resolveMetaThreadsRedirectUri(origin),
    });
    const longLivedTokenData = await exchangeMetaThreadsLongLivedToken(
      tokenData?.access_token,
    );
    const accessToken = longLivedTokenData?.access_token || tokenData?.access_token;
    const profile = await fetchMetaThreadsProfile(accessToken);
    const profileMatch = isExpectedMetaThreadsProfile(profile, brandHandle);

    if (profileMatch === false) {
      await recordMetaThreadsSync({
        workspaceId,
        status: "failure",
        payload: {
          action: "oauth_connect",
          brandHandle,
          username: profile?.username || null,
          result: "account-mismatch",
        },
        errorMessage: `Authorized Threads account does not match @${brandHandle}.`,
      });
      target.searchParams.set("metaThreads", "account-mismatch");
      return NextResponse.redirect(target);
    }

    const saved = await saveMetaThreadsConnection({
      workspaceId,
      brandHandle,
      tokenData,
      longLivedTokenData,
      profile,
    });

    await recordMetaThreadsSync({
      workspaceId,
      connectionId: saved.connectionId,
      status: "success",
      payload: {
        action: "oauth_connect",
        brandHandle,
        username: saved.config.username || null,
        userId: saved.config.userId || null,
        profileVerified: profileMatch,
      },
    });

    target.searchParams.set("metaThreads", "connected");
    return NextResponse.redirect(target);
  } catch (callbackError) {
    await recordMetaThreadsSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "oauth_connect",
        brandHandle,
      },
      errorMessage:
        callbackError instanceof Error ? callbackError.message : String(callbackError),
    });
    target.searchParams.set("metaThreads", "connect-failed");
    return NextResponse.redirect(target);
  }
}
