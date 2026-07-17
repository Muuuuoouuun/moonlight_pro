import { NextResponse } from "next/server";

import { getWorkLedger } from "@/lib/repositories/work-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const projectId = new URL(req.url).searchParams.get("project")?.trim() || null;
    const ledger = await getWorkLedger({ projectId });

    return NextResponse.json({
      status: ledger.source === "supabase" ? "live" : "preview",
      ...ledger,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
