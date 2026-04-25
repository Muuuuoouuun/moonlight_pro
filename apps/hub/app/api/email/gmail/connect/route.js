import { NextResponse } from "next/server";

import {
  buildGoogleGmailAuthUrl,
  hasGoogleGmailOAuthStateSecret,
} from "@/lib/google-gmail";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const mailbox = searchParams.get("mailbox") || "me";
  const returnPath = searchParams.get("returnPath") || "/dashboard/automations/email";

  if (!hasGoogleGmailOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("gmail", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const authUrl = buildGoogleGmailAuthUrl({
    origin,
    workspaceId,
    mailbox,
    returnPath,
  });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("gmail", "missing-google-config");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
