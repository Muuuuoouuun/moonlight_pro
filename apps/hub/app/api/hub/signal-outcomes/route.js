import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { kstDayKey } from "@/lib/kst-day";
import {
  finishedTodayFrom,
  readSignalOutcomeWindow,
  recordSignalOutcome,
  undoSignalOutcome,
} from "@/lib/repositories/signal-outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 확인할 것 — 끝내기 영수증(확인할 것 스펙 §8.2).
// GET   오늘 끝낸 것. 읽기 실패는 5xx가 아니라 HTTP 200 + status:"error"(허브 read 봉투 계약).
// POST  { requestId, signalKey, subject:{type,id}, title?, outcome, recordRef?, snoozedUntil?, scheduledStart?, scheduledEnd?, calendarEventId?, note? }
// PATCH { id, action:"undo" } — 보류·잡아 둔 일만 되돌린다.
export async function GET() {
  const now = Date.now();
  const window = await readSignalOutcomeWindow({ now });
  if (window.status === "error") {
    return NextResponse.json({ status: "error", source: "error", finishedToday: [], error: "signal-outcomes-read-failed" });
  }
  return NextResponse.json({
    status: window.status,
    source: window.status === "preview" ? "preview" : "supabase",
    finishedToday: finishedTodayFrom(window.rows, kstDayKey(new Date(now))),
  });
}

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const { httpStatus, ...body } = await recordSignalOutcome(parsed.data || {});
  return NextResponse.json(body, { status: httpStatus || 200 });
}

export async function PATCH(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  if (parsed.data?.action !== "undo") {
    return NextResponse.json({ status: "invalid-input", reason: "invalid-action" }, { status: 400 });
  }
  const { httpStatus, ...body } = await undoSignalOutcome({ id: parsed.data.id });
  return NextResponse.json(body, { status: httpStatus || 200 });
}
