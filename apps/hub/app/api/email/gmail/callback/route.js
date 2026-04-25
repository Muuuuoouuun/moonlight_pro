import { NextResponse } from "next/server";

import {
  decodeGoogleGmailState,
  exchangeGoogleGmailCode,
  recordGoogleGmailSync,
  resolveGoogleGmailRedirectUri,
  saveGoogleGmailConnection,
} from "@/lib/google-gmail";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = decodeGoogleGmailState(searchParams.get("state"));
  const fallbackReturnPath = "/dashboard/automations/email";

  if (state.invalid) {
    const target = new URL(fallbackReturnPath, origin);
    target.searchParams.set("gmail", "invalid-state");
    return NextResponse.redirect(target);
  }

  const workspaceId = state.workspaceId || resolveDefaultWorkspaceId();
  const mailbox = state.mailbox || "me";
  const returnPath =
    typeof state.returnPath === "string" &&
    state.returnPath.startsWith("/") &&
    !state.returnPath.startsWith("//")
      ? state.returnPath
      : fallbackReturnPath;
  const target = new URL(returnPath, origin);

  if (error) {
    await recordGoogleGmailSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "oauth_callback",
      },
      errorMessage: error,
    });
    target.searchParams.set("gmail", "oauth-denied");
    return NextResponse.redirect(target);
  }

  if (!code) {
    target.searchParams.set("gmail", "missing-code");
    return NextResponse.redirect(target);
  }

  try {
    const tokenData = await exchangeGoogleGmailCode({
      code,
      redirectUri: resolveGoogleGmailRedirectUri(origin),
    });
    const saved = await saveGoogleGmailConnection({
      workspaceId,
      mailbox,
      tokenData,
    });

    await recordGoogleGmailSync({
      workspaceId,
      connectionId: saved.connectionId,
      status: "success",
      payload: {
        action: "oauth_connect",
        mailbox,
        email: saved.config.email || null,
      },
    });

    target.searchParams.set("gmail", "connected");
    return NextResponse.redirect(target);
  } catch (callbackError) {
    await recordGoogleGmailSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "oauth_connect",
        mailbox,
      },
      errorMessage:
        callbackError instanceof Error ? callbackError.message : String(callbackError),
    });
    target.searchParams.set("gmail", "connect-failed");
    return NextResponse.redirect(target);
  }
}
