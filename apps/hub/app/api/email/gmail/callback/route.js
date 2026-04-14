import { NextResponse } from "next/server";

import {
  decodeGoogleGmailState,
  exchangeGoogleGmailCode,
  recordGoogleGmailSync,
  getGoogleGmailOAuthNonceCookieName,
  normalizeGoogleGmailReturnPath,
  resolveGoogleGmailRedirectUri,
  saveGoogleGmailConnection,
} from "@/lib/google-gmail";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const nonceCookieName = getGoogleGmailOAuthNonceCookieName();
  const nonceCookie = req.cookies.get(nonceCookieName)?.value || null;
  const state = decodeGoogleGmailState(searchParams.get("state"), nonceCookie);
  const workspaceId = state?.workspaceId || resolveDefaultWorkspaceId();
  const mailbox = state?.mailbox || "me";
  const returnPath = normalizeGoogleGmailReturnPath(
    state?.returnPath,
    "/dashboard/automations/email",
  );
  const target = new URL(returnPath, origin);

  const redirect = () => {
    const response = NextResponse.redirect(target);
    response.cookies.set({
      name: nonceCookieName,
      value: "",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
    return response;
  };

  if (!state) {
    await recordGoogleGmailSync({
      workspaceId,
      status: "failure",
      payload: {
        action: "oauth_callback",
        mailbox,
      },
      errorMessage: "invalid-oauth-state",
    });
    target.searchParams.set("gmail", "connect-failed");
    return redirect();
  }

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
    return redirect();
  }

  if (!code) {
    target.searchParams.set("gmail", "missing-code");
    return redirect();
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
    return redirect();
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
    return redirect();
  }
}
