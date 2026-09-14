import { NextResponse } from "next/server.js";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getDailyReviewLedger, saveDailyReview } from "@/lib/repositories/daily-review-ledger";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { resolveRhythmTimeZone } from "@/lib/rhythm-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(await getDailyReviewLedger({ date: params.get("date"), month: params.get("month") }));
  } catch {
    return NextResponse.json({
      status: "error", configured: Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()),
      timezone: resolveRhythmTimeZone(null), review: null, entries: [], error: "read-failed",
      message: "하루 리뷰를 불러오지 못했어요. 다시 시도해 주세요.",
    });
  }
}

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;
    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;
    const { httpStatus = 200, ...result } = await saveDailyReview(parsed.data);
    return NextResponse.json(result, { status: httpStatus });
  } catch {
    return NextResponse.json({
      status: "error", review: null, error: "save-failed", retryable: true,
      message: "저장을 확인하지 못했어요. 같은 요청으로 다시 시도해 주세요.",
    }, { status: 502 });
  }
}
