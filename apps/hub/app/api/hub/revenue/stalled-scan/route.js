import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { scanStalledDeals } from "@/lib/sales-os/stalled-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — dry-run: which stalled deals WOULD get a follow-up proposal. Read-only.
export async function GET() {
  try {
    const result = await scanStalledDeals({ dryRun: true });
    return NextResponse.json(
      { status: result.status === "ok" ? "live" : "preview", ...result },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// POST — run the scan for real: proposes follow-up work_orders for stalled deals.
// Idempotent (dedupes on open followup per deal), so cron/manual re-runs are safe.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const result = await scanStalledDeals();
    const httpStatus = result.status === "ok" ? 200 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
