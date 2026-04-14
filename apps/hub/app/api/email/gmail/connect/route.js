import { NextResponse } from "next/server";

import {
  buildGoogleGmailAuthUrl,
  getGoogleGmailOAuthNonceCookieName,
  normalizeGoogleGmailReturnPath,
} from "@/lib/google-gmail";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
const GOOGLE_GMAIL_STATE_TTL_SECONDS = 10 * 60;

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = searchParams.get("workspaceId") || resolveDefaultWorkspaceId();
  const mailbox = searchParams.get("mailbox") || "me";
  const returnPath = normalizeGoogleGmailReturnPath(searchParams.get("returnPath"));
  const auth = buildGoogleGmailAuthUrl({
    origin,
    workspaceId,
    mailbox,
    returnPath,
  });

  if (!auth?.authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("gmail", "missing-google-config");
    return NextResponse.redirect(target);
  }

  const response = NextResponse.redirect(auth.authUrl);
  response.cookies.set({
    name: getGoogleGmailOAuthNonceCookieName(),
    value: auth.nonce,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: GOOGLE_GMAIL_STATE_TTL_SECONDS,
  });

  return response;
}
