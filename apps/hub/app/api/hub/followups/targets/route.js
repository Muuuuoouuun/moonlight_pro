import { NextResponse } from "next/server";

import { searchContactTargets } from "@/lib/repositories/followups-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?q= — 기록창의 고객 고르기(오늘 연락 "＋ 연락 기록"). 허브 read 계약: 읽기 실패도
// HTTP 200 + status:"error"다 — 소비자가 !r.ok만 보면 실패가 "찾는 고객 없음"으로 위장된다.
export async function GET(req) {
  try {
    const q = req.nextUrl.searchParams.get("q") || "";
    const data = await searchContactTargets({ q });
    if (data.source === "error") {
      return NextResponse.json({ status: "error", ...data });
    }
    return NextResponse.json({
      status: data.source === "supabase" ? (data.partial ? "partial" : "live") : "preview",
      ...data,
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      targets: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
