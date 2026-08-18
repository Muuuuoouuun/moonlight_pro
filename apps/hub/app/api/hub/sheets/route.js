import { NextResponse } from "next/server";

import { getSheetsSyncStatus } from "@/lib/repositories/sheets-sync";
import { buildGoogleProviderStatus } from "@/lib/integration-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getSheetsSyncStatus();

    if (status.source === "error") {
      // read 거부는 502 — provider status를 얹으면 connected:false로 정규화돼
      // 화면이 "미연결 + 연결 CTA"를 띄운다(실제 연결 상태는 알 수 없다).
      return NextResponse.json(
        { status: "error", provider: "google_sheets", ...status },
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
