import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import {
  buildRoutineCheckRecord,
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";

export const runtime = "nodejs";

const CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const ROUTINE_CHECK_SELECT = "id,workspace_id,project_id,check_type,status,note,meta,checked_at,created_at,updated_at,idempotency_key";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isLocalDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function invalidInput(error, message) {
  return NextResponse.json(
    { status: "invalid-input", error, message, retryable: false },
    { status: 400 },
  );
}

function readFailure(source) {
  return NextResponse.json(
    {
      status: "error",
      error: `${source} ledger read failed`,
      retryable: true,
    },
    { status: 502 },
  );
}

function previewResponse(message, record) {
  return NextResponse.json(
    {
      status: "preview",
      message,
      saved: false,
      preview: record,
    },
    { status: 202 },
  );
}

function routineCheckIdempotencyKey({ projectId, ritualKey, dateKey }) {
  const identity = JSON.stringify([projectId || null, ritualKey, dateKey]);
  return `routine-check:v1:${createHash("sha256").update(identity).digest("hex")}`;
}

function isIdempotencyConflict(persistence) {
  const reason = cleanString(persistence?.reason).toLowerCase();
  const detail = cleanString(persistence?.detail).toLowerCase();
  return reason === "http-409"
    || detail.includes("23505")
    || detail.includes("routine_checks_workspace_idempotency_key_uidx");
}

async function findRoutineCheckByIdempotencyKey(idempotencyKey) {
  return fetchSupabaseRows("routine_checks", {
    select: ROUTINE_CHECK_SELECT,
    limit: 1,
    filters: withWorkspaceFilter([
      ["idempotency_key", eqFilter(idempotencyKey)],
    ]),
  });
}

async function findLegacyRoutineCheck({ projectId, ritualKey, dateKey }) {
  return fetchSupabaseRows("routine_checks", {
    select: ROUTINE_CHECK_SELECT,
    limit: 1,
    order: "checked_at.desc",
    filters: withWorkspaceFilter([
      ["project_id", projectId ? eqFilter(projectId) : "is.null"],
      ["meta->>ritual_key", eqFilter(ritualKey)],
      ["meta->>local_date", eqFilter(dateKey)],
      ["status", eqFilter("done")],
      ["idempotency_key", "is.null"],
    ]),
  });
}

function duplicateResponse(check) {
  return NextResponse.json({
    status: "duplicate",
    message: "This ritual is already checked in for the selected local date.",
    check,
  });
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: invalidInput("invalid-payload", "Routine check payload must be an object.") };
  }

  const projectId = cleanString(payload.projectId) || null;
  const ritualKey = cleanString(payload.ritualKey);
  const checkType = cleanString(payload.checkType).toLowerCase();
  const dateKey = cleanString(payload.dateKey);
  const name = cleanString(payload.name);
  const note = cleanString(payload.note) || null;
  const status = cleanString(payload.status).toLowerCase();

  if (!ritualKey || ritualKey.length > 160) {
    return { error: invalidInput("invalid-ritual-key", "ritualKey is required and must be at most 160 characters.") };
  }
  if (!CHECK_TYPES.has(checkType)) {
    return { error: invalidInput("invalid-check-type", "checkType must be morning, midday, evening, or weekly.") };
  }
  if (!isLocalDateKey(dateKey)) {
    return { error: invalidInput("invalid-date-key", "dateKey must be a real local date in YYYY-MM-DD form.") };
  }
  if (status !== "done") {
    return { error: invalidInput("invalid-status", "Rhythm check-in status must be done.") };
  }
  if (name.length > 200 || (note && note.length > 2000)) {
    return { error: invalidInput("invalid-text", "Routine name or note is too long.") };
  }

  return {
    value: {
      projectId,
      ritualKey,
      checkType,
      dateKey,
      name: name || ritualKey,
      note,
      status: "done",
    },
  };
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

    const normalized = normalizePayload(parsed.data);
    if (normalized.error) return normalized.error;

    const payload = normalized.value;
    const workspaceId = resolveDefaultWorkspaceId();
    const idempotencyKey = routineCheckIdempotencyKey(payload);
    const record = {
      ...buildRoutineCheckRecord(payload),
      workspace_id: workspaceId || null,
      project_id: payload.projectId,
      check_type: payload.checkType,
      status: "done",
      note: payload.note,
      idempotency_key: idempotencyKey,
      meta: {
        ritual_key: payload.ritualKey,
        name: payload.name,
        local_date: payload.dateKey,
      },
    };

    if (!workspaceId || !resolveSupabaseConfig()) {
      return previewResponse(
        "Workspace or Supabase is not configured. This check-in was not saved.",
        record,
      );
    }

    if (payload.projectId) {
      const projectRows = await fetchSupabaseRows("projects", {
        select: "id,name",
        limit: 2,
        filters: withWorkspaceFilter([["id", eqFilter(payload.projectId)]]),
      });

      if (!Array.isArray(projectRows)) return readFailure("projects");
      if (projectRows.length !== 1) {
        return invalidInput(
          "invalid-project-reference",
          "projectId must belong to the configured workspace.",
        );
      }
    }

    const duplicateRows = await findRoutineCheckByIdempotencyKey(idempotencyKey);

    if (!Array.isArray(duplicateRows)) return readFailure("routine_checks");
    if (duplicateRows.length > 0) {
      return duplicateResponse(duplicateRows[0]);
    }

    const legacyDuplicateRows = await findLegacyRoutineCheck(payload);
    if (!Array.isArray(legacyDuplicateRows)) return readFailure("routine_checks");
    if (legacyDuplicateRows.length > 0) {
      return duplicateResponse(legacyDuplicateRows[0]);
    }

    const persistence = await insertSupabaseRecord("routine_checks", record, {
      returnRepresentation: true,
      select: "*",
    });

    if (!persistence.persisted) {
      if (persistence.reason === "missing-config") {
        return previewResponse(
          "Supabase is not configured. This check-in was not saved.",
          record,
        );
      }

      if (isIdempotencyConflict(persistence)) {
        const winnerRows = await findRoutineCheckByIdempotencyKey(idempotencyKey);
        if (!Array.isArray(winnerRows)) return readFailure("routine_checks");
        if (winnerRows.length > 0) return duplicateResponse(winnerRows[0]);

        return NextResponse.json(
          {
            status: "error",
            error: "Routine check conflict occurred but the winning row could not be read.",
            retryable: true,
            persistence,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          status: "error",
          error: persistence.detail || persistence.reason || "Routine check persistence failed.",
          retryable: true,
          persistence,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        status: "saved",
        message: "Routine check saved to Supabase.",
        check: persistence.record || record,
      },
      { status: 201 },
    );
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
