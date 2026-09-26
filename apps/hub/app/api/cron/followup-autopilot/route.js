import { NextResponse } from "next/server";

import { assertHubWriteAllowed } from "@/lib/hub-write-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retired on 2026-09-26. Keep the authenticated tombstone for old callers;
// request-driven assistance stays in the existing business screens.
export async function GET(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  return NextResponse.json(
    {
      status: "disabled",
      reason: "automation-retired",
      message: "일괄 후속 초안 자동화는 종료되었습니다. 고객 화면에서 필요한 답장 초안을 직접 요청하세요.",
    },
    { status: 410 },
  );
}
