import { NextResponse } from "next/server";

import {
  decodeGoogleCalendarState,
  exchangeGoogleCalendarCode,
  recordGoogleCalendarSync,
  resolveGoogleCalendarRedirectUri,
  saveGoogleCalendarConnection,
} from "@/lib/google-calendar";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = decodeGoogleCalendarState(searchParams.get("state"));
  const workspaceId = state.workspaceId || resolveDefaultWorkspaceId();
  const calendarId = state.calendarId || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const returnPath = state.returnPath || "/dashboard/work/calendar";
  const target = new URL(returnPath, origin);

  if (error) {
    await recordGoogleCalendarSync({
      workspaceId,
      status: "failure",
      payload: {
        provider: "google_calendar",
        action: "oauth_callback",
      },
      errorMessage: error,
    });
    target.searchParams.set("calendar", "oauth-denied");
    return NextResponse.redirect(target);
  }

  if (!code) {
    target.searchParams.set("calendar", "missing-code");
    return NextResponse.redirect(target);
  }

  try {
    const tokenData = await exchangeGoogleCalendarCode({
      code,
      redirectUri: resolveGoogleCalendarRedirectUri(origin),
    });
    const saved = await saveGoogleCalendarConnection({
      workspaceId,
      calendarId,
      tokenData,
    });

    await recordGoogleCalendarSync({
      workspaceId,
      connectionId: saved.connectionId,
      status: "success",
      payload: {
        provider: "google_calendar",
        action: "oauth_connect",
        calendarId,
      },
    });

    target.searchParams.set("calendar", "connected");
    return NextResponse.redirect(target);
  } catch (callbackError) {
    await recordGoogleCalendarSync({
      workspaceId,
      status: "failure",
      payload: {
        provider: "google_calendar",
        action: "oauth_connect",
        calendarId,
      },
      errorMessage: callbackError instanceof Error ? callbackError.message : String(callbackError),
    });
    target.searchParams.set("calendar", "connect-failed");
    return NextResponse.redirect(target);
  }
}
