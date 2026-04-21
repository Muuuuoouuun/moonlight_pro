import { NextResponse } from "next/server";

import { getWorkLedger } from "@/lib/repositories/work-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getWorkLedger();

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
