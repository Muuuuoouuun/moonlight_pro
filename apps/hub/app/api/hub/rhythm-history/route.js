import { NextResponse } from "next/server";

import { getRhythmHistory } from "@/lib/repositories/rhythm-history-ledger";
import { normalizeHistoryOffset, normalizeHistoryRange } from "../../../../lib/rhythm-history.js";
import { isCanonicalUuid } from "../../../../lib/uuid.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 리듬 기록 read — ?range=week|month|quarter|year&offset=0|-1|…&project=<uuid>.
// 허브 read 실패 봉투 계약(CLAUDE.md): read 실패는 5xx가 아니라 HTTP 200 + status:"error".
export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const projectId = params.get("project")?.trim() || null;
    if (projectId && !isCanonicalUuid(projectId)) {
      return NextResponse.json(
        { status: "invalid-input", error: "invalid-project-id", message: "project must be a canonical UUID." },
        { status: 400 },
      );
    }
    const ledger = await getRhythmHistory({
      range: normalizeHistoryRange(params.get("range")),
      offset: normalizeHistoryOffset(params.get("offset") ?? 0),
      projectId,
    });

    if (ledger.source === "error") return NextResponse.json({ status: "error", ...ledger });
    if (ledger.source !== "supabase") return NextResponse.json({ status: "preview", ...ledger });
    return NextResponse.json({ status: ledger.partial ? "partial" : "live", ...ledger });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      source: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
