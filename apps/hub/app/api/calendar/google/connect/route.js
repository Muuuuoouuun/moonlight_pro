import { NextResponse } from "next/server";

import {
  buildGoogleCalendarAuthUrl,
  getGoogleCalendarOAuthNonceCookieName,
  normalizeGoogleCalendarReturnPath,
} from "@/lib/google-calendar";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
const GOOGLE_CALENDAR_STATE_TTL_SECONDS = 10 * 60;

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = searchParams.get("workspaceId") || resolveDefaultWorkspaceId();
  const calendarId = searchParams.get("calendarId") || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const returnPath = normalizeGoogleCalendarReturnPath(searchParams.get("returnPath"));
  const auth = buildGoogleCalendarAuthUrl({
    origin,
    workspaceId,
    calendarId,
    returnPath,
  });

  if (!auth?.authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("calendar", "missing-google-config");
    return NextResponse.redirect(target);
  }

  const response = NextResponse.redirect(auth.authUrl);
  response.cookies.set({
    name: getGoogleCalendarOAuthNonceCookieName(),
    value: auth.nonce,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: GOOGLE_CALENDAR_STATE_TTL_SECONDS,
  });

  return response;
}
