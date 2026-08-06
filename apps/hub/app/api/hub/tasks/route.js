import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { eqFilter, withWorkspaceFilter } from "@/lib/server-read";
import { forwardPmsCommand } from "@/lib/pms-engine-client";
import { getTaskLedger } from "@/lib/repositories/operating-ledger";
import { isCanonicalUuid } from "@/lib/uuid.js";
import {
  deleteSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    // lean read (tasks·projects·brands 3콜) — 전체 프로젝트 원장 11+콜을 태우던 핫패스였다.
    const ledger = await getTaskLedger();

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

    const taskPartial = ledger.source === "supabase" && ledger.partial === true;

    // ?dealId= — Deals 체크리스트가 전체 목록을 받아 클라이언트에서 거르던 것을 서버에서 축소.
    let dealId = null;
    try { dealId = new URL(req.url).searchParams.get("dealId"); } catch {}
    const tasks = dealId ? ledger.todos.filter((t) => t.dealId === dealId) : ledger.todos;

    return NextResponse.json({
      status: ledger.source === "supabase"
        ? taskPartial ? "partial" : "live"
        : "preview",
      source: ledger.source,
      configured: ledger.configured,
      workspaceId: ledger.workspaceId,
      partial: taskPartial,
      failedSources: taskPartial
        ? Array.from(new Set([
            ...(ledger.taskAggregation?.partial ? ["tasks"] : []),
            ...(ledger.failedSources || []),
          ]))
        : [],
      tasks,
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

// Hard-delete a task row. The Engine's PMS command pipeline has no delete action —
// hub-direct Supabase delete follows the same precedent as /api/routine's DELETE.
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

  if (!resolveSupabaseConfig()) {
    return NextResponse.json(
      { status: "preview", message: "Supabase is not configured. This delete was not saved." },
      { status: 202 },
    );
  }

  const persistence = await deleteSupabaseRecord(
    "tasks",
    withWorkspaceFilter([["id", eqFilter(id)]]),
  );
  if (!persistence.persisted) {
    // no-matching-row = 지울 행이 없었다(이미 삭제됨·권한 거부·workspace 불일치). 재시도해도
    // 결과가 같으니 retryable=false로 구분한다 — 전송 실패와 다른 상황이다.
    const missing = persistence.reason === "no-matching-row";
    return NextResponse.json(
      {
        status: "error",
        reason: persistence.reason || null,
        error: missing
          ? "삭제할 할 일을 찾지 못했습니다 — 이미 삭제됐거나 권한이 없습니다."
          : persistence.detail || persistence.reason || "Task delete persistence failed.",
        retryable: !missing,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ status: "saved", message: "Task deleted." }, { status: 200 });
}
