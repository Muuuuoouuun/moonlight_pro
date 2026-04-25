import { NextResponse } from "next/server";

import {
  buildGoogleCalendarAuthUrl,
  hasGoogleCalendarOAuthStateSecret,
} from "@/lib/google-calendar";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const calendarId = searchParams.get("calendarId") || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const returnPath = searchParams.get("returnPath") || "/dashboard/work/calendar";

  if (!hasGoogleCalendarOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("calendar", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const authUrl = buildGoogleCalendarAuthUrl({
    origin,
    workspaceId,
    calendarId,
    returnPath,
  });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("calendar", "missing-google-config");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
