import { NextResponse } from "next/server";

import { getSheetsSyncStatus } from "@/lib/repositories/sheets-sync";
import { buildGoogleProviderStatus } from "@/lib/integration-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getSheetsSyncStatus();
    const providerStatus = buildGoogleProviderStatus("sheets", {
      connected: status.connected,
      ledgerConfigured: status.configured,
    });

    return NextResponse.json({
      ...status,
      provider: "google_sheets",
      ...providerStatus,
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
