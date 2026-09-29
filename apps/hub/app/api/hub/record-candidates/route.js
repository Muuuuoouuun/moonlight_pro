import { NextResponse } from "next/server.js";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { applyRecordCandidateAction, getRecordCandidates } from "@/lib/repositories/record-candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — "기록할까요" 후보(캘린더 미기록 미팅 + 갤럭시 통화·문자·카톡). 읽기 실패는 5xx가 아니라
// HTTP 200 + status:"error" 봉투다(CLAUDE.md 허브 read 계약) — 소비자는 d.status를 읽어야 한다.
export async function GET() {
  try {
    return NextResponse.json(await getRecordCandidates());
  } catch (error) {
    return NextResponse.json({
      status: "error",
      failedSources: ["record-candidates"],
      candidates: [],
      message: "기록 후보를 불러오지 못했어요.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// POST { id, action: 'resolve'|'dismiss'|'restore', reason?: 'cancelled'|'not-this-customer' }
// 저장 봉투: saved · duplicate · accepted(캘린더 해소 — 기록이 생기면 저절로 사라짐) · preview(저장 안 됨)
// · conflict · not-found · invalid-input · failed.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const { httpStatus = 200, ...result } = await applyRecordCandidateAction(parsed.data || {});
  return NextResponse.json(result, { status: httpStatus });
}
