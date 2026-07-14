import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { forwardCaptureCommand } from "@/lib/capture-engine-client";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { raw, hint, idempotencyKey } — BFF only; Engine owns receipt + destination transaction.
export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const input = parsed.data || {};
  const result = await forwardCaptureCommand({
    raw: input.raw,
    hint: input.hint || "inbox",
    idempotencyKey: input.idempotencyKey || input.idempotency_key || randomUUID(),
    entityRef: input.entityRef || input.entity_ref || null,
    workspaceId: input.workspaceId || resolveDefaultWorkspaceId(),
  });

  return NextResponse.json(result.data, { status: result.httpStatus });
}
