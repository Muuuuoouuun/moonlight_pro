import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a PMS container (brand row) with a taxonomy category, so KA·딜 / 일반
// containers become first-class siblings of the SNS channels (2026-07-15 spec §4).
// Reads come from operating-ledger's getProjectLedger; this route only writes.
// Forwards to the Engine's create_brand action; when the Engine is not
// configured the envelope is { status: "preview" } and the Hub UI keeps an
// optimistic local container (§8.1 interaction contract).
async function forwardBrandWrite(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const result = await forwardPmsCommand({
    ...parsed.data,
    action: "create_brand",
    id: parsed.data.id || randomUUID(),
    workspaceId: resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, brand: result.data?.entity || null },
    { status: result.httpStatus },
  );
}

export function POST(req) {
  return forwardBrandWrite(req);
}

// Rename/reclassify an existing container. Slug is intentionally absent from the
// payload — brand keys are identifiers for filters and folder grouping.
export async function PATCH(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const result = await forwardPmsCommand({
    ...parsed.data,
    action: "update_brand",
    workspaceId: resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, brand: result.data?.entity || null },
    { status: result.httpStatus },
  );
}
