import { getReviewWaitingLedger } from "@/lib/repositories/review-waiting.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 미들웨어(route-access.js)가 유일한 방어선이다 — 이 경로는 OPEN_PREFIXES에 없으므로
// 기본이 "막힘"이고 운영자 세션 또는 서버 간 COM_MOON_HUB_WRITE_SECRET만 통과한다.
export async function GET() {
  try {
    const ledger = await getReviewWaitingLedger();
    const status = ledger.source === "error" ? "error" : ledger.source === "preview" ? "preview" : "live";
    return Response.json(
      {
        status,
        source: ledger.source,
        configured: ledger.configured,
        partial: Boolean(ledger.partial),
        ...(ledger.error ? { error: ledger.error } : {}),
        items: ledger.items,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { status: "error", source: "error", error: "review-waiting-unexpected-error", items: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
