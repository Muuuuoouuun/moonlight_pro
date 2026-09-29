import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 제품 ↔ GitHub 저장소 연결(§5.1). 저장소 목록의 정본이 환경 변수에서 이 표로 옮겨 왔다.
// 연결 해제는 연결 행만 지운다 — 저장소·제품·지난 신호는 남는다.
const PRODUCT_COMMAND_PATH = "/api/products/command";

async function forward(req, action) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;
  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  const result = await forwardPmsCommand({
    ...parsed.data,
    action,
    ...(action === "connect_repository" ? { id: parsed.data.id || randomUUID() } : {}),
    workspaceId: resolveDefaultWorkspaceId(),
  }, { path: PRODUCT_COMMAND_PATH });
  return NextResponse.json({ ...result.data, repository: result.data?.entity || null }, { status: result.httpStatus });
}

export function POST(req) {
  return forward(req, "connect_repository");
}

export function PATCH(req) {
  return forward(req, "update_repository");
}

export function DELETE(req) {
  return forward(req, "disconnect_repository");
}
