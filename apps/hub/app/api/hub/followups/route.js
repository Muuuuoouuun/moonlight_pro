import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { annotateContactActivity, rescheduleFollowup } from "@/lib/repositories/followups-actions";
import { getFollowups, recomputeLeadScores } from "@/lib/repositories/followups-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    // 오늘 연락은 놓친·오늘 약속을 한 번에 담으려고 25보다 크게 읽는다 — 상한은 100.
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 25));
    const data = await getFollowups({ limit });

    // read 실패는 status:"error" 봉투로 알린다(HTTP 200) — 5xx로 내리면 공유 캐시·인프라가
    // daily-brief와 다른 계약을 보게 된다. preview(미구성)와는 status 값으로 구분된다.
    if (data.source === "error") {
      return NextResponse.json({ status: "error", ...data });
    }
    // 화면의 보조 읽기(약속 장부·이번 주)가 실패해도 partial이다 — data.partial은 크론이 보는
    // 핵심 소스만 뜻하므로 여기서 합쳐 명명한다.
    const partial = data.partial || (data.auxiliaryFailedSources || []).length > 0;
    return NextResponse.json({
      status: data.source === "supabase" ? (partial ? "partial" : "live") : "preview",
      ...data,
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 저장 봉투 → HTTP. saved 200 · invalid-input 400 · preview 202(백엔드 미구성 — 저장 안 됨) ·
// failed/error 502. 소비자는 HTTP가 아니라 status를 읽는다(Save envelope).
function envelopeStatus(status) {
  if (status === "saved") return 200;
  if (status === "invalid-input" || status === "error") return 400;
  if (status === "preview" || status === "noop") return 202;
  return 502;
}

// POST — write-guarded. Three actions:
//   { action: "recompute-scores" } — operator/cron-triggered leads.score recompute (never on read).
//   { action: "reschedule", kind, id, at } — 오늘 연락의 [날짜 다시]·[시점 정하기]. 연락 기록 없이
//     약속 날짜만 옮긴다(기약 없음도 풀린다).
//   { action: "annotate-activity", activityId, occurredAt?, capture? } — 방금 저장한 연락 기록에
//     기록 소요 초·후보 출처·실제 연락 시각을 단다. 기록 자체의 저장 여부와 무관하다.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const action = typeof parsed.data?.action === "string" ? parsed.data.action : "";
  if (action === "reschedule" || action === "annotate-activity") {
    try {
      const result = action === "reschedule"
        ? await rescheduleFollowup(parsed.data)
        : await annotateContactActivity(parsed.data);
      return NextResponse.json(result, { status: envelopeStatus(result.status) });
    } catch (error) {
      return NextResponse.json(
        { status: "error", error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }
  if (action !== "recompute-scores") {
    return NextResponse.json({ status: "error", error: "Unknown action." }, { status: 400 });
  }

  try {
    const result = await recomputeLeadScores({});
    return NextResponse.json({ status: result.persisted ? "ok" : "skipped", ...result });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
