import { NextResponse } from "next/server";

import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getRevenueLedger();

    if (ledger.source === "error") {
      // read 실패는 status:"error" 봉투로 알린다(HTTP 200, daily-brief 계약) — 5xx로 내리면
      // 공유 캐시·인프라가 이 라우트를 장애로 오판해 소비자가 재시도 신호를 놓친다.
      return NextResponse.json({ status: "error", ...ledger });
    }

    return NextResponse.json({
      status: ledger.source === "supabase"
        ? ledger.partial ? "partial" : "live"
        : "preview",
      ...ledger,
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
