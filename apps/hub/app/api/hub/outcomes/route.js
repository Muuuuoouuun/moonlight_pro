import { NextResponse } from "next/server";

import { getOutcomeStats, getRecentOutcomes } from "@/lib/repositories/outcomes-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 30;
    const play = req.nextUrl.searchParams.get("play") || null;
    const [recent, stats] = await Promise.all([
      getRecentOutcomes({ limit, play }),
      getOutcomeStats({}),
    ]);

    // read 실패는 502 — 원장이 분류한 error를 여기서 preview로 되뭉개면 실패한 기록이
    // "기록 없음"으로 위장된다(8차 안정성 — 19차 원장 수리의 미착지 절반).
    const status = recent.source === "supabase" ? "live" : recent.source === "error" ? "error" : "preview";
    return NextResponse.json(
      { status, recent: recent.outcomes, stats, ...(status === "error" ? { error: recent.error || "outcomes-read-failed", retryable: true } : {}) },
      { status: status === "error" ? 502 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
