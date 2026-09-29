import { NextResponse } from "next/server";

import { getWeeklyReport } from "@/lib/repositories/weekly-report";
import { resolveSupabaseConfig } from "@/lib/server-write";
import { weeklyReportQuery } from "@/lib/weekly-report-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/hub/weekly-report?scope=personal|company — Q118·Q119 주간 정리 리포트.
// 주간 실측(목표·성과)은 periodStart·periodEnd(완료된 날, 31일 이내)와 goals=0으로 지난 주를 읽는다.
export async function GET(request) {
  try {
    if (!resolveSupabaseConfig()) {
      return NextResponse.json({ status: "preview", source: "preview", configured: false, stats: null, scorecard: null, highlights: [] });
    }
    const query = weeklyReportQuery(new URL(request.url).searchParams);
    if (query.error) return NextResponse.json({ status: "error", source: "error", error: query.error });
    const { scope, ...period } = query;
    const report = await getWeeklyReport({ scope, ...period });
    if (report.source === "error") {
      // read 실패는 status:"error" 봉투로 알린다(HTTP 200, daily-brief 계약).
      return NextResponse.json({ status: "error", ...report });
    }
    return NextResponse.json({ status: report.partial ? "partial" : "live", ...report });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      source: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
