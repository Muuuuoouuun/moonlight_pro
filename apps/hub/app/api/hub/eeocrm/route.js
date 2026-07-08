import { NextResponse } from "next/server";

import { getEeocrmSyncStatus } from "@/lib/repositories/eeocrm-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getEeocrmSyncStatus();

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
