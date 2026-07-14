import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getProjectLedger();

    return NextResponse.json({
      status: ledger.source === "supabase" ? "live" : "preview",
      source: ledger.source,
      configured: ledger.configured,
      workspaceId: ledger.workspaceId,
      tasks: ledger.todos,
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

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);

  if (guard) {
    return guard;
  }

  const parsed = await readHubWriteJson(req);

  if (parsed.error) {
    return parsed.error;
  }

  const result = await forwardPmsCommand({
    ...parsed.data,
    action: "create_task",
    id: parsed.data.id || randomUUID(),
    workspaceId: parsed.data.workspaceId || resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, task: result.data?.entity || null },
    { status: result.httpStatus },
  );
}

export async function PATCH(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const result = await forwardPmsCommand({
    ...parsed.data,
    action: "update_task",
    workspaceId: parsed.data.workspaceId || resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, task: result.data?.entity || null },
    { status: result.httpStatus },
  );
}
