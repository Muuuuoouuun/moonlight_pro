import { taskRecoveryAssertion } from '@/lib/operator-session';
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forwardDecisionWrite(req, action) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;
  if (!taskRecoveryAssertion(req, parsed.data, resolveDefaultWorkspaceId())) return NextResponse.json({ status: 'conflict', error: 'check-write-owner-changed' }, { status: 409 });

  const result = await forwardPmsCommand({
    ...parsed.data,
    action,
    ...(action === "create_decision" ? { id: parsed.data.id || randomUUID() } : {}),
    workspaceId: parsed.data.workspaceId || resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, decision: result.data?.entity || null },
    { status: result.httpStatus },
  );
}

export function POST(req) {
  return forwardDecisionWrite(req, "create_decision");
}

export function PATCH(req) {
  return forwardDecisionWrite(req, "update_decision");
}
