import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getFollowups, recomputeLeadScores } from "@/lib/repositories/followups-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 25;
    const data = await getFollowups({ limit });

    // read 실패는 error(502) — preview(미구성)로 뭉개면 "오늘 할 일 없음"으로 오독된다.
    if (data.source === "error") {
      return NextResponse.json({ status: "error", ...data }, { status: 502 });
    }
    return NextResponse.json({
      status: data.source === "supabase" ? (data.partial ? "partial" : "live") : "preview",
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// POST { action: "recompute-scores" } — operator/cron-triggered leads.score recompute.
// Write-guarded: this mutates production leads, so it never runs on read.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const action = typeof parsed.data?.action === "string" ? parsed.data.action : "";
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
