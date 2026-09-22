import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { scanStalledDeals } from "@/lib/sales-os/stalled-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — dry-run: which stalled deals WOULD get a follow-up proposal. Read-only.
export async function GET() {
  try {
    const result = await scanStalledDeals({ dryRun: true });
    // 라이브러리의 ok/preview/error 어휘를 라우트 경계에서만 허브 read 계약 어휘로 옮긴다.
    // 전개가 뒤에 오면 result.status가 매핑을 덮어써 live가 한 번도 나가지 않는다.
    return NextResponse.json(
      { ...result, status: result.status === "ok" ? "live" : result.status },
      { status: 200 },
    );
  } catch (error) {
    // Hub read failure envelope: HTTP 200 + status "error" (CLAUDE.md, 2026-09-01).
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
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
