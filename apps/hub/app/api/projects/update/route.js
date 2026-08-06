import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { buildProjectUpdateRecord, insertSupabaseRecord, updateSupabaseRecord } from "@/lib/server-write";

export const runtime = "nodejs";

function toProjectStatus(status) {
  if (status === "done") return "completed";
  if (status === "active" || status === "blocked") return status;
  return null;
}

function buildProjectPatch(record) {
  const projectStatus = toProjectStatus(record.status);
  const patch = {
    ...(projectStatus ? { status: projectStatus } : {}),
    ...(record.progress !== null ? { progress: record.progress } : {}),
    ...(record.next_action ? { next_action: record.next_action } : {}),
  };

  if (Object.keys(patch).length) {
    patch.last_activity_at = record.happened_at;
  }

  return patch;
}

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) {
      return guard;
    }

    const parsed = await readHubWriteJson(req);
    if (parsed.error) {
      return parsed.error;
    }

    const payload = parsed.data;
    const record = buildProjectUpdateRecord(payload);

    if (!record.workspace_id) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Preview only.",
          preview: record,
        },
        { status: 202 },
      );
    }

    const persistence = await insertSupabaseRecord("project_updates", record);
    const projectPatch = buildProjectPatch(record);
    const projectPersistence =
      persistence.persisted && record.project_id && Object.keys(projectPatch).length
        ? await updateSupabaseRecord(
            "projects",
            [
              ["id", `eq.${record.project_id}`],
              ["workspace_id", `eq.${record.workspace_id}`],
            ],
            projectPatch,
            // 0행 패치({persisted:false,"no-matching-row"})를 감지해 partial로 명명 —
            // return=minimal 204는 "아무 행도 안 맞음"을 saved로 위장한다(6차 재감사 S/M).
            { returnRepresentation: true },
          )
        : { persisted: false, reason: "not-patched" };

    if (!persistence.persisted) {
      // Phase 0 taxonomy: preview는 missing-config만 — 라이브 거부(timeout/RLS/5xx)는
      // failed→502 (5차 재감사: revenue-write 3차 수정이 이 라우트엔 미도달).
      const isPreview = persistence.reason === "missing-config";
      return NextResponse.json(
        {
          status: isPreview ? "preview" : "failed",
          message: isPreview
            ? "Project update payload is valid, but persistence is not configured."
            : "Live backend refused the project update — retry.",
          preview: record,
          persistence,
          projectPersistence,
        },
        { status: isPreview ? 202 : 502 },
      );
    }

    // 업데이트 행은 저장됐는데 프로젝트 행 패치가 거부된 반쪽 성공도 명명한다.
    if (projectPersistence && projectPersistence.persisted === false
      && !["not-patched", "missing-config"].includes(projectPersistence.reason)) {
      return NextResponse.json(
        {
          status: "partial",
          message: "Update row saved, but the project row patch failed — status/next action may be stale.",
          preview: record,
          persistence,
          projectPersistence,
        },
        { status: 207 },
      );
    }

    return NextResponse.json({
      status: "saved",
      message: "Project update saved to Supabase.",
      preview: record,
      persistence,
      projectPersistence,
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
