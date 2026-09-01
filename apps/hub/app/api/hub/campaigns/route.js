import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getCampaigns, saveCampaign } from "@/lib/repositories/campaigns-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only, like GET /api/hub/revenue and /api/hub/revenue/activity — no write guard.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = Number.parseInt(searchParams.get("limit") || "", 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;

    const result = await getCampaigns({ limit });
    // read 실패는 status:"error" 봉투로 알린다(HTTP 200, daily-brief 계약) — 200/preview로
    // 내리면 캠페인 0건이 사실처럼 보이므로 status 값은 error를 유지한다(Phase 0).
    const status = result.source === "supabase" ? "live" : result.source === "error" ? "error" : "preview";
    return NextResponse.json({ status, ...result });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Create / update / delete a campaign. Write-guarded like the other Revenue POST routes.
export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const payload = parsed.data || {};
    const op = payload.op === "create" ? "create" : payload.op === "delete" ? "delete" : "update";

    const result = await saveCampaign({ op, id: payload.id, payload });

    // failed(라이브 거부) 202는 "저장 대기"로 오독된다 — Phase 0: preview 202 / failed 502 / error 400.
    const httpStatus = result.status === "saved" ? 200
      : result.status === "error" ? 400
      : result.status === "failed" ? 502
      : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
