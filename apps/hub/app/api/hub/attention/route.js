import { NextResponse } from "next/server";

import { getAttentionLedger } from "@/lib/repositories/attention-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getAttentionLedger();
    return NextResponse.json({ status: "ok", ...ledger });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
