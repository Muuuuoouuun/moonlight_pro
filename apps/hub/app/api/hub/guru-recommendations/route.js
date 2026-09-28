import { NextResponse } from "next/server";

import { getGuruRecommendations } from "@/lib/repositories/guru-recommendations-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — 기록 기반 Guru 추천(agent-layer-direction §2.1 ⑦). 읽기 전용이며 모델을 부르지 않는다.
// 읽기 실패는 5xx가 아니라 HTTP 200 + status:"error" 봉투다(CLAUDE.md 허브 read 계약) —
// 소비자는 d.status를 읽어야 하고, !r.ok만 보면 읽기 실패가 "추천 없음"으로 위장된다.
//   ?subject=<lead|deal|account id>  한 레코드의 추천만
//   ?severity=act                    목록 표면(오늘·홈)이 쓰는 "지금 할 것"만
export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const subjectId = (params.get("subject") || "").trim() || null;
    const severity = params.get("severity") === "act" ? "act" : null;
    const data = await getGuruRecommendations({ subjectId, severity });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      status: "error",
      failedSources: ["guru-recommendations"],
      recommendations: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
