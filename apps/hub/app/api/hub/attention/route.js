import { NextResponse } from "next/server";

import { getAttentionLedger } from "@/lib/repositories/attention-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getAttentionLedger();
    // 코어(tasks) 레인 read 실패면 집계 자체가 성립하지 않는다 — status:"error" 없이 내리면
    // 내 작업이 "표시할 항목이 없습니다"(check 아이콘)로 위장된다(7차 안정성 M). 보강 레인
    // (딜·캘린더) 실패는 per-lane sources로 이미 표시되므로 ok 유지. HTTP는 항상 200 —
    // daily-brief와 같은 계약(5xx는 공유 캐시·인프라가 장애로 오판).
    const coreFailed = ledger?.sources?.tasks === "error";
    return NextResponse.json({ status: coreFailed ? "error" : "ok", ...ledger });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
