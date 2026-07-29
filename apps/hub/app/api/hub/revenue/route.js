import { NextResponse } from "next/server";

import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";
import { projectRevenueLedger } from "@/lib/revenue-ledger-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const view = new URL(request.url).searchParams.get("view") || "";
    const ledger = await getRevenueLedger({ view });

    return NextResponse.json({
      status: ledger.source === "supabase" ? "live" : "preview",
      ...projectRevenueLedger(ledger, view),
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
