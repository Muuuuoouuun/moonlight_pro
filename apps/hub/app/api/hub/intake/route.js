import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import {
  listStagedIntake,
  rejectStagedIntake,
  updateStagedIntake,
} from "@/lib/repositories/intake-inbox";
import { promoteStagedLeads } from "@/lib/repositories/sheets-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read staged lead_intake_raw rows for the Intake Inbox page. No write guard —
// read-only, like GET /api/hub/revenue/activity.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const source = searchParams.get("source");

    const result = await listStagedIntake({ status, source });
    return NextResponse.json({
      status: result.source === "supabase" ? "live" : "preview",
      rows: result.rows,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// Promote / reject / update one staged row. Write-guarded like the other Hub
// write routes. Promotion reuses promoteStagedLeads — never reimplemented here.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const payload = parsed.data || {};
    const op = payload.op === "promote" ? "promote" : payload.op === "reject" ? "reject" : payload.op === "update" ? "update" : null;

    if (!op || !payload.id) {
      return NextResponse.json({ status: "error", reason: "missing-op-or-id" }, { status: 400 });
    }

    let result;
    if (op === "promote") {
      const res = await promoteStagedLeads({ intakeIds: [payload.id] });
      result = res.ok
        ? { status: "saved", result: res }
        : { status: res.reason === "read-failed" ? "error" : "preview", reason: res.reason };
    } else if (op === "reject") {
      const res = await rejectStagedIntake({ id: payload.id, note: payload.note });
      result = res.persisted
        ? { status: "saved", row: res.row }
        : { status: res.reason === "missing-id" ? "error" : "preview", reason: res.reason, detail: res.detail };
    } else {
      const res = await updateStagedIntake({ id: payload.id, normalized: payload.normalized || {} });
      result = res.persisted
        ? { status: "saved", row: res.row }
        : { status: res.reason === "missing-id" ? "error" : "preview", reason: res.reason, detail: res.detail };
    }

    const httpStatus = result.status === "saved" ? 200 : result.status === "error" ? 400 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
