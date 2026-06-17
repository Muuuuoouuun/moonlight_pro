import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import {
  importSheetToStaging,
  promoteStagedLeads,
  pushLeadsToSheet,
} from "@/lib/repositories/sheets-sync";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["import", "promote", "push", "all"]);

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a || ""));
  const bBuffer = Buffer.from(String(b || ""));
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function authorize(req) {
  const secret = process.env.COM_MOON_HUB_WRITE_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 503, reason: "write-secret-not-configured" };
  }
  const provided = req.headers.get("x-com-moon-hub-write-secret") || "";
  if (!safeEqual(provided, secret)) {
    return { ok: false, status: 401, reason: "unauthorized" };
  }
  return { ok: true };
}

export async function POST(req) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ status: "error", reason: auth.reason }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
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
