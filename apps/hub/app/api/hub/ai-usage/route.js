import { readAiUsage } from "@/lib/repositories/ai-usage-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 설정 화면의 AI 사용량 — 이번 달·지난달 모델별 호출 수·토큰·추정 비용(Moonlight가 부른 호출만).
// Hub read 봉투: 실패도 HTTP 200 + status:'error' (CLAUDE.md 2026-09-01). 인증은 미들웨어 기본 게이트(세션 필요).
export async function GET() {
  try {
    return Response.json(await readAiUsage(), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "error", source: "error", error: "ai-usage-read-failed" }, { headers: { "cache-control": "no-store" } });
  }
}
