import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";
import { recordAutomationRun } from "@/lib/automation-runs";
import { sweepContentSchedules } from "@/lib/repositories/content-schedules-ledger";
import { SWEEP_HOUR_KST } from "@/lib/content-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 예약 밤 정리 — 매일 22:00 KST(vercel.json은 UTC 13:00). 그날 안 올린 예약을 '놓침'으로 바꾼다(운영자 확정 2026-09-29).
// 결과물이 이미 발행 상태면 놓침이 아니라 발행으로 바로잡는다. 자동 업로드는 하지 않는다.
// Auth: 다른 크론과 같다 — Vercel이 Bearer CRON_SECRET(= COM_MOON_HUB_WRITE_SECRET)을 넣고, 그 밖의 호출은 막힌다.
const AUTOMATION_KEY = "content-schedule-sweep";
const AUTOMATION_NAME = "예약 밤 정리 · 놓친 예약 표시";

export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const startedAt = new Date().toISOString();
  const result = await sweepContentSchedules({});
  const failed = result.status === "error" || result.status === "partial";
  // 자동화 화면(automation_runs)에 실행을 남긴다 — 조용히 죽는 크론을 막는 F-0 가시성. preview(연결 없음)는 실행이 아니다.
  if (result.status !== "preview") {
    await recordAutomationRun({
      key: AUTOMATION_KEY,
      name: AUTOMATION_NAME,
      status: failed ? "failure" : "success",
      input: { sweepHourKst: SWEEP_HOUR_KST },
      output: { ...result, summary: `놓침 ${result.missed || 0}건 · 발행 확인 ${result.published || 0}건` },
      errorMessage: failed ? result.error || `${result.failed || 0}건 갱신 실패` : null,
      startedAt,
    }).catch(() => null);
  }
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}
