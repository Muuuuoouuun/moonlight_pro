import { NextResponse } from "next/server";

import { getAttentionLedger } from "@/lib/repositories/attention-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getAttentionLedger();
    // 코어(tasks) 레인 read 실패면 집계 자체가 성립하지 않는다 — 200/ok로 내리면 내 작업이
    // "표시할 항목이 없습니다"(check 아이콘)로 위장된다(7차 안정성 M). 보강 레인(딜·캘린더)
    // 실패는 per-lane sources로 이미 표시되므로 200 유지.
    const coreFailed = ledger?.sources?.tasks === "error";
    return NextResponse.json(
      { status: coreFailed ? "error" : "ok", ...ledger },
      { status: coreFailed ? 502 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
