import { NextResponse } from "next/server";

import { getWorkLedger } from "@/lib/repositories/work-ledger";
import { isCanonicalUuid } from "../../../../lib/uuid.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const projectId = new URL(req.url).searchParams.get("project")?.trim() || null;
    if (projectId && !isCanonicalUuid(projectId)) {
      return NextResponse.json(
        {
          status: "invalid-input",
          error: "invalid-project-id",
          message: "project must be a canonical UUID.",
        },
        { status: 400 },
      );
    }
    const ledger = await getWorkLedger({ projectId });

    if (ledger.source === "error") {
      // 코어 read 거부는 502 — 200으로 뭉개면 소비자가 재시도하지 않고
      // 빈 결정/리듬/로드맵을 "기록 없음"으로 렌더한다.
      return NextResponse.json({ status: "error", ...ledger }, { status: 502 });
    }

    const status = ledger.source === "supabase"
      ? ledger.partial ? "partial" : "live"
      : "preview";

    // 전면 read 실패는 502 — 200으로 내리면 r.ok 가드 소비자에게 성공으로 읽힌다(Phase 0).
    return NextResponse.json(
      { status, ...ledger },
      { status: status === "error" ? 502 : 200 },
    );
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
