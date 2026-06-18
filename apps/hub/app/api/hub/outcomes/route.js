import { NextResponse } from "next/server";

import { getOutcomeStats, getRecentOutcomes } from "@/lib/repositories/outcomes-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 30;
    const play = req.nextUrl.searchParams.get("play") || null;
    const [recent, stats] = await Promise.all([
      getRecentOutcomes({ limit, play }),
      getOutcomeStats({}),
    ]);

    return NextResponse.json({
      status: recent.source === "supabase" ? "live" : "preview",
      recent: recent.outcomes,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
