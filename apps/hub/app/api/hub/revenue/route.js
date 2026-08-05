import { NextResponse } from "next/server";

import { getRevenueLedger } from "@/lib/repositories/revenue-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getRevenueLedger();

    if (ledger.source === "error") {
      // 라이브 백엔드 read 거부는 502 — 200 preview로 뭉개면 소비자가 재시도하지 않는다.
      return NextResponse.json({ status: "error", ...ledger }, { status: 502 });
    }

    return NextResponse.json({
      status: ledger.source === "supabase"
        ? ledger.partial ? "partial" : "live"
        : "preview",
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
