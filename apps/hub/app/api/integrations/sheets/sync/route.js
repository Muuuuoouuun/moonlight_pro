import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import {
  importSheetToStaging,
  promoteStagedLeads,
  pushLeadsToSheet,
} from "@/lib/repositories/sheets-sync";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["import", "promote", "push", "all"]);

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) {
    return guard;
  }

  const parsed = await readHubWriteJson(req);
  if (parsed.error) {
    return parsed.error;
  }

  const body = parsed.data || {};
  const action = VALID_ACTIONS.has(body.action) ? body.action : "all";
  const importSheet = body.importSheet || body.sheetName || "Leads";
  const pushSheet = body.pushSheet || "Outreach Log";
  const headerMap = body.headerMap && typeof body.headerMap === "object" ? body.headerMap : {};

  const results = {};

  if (action === "import" || action === "all") {
    results.import = await importSheetToStaging({ sheetName: importSheet, headerMap });
  }
  if (action === "promote" || action === "all") {
    results.promote = await promoteStagedLeads({});
  }
  if (action === "push" || action === "all") {
    results.push = await pushLeadsToSheet({ sheetName: pushSheet });
  }

  const ok = Object.values(results).every((r) => r?.ok !== false);
  return NextResponse.json({ status: ok ? "ok" : "partial", action, results });
}
