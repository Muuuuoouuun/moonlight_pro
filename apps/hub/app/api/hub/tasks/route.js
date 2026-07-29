import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import { isCanonicalUuid } from "@/lib/uuid.js";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getProjectLedger();

    if (ledger.source === "error") {
      return NextResponse.json(
        {
          status: "error",
          source: "error",
          configured: ledger.configured,
          workspaceId: ledger.workspaceId,
          error: ledger.error || "project-ledger-core-read-failed",
          failedSources: ledger.failedSources || ["tasks"],
          retryable: ledger.retryable !== false,
          tasks: [],
        },
        { status: 502 },
      );
    }

    const taskPartial = ledger.source === "supabase" && ledger.taskAggregation?.partial === true;

    return NextResponse.json({
      status: ledger.source === "supabase"
        ? taskPartial ? "partial" : "live"
        : "preview",
      source: ledger.source,
      configured: ledger.configured,
      workspaceId: ledger.workspaceId,
      partial: taskPartial,
      failedSources: taskPartial ? ["tasks"] : [],
      tasks: ledger.todos,
    });
  } catch (error) {
    console.error("[hub/tasks] task ledger read failed", error);
    return NextResponse.json(
      {
        status: "error",
        error: "task-ledger-unexpected-error",
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
    workspaceId: resolveDefaultWorkspaceId(),
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
    workspaceId: resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, task: result.data?.entity || null },
    { status: result.httpStatus },
  );
}

// Soft delete (migration 0024): stamps deleted_at so the task leaves every surface but
// stays recoverable. Body carries { id }. Routed through the Engine's delete_task command
// rather than a hub-direct Supabase delete — a hard delete cascades milestones and orphans
// decisions, and Engine owns writes.
export async function DELETE(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) return guard;

  const parsed = await readHubWriteJson(req);
  if (parsed.error) return parsed.error;

  const id = typeof parsed.data?.id === "string" ? parsed.data.id.trim() : "";
  if (!isCanonicalUuid(id)) {
    return NextResponse.json(
      { status: "invalid-input", error: "invalid-task-id" },
      { status: 400 },
    );
  }

  const result = await forwardPmsCommand({
    id,
    action: "delete_task",
    workspaceId: resolveDefaultWorkspaceId(),
  });
  return NextResponse.json(
    { ...result.data, task: result.data?.entity || null },
    { status: result.httpStatus },
  );
}
