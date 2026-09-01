import { NextResponse } from "next/server";

import { getWeeklyReport } from "@/lib/repositories/weekly-report";
import { resolveSupabaseConfig } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/hub/weekly-report?scope=personal|company — Q118·Q119 주간 정리 리포트.
export async function GET(request) {
  try {
    if (!resolveSupabaseConfig()) {
      return NextResponse.json({ status: "preview", source: "preview", configured: false, stats: null, highlights: [] });
    }
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "company" ? "company" : "personal";
    const report = await getWeeklyReport({ scope });
    if (report.source === "error") {
      // read 실패는 status:"error" 봉투로 알린다(HTTP 200, daily-brief 계약).
      return NextResponse.json({ status: "error", ...report });
    }
    return NextResponse.json({ status: report.partial ? "partial" : "live", ...report });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
