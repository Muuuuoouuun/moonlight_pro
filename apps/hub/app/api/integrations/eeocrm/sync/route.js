import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import {
  importEeocrmLeadsToStaging,
} from "@/lib/repositories/eeocrm-sync";
import { promoteStagedLeads } from "@/lib/repositories/sheets-sync";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["import", "promote", "all"]);

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

  const results = {};

  if (action === "import" || action === "all") {
    results.import = await importEeocrmLeadsToStaging({});
  }
  if (action === "promote" || action === "all") {
    results.promote = await promoteStagedLeads({ provider: "eeocrm" });
  }

  const ok = Object.values(results).every((r) => r?.ok !== false);
  return NextResponse.json({ status: ok ? "ok" : "partial", action, results });
}
