import { NextResponse } from "next/server";

import {
  decodeGoogleSheetsState,
  exchangeGoogleSheetsCode,
  recordGoogleSheetsSync,
  resolveGoogleSheetsRedirectUri,
  saveGoogleSheetsConnection,
} from "@/lib/google-sheets";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

const FALLBACK_RETURN_PATH = "/dashboard/automations/integrations";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = decodeGoogleSheetsState(searchParams.get("state"));

  if (state.invalid) {
    const target = new URL(FALLBACK_RETURN_PATH, origin);
    target.searchParams.set("sheets", "invalid-state");
    return NextResponse.redirect(target);
  }

  const workspaceId = state.workspaceId || resolveDefaultWorkspaceId();
  const spreadsheetId = state.spreadsheetId || "";
  const returnPath =
    typeof state.returnPath === "string" &&
    state.returnPath.startsWith("/") &&
    !state.returnPath.startsWith("//")
      ? state.returnPath
      : FALLBACK_RETURN_PATH;
  const target = new URL(returnPath, origin);

  if (error) {
    await recordGoogleSheetsSync({
      workspaceId,
      status: "failure",
      payload: { action: "oauth_callback" },
      errorMessage: error,
    });
    target.searchParams.set("sheets", "oauth-denied");
    return NextResponse.redirect(target);
  }

  if (!code) {
    target.searchParams.set("sheets", "missing-code");
    return NextResponse.redirect(target);
  }

  try {
    const tokenData = await exchangeGoogleSheetsCode({
      code,
      redirectUri: resolveGoogleSheetsRedirectUri(origin),
    });
    const saved = await saveGoogleSheetsConnection({ workspaceId, spreadsheetId, tokenData });

    await recordGoogleSheetsSync({
      workspaceId,
      connectionId: saved.connectionId,
      status: "success",
      payload: { action: "oauth_connect", email: saved.config.email || null },
    });

    target.searchParams.set("sheets", "connected");
    return NextResponse.redirect(target);
  } catch (callbackError) {
    await recordGoogleSheetsSync({
      workspaceId,
      status: "failure",
      payload: { action: "oauth_connect" },
      errorMessage:
        callbackError instanceof Error ? callbackError.message : String(callbackError),
    });
    target.searchParams.set("sheets", "connect-failed");
    return NextResponse.redirect(target);
  }
}
