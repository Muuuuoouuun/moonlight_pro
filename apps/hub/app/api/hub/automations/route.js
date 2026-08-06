import { NextResponse } from "next/server";

import { getAutomationsLedger } from "@/lib/repositories/automations-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getAutomationsLedger();

    if (ledger.source === "error") {
      // 라이브 read 거부는 502 — 200 preview로 뭉개면 소비자가 재시도하지 않는다.
      return NextResponse.json({ status: "error", ...ledger }, { status: 502 });
    }

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
