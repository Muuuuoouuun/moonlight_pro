import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { buildProjectUpdateRecord, insertSupabaseRecord, updateSupabaseRecord } from "@/lib/server-write";
import { classifyWritePersistence } from "@/lib/write-response";

export const runtime = "nodejs";

function writeResponse(persistence, details = {}) {
  const classification = classifyWritePersistence(persistence);

  return NextResponse.json(
    {
      ...details,
      ...classification,
    },
    { status: classification.httpStatus },
  );
}

async function writeInputError(response) {
  const details = await response.json().catch(() => ({}));
  const reason = response.status === 413 ? "payload-too-large" : "invalid-json";

  return writeResponse({ persisted: false, reason }, details);
}

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
      return writeInputError(parsed.error);
    }

    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return writeResponse(
        { persisted: false, reason: "validation" },
        { error: "Request body must be a JSON object." },
      );
    }

    const payload = parsed.data;
    const record = buildProjectUpdateRecord(payload);

    if (!record.workspace_id) {
      return writeResponse(
        { persisted: false, reason: "missing-workspace" },
        {
          message: "Workspace ID is required before a project update can be saved.",
          preview: record,
        },
      );
    }

    const persistence = await insertSupabaseRecord("project_updates", record);
    const projectPatch = buildProjectPatch(record);
    const shouldPatchProject = Boolean(
      persistence.persisted && record.project_id && Object.keys(projectPatch).length,
    );
    const projectPersistence =
      shouldPatchProject
        ? await updateSupabaseRecord(
            "projects",
            [
              ["id", `eq.${record.project_id}`],
              ["workspace_id", `eq.${record.workspace_id}`],
            ],
            projectPatch,
            { returnRepresentation: true, select: "id" },
          )
        : { persisted: false, reason: "not-patched" };

    if (!persistence.persisted) {
      return writeResponse(
        persistence,
        {
          message: "Project update persistence failed.",
          preview: record,
          persistence,
          projectPersistence,
        },
      );
    }

    if (shouldPatchProject && !projectPersistence.persisted) {
      return writeResponse(
        {
          ...projectPersistence,
          persisted: false,
          partialPersisted: true,
        },
        {
          message: "Project update was recorded, but the project patch failed.",
          projectId: record.project_id,
          preview: record,
          persistence,
          projectPersistence,
          partialWrite: {
            persisted: ["project_updates"],
            failed: "projects",
          },
        },
      );
    }

    return writeResponse(
      persistence,
      {
        message: "Project update saved to Supabase.",
        preview: record,
        persistence,
        projectPersistence,
      },
    );
  } catch (error) {
    return writeResponse(
      { persisted: false, reason: "mutation-failed" },
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}
