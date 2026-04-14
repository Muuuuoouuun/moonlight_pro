import { NextResponse } from "next/server";

import {
  decodeGoogleCalendarState,
  exchangeGoogleCalendarCode,
  recordGoogleCalendarSync,
  getGoogleCalendarOAuthNonceCookieName,
  normalizeGoogleCalendarReturnPath,
  resolveGoogleCalendarRedirectUri,
  saveGoogleCalendarConnection,
} from "@/lib/google-calendar";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const nonceCookieName = getGoogleCalendarOAuthNonceCookieName();
  const nonceCookie = req.cookies.get(nonceCookieName)?.value || null;
  const state = decodeGoogleCalendarState(searchParams.get("state"), nonceCookie);
  const workspaceId = state?.workspaceId || resolveDefaultWorkspaceId();
  const calendarId = state?.calendarId || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const returnPath = normalizeGoogleCalendarReturnPath(
    state?.returnPath,
    "/dashboard/work/calendar",
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
    await recordGoogleCalendarSync({
      workspaceId,
      status: "failure",
      payload: {
        provider: "google_calendar",
        action: "oauth_callback",
      },
      errorMessage: "invalid-oauth-state",
    });
    target.searchParams.set("calendar", "connect-failed");
    return redirect();
  }

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
    return redirect();
  }

  if (!code) {
    target.searchParams.set("calendar", "missing-code");
    return redirect();
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
    return redirect();
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
    return redirect();
  }
}
