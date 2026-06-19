import { NextResponse } from "next/server";

import { getSheetsSyncStatus } from "@/lib/repositories/sheets-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getSheetsSyncStatus();

    return NextResponse.json({
      status: status.source === "supabase" ? "live" : "preview",
      ...status,
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
