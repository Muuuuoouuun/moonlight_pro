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
      message: "일괄 브리핑 자동화는 종료되었습니다. Office에서 필요한 요약과 검토를 직접 요청하세요.",
    },
    { status: 410 },
  );
}
