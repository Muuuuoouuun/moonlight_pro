import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { getProjectLedger } from "@/lib/repositories/operating-ledger";
import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
} from "@/lib/server-write";
import { normalizeTaskInput } from "@/lib/task-input";

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

  const normalized = normalizeTaskInput(parsed.data, resolveDefaultWorkspaceId());

  if (!normalized.ok) {
    const preview = normalized.reason === "missing-workspace";

    return NextResponse.json(
      {
        status: preview ? "preview" : "invalid-input",
        error: normalized.reason,
      },
      { status: preview ? 202 : 400 },
    );
  }

  const persistence = await insertSupabaseRecord("tasks", normalized.record, {
    returnRepresentation: true,
    select: "id,workspace_id,project_id,area_id,title,status,priority,next_action,due_at,meta,created_at",
  });

  if (!persistence.persisted) {
    const preview = persistence.reason === "missing-config";

    return NextResponse.json(
      {
        status: preview ? "preview" : "error",
        error: persistence.reason,
        detail: persistence.detail || null,
      },
      { status: preview ? 202 : 502 },
    );
  }

  return NextResponse.json({
    status: "saved",
    task: persistence.record,
  });
}
