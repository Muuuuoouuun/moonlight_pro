import { NextResponse } from "next/server";

import { getFollowups } from "@/lib/repositories/followups-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 25;
    const data = await getFollowups({ limit });

    return NextResponse.json({
      status: data.source === "supabase" ? "live" : "preview",
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
