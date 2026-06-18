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
          )
        : { persisted: false, reason: "not-patched" };

    if (!persistence.persisted) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Project update payload is valid, but persistence is not configured or failed.",
          preview: record,
          persistence,
          projectPersistence,
        },
        { status: 202 },
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
