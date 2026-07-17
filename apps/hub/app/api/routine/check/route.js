import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import {
  legacyCandidateWindow,
  resolveRhythmTimeZone,
  routineLocalDateKey,
  routineSemanticKey,
  toZonedDateKey,
} from "../../../../lib/rhythm-calendar.js";
import { isCanonicalUuid } from "../../../../lib/uuid.js";
import {
  buildRoutineCheckRecord,
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";

export const runtime = "nodejs";

const CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const LEGACY_CANDIDATE_LIMIT = 100;
const ROUTINE_CHECK_SELECT = "id,workspace_id,project_id,check_type,status,note,meta,checked_at,created_at,updated_at,idempotency_key";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function previewResponse(message, record, dateKey) {
  return NextResponse.json(
    {
      status: "preview",
      message,
      saved: false,
      dateKey,
      localDate: dateKey,
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
  const detail = cleanString(persistence?.detail).toLowerCase();
  return detail.includes("23505")
    && detail.includes("routine_checks_workspace_idempotency_key_uidx");
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

async function resolveWorkspaceTimeZone(workspaceId) {
  const rows = await fetchSupabaseRows("workspaces", {
    select: "id,timezone",
    limit: 1,
    filters: [["id", eqFilter(workspaceId)]],
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    return { ok: false, timeZone: null };
  }
  return { ok: true, timeZone: resolveRhythmTimeZone(rows[0].timezone) };
}

async function findLegacyRoutineCheck({ projectId, ritualKey, checkType, dateKey }, timeZone) {
  const window = legacyCandidateWindow(dateKey);
  const candidates = await fetchSupabaseRows("routine_checks", {
    select: ROUTINE_CHECK_SELECT,
    limit: LEGACY_CANDIDATE_LIMIT + 1,
    order: "checked_at.desc",
    filters: withWorkspaceFilter([
      ["project_id", projectId ? eqFilter(projectId) : "is.null"],
      ["check_type", eqFilter(checkType)],
      ["status", eqFilter("done")],
      ["idempotency_key", "is.null"],
      ["checked_at", `gte.${window.start}`],
      ["checked_at", `lt.${window.end}`],
    ]),
  });
  if (!Array.isArray(candidates)) return { state: "read-failure", rows: [] };
  if (candidates.length > LEGACY_CANDIDATE_LIMIT) return { state: "overflow", rows: [] };
  return {
    state: "ok",
    rows: candidates.filter((row) => (
      routineSemanticKey(row) === ritualKey
      && routineLocalDateKey(row, timeZone) === dateKey
    )),
  };
}

function duplicateResponse(check, dateKey) {
  return NextResponse.json({
    status: "duplicate",
    message: "This ritual is already checked in for the selected local date.",
    dateKey,
    localDate: dateKey,
    check,
  });
}

function legacyOverflowResponse() {
  return NextResponse.json(
    {
      status: "error",
      error: "legacy-candidate-overflow",
      message: "Legacy routine check candidates exceeded the safe duplicate-check limit.",
      retryable: true,
    },
    { status: 502 },
  );
}

function buildAuthoritativeRecord(payload, workspaceId, timeZone) {
  const baseRecord = buildRoutineCheckRecord(payload);
  const dateKey = toZonedDateKey(baseRecord.checked_at, timeZone);
  const authoritativePayload = { ...payload, dateKey };
  return {
    dateKey,
    payload: authoritativePayload,
    record: {
      ...baseRecord,
      workspace_id: workspaceId || null,
      project_id: payload.projectId,
      check_type: payload.checkType,
      status: "done",
      note: payload.note,
      idempotency_key: routineCheckIdempotencyKey(authoritativePayload),
      meta: {
        ritual_key: payload.ritualKey,
        name: payload.name,
        local_date: dateKey,
      },
    },
  };
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: invalidInput("invalid-payload", "Routine check payload must be an object.") };
  }

  const projectId = cleanString(payload.projectId) || null;
  const ritualKey = cleanString(payload.ritualKey);
  const checkType = cleanString(payload.checkType).toLowerCase();
  const name = cleanString(payload.name);
  const note = cleanString(payload.note) || null;
  const status = cleanString(payload.status).toLowerCase();

  if (!ritualKey || ritualKey.length > 160) {
    return { error: invalidInput("invalid-ritual-key", "ritualKey is required and must be at most 160 characters.") };
  }
  if (projectId && !isCanonicalUuid(projectId)) {
    return { error: invalidInput("invalid-project-id", "projectId must be a canonical UUID.") };
  }
  if (!CHECK_TYPES.has(checkType)) {
    return { error: invalidInput("invalid-check-type", "checkType must be morning, midday, evening, or weekly.") };
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

    if (!workspaceId || !resolveSupabaseConfig()) {
      const preview = buildAuthoritativeRecord(
        payload,
        workspaceId,
        resolveRhythmTimeZone(null),
      );
      return previewResponse(
        "Workspace or Supabase is not configured. This check-in was not saved.",
        preview.record,
        preview.dateKey,
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

    const workspaceTimeZone = await resolveWorkspaceTimeZone(workspaceId);
    if (!workspaceTimeZone.ok) return readFailure("workspaces timezone");

    const authoritative = buildAuthoritativeRecord(
      payload,
      workspaceId,
      workspaceTimeZone.timeZone,
    );
    const { dateKey, record } = authoritative;
    const idempotencyKey = record.idempotency_key;

    const duplicateRows = await findRoutineCheckByIdempotencyKey(idempotencyKey);

    if (!Array.isArray(duplicateRows)) return readFailure("routine_checks");
    if (duplicateRows.length > 0) {
      return duplicateResponse(duplicateRows[0], dateKey);
    }

    const legacyDuplicate = await findLegacyRoutineCheck(
      authoritative.payload,
      workspaceTimeZone.timeZone,
    );
    if (legacyDuplicate.state === "read-failure") return readFailure("routine_checks");
    if (legacyDuplicate.state === "overflow") return legacyOverflowResponse();
    if (legacyDuplicate.rows.length > 0) {
      return duplicateResponse(legacyDuplicate.rows[0], dateKey);
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
          dateKey,
        );
      }

      if (isIdempotencyConflict(persistence)) {
        const winnerRows = await findRoutineCheckByIdempotencyKey(idempotencyKey);
        if (!Array.isArray(winnerRows)) return readFailure("routine_checks");
        if (winnerRows.length > 0) return duplicateResponse(winnerRows[0], dateKey);

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
        dateKey,
        localDate: dateKey,
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
