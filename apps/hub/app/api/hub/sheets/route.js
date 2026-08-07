import { NextResponse } from "next/server";

import { getSheetsSyncStatus } from "@/lib/repositories/sheets-sync";
import { buildGoogleProviderStatus } from "@/lib/integration-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getSheetsSyncStatus();
    // buildGoogleProviderStatus는 env 준비도 + connected만 본다 — 원장 read가 실패했는데
    // 200으로 내리면 'ready'(=연결만 하면 됨)로 뭉개져 운영자가 있지도 않은 연결 작업을
    // 하게 된다. 코어 read 실패는 502 + error다(8차 잔여 M · Phase 0 분류).
    if (status.source === "error") {
      return NextResponse.json(
        { ...status, provider: "google_sheets", status: "error" },
        { status: 502 },
      );
    }

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
