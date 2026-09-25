import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 제품 월 숫자(주간 사용자·매출·비용) 수동 기록 — 하트비트·결제 연결 전까지의 입력 경로(제품 운영실 M2).
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const result = await forwardPmsCommand({
    ...parsed.data,
    action: "record_month",
    workspaceId: resolveDefaultWorkspaceId(),
  }, { path: "/api/products/command" });
  return NextResponse.json(result.data, { status: result.httpStatus });
}
