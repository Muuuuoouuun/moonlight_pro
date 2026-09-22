import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getCrmNudges } from "@/lib/repositories/crm-nudges-source";
import { buildNudgeSuppressionWrite, persistNudgeSuppression } from "@/lib/sales-os/nudge-suppression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — 지금 보여줄 넛지. 읽기 실패는 5xx가 아니라 HTTP 200 + status:"error" 봉투다
// (CLAUDE.md 허브 read 계약) — 소비자는 d.status를 읽어야 하고, !r.ok만 보면 읽기 실패가
// "넛지 없음"으로 위장된다.
export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const ignoredEventIds = (params.get("ignoredEvents") || "").split(",").map((v) => v.trim()).filter(Boolean);
    const data = await getCrmNudges({ ignoredEventIds });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      status: "error",
      failedSources: ["crm-nudges"],
      nudges: [],
      unrecordedMeetings: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// POST { subjectType, subjectId, triggerKey, action: 'snooze'|'dismiss'|'resume', until? }
// 억제는 대상 레코드의 meta.nudges에 쌓인다 — 새 테이블 없음. 미루기는 레코드 전체(그
// 날짜까지), 숨기기는 같은 triggerKey만, resume은 둘 다 해제.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const write = buildNudgeSuppressionWrite(parsed.data || {});
  if (!write.ok) {
    return NextResponse.json({ status: "invalid-input", reason: write.reason }, { status: 400 });
  }

  try {
    const result = await persistNudgeSuppression(write);
    const httpStatus = result.status === "saved" ? 200 : result.status === "preview" ? 202 : 502;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
