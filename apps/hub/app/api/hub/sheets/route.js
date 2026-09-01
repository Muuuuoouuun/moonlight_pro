import { NextResponse } from "next/server";

import { getSheetsSyncStatus } from "@/lib/repositories/sheets-sync";
import { buildGoogleProviderStatus } from "@/lib/integration-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getSheetsSyncStatus();
    // buildGoogleProviderStatus는 env 준비도 + connected만 본다 — 원장 read가 실패했는데
    // status:"error" 없이 내리면 'ready'(=연결만 하면 됨)로 뭉개져 운영자가 있지도 않은 연결
    // 작업을 하게 된다. 코어 read 실패는 status:"error" + HTTP 200(daily-brief 계약)이다.
    if (status.source === "error") {
      return NextResponse.json({ ...status, provider: "google_sheets", status: "error" });
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
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
