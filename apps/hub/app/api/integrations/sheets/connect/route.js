import { NextResponse } from "next/server";

import {
  buildGoogleSheetsAuthUrl,
  hasGoogleSheetsOAuthStateSecret,
} from "@/lib/google-sheets";
import { resolvePersonalLeadsSpreadsheetId } from "@/lib/sales-os/operator-scope";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

const RETURN_PATH = "/dashboard/automations/integrations";

export async function GET(req) {
  const { searchParams, origin } = req.nextUrl;
  const workspaceId = resolveDefaultWorkspaceId();
  const spreadsheetId =
    searchParams.get("spreadsheetId") ||
    resolvePersonalLeadsSpreadsheetId() ||
    "";
  const returnPath = searchParams.get("returnPath") || RETURN_PATH;

  if (!hasGoogleSheetsOAuthStateSecret()) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("sheets", "missing-oauth-state-secret");
    return NextResponse.redirect(target);
  }

  const authUrl = buildGoogleSheetsAuthUrl({ origin, workspaceId, spreadsheetId, returnPath });

  if (!authUrl) {
    const target = new URL(returnPath, origin);
    target.searchParams.set("sheets", "missing-google-config");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(authUrl);
}
