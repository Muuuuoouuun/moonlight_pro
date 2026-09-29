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
  deleteSupabaseRecord,
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";

export const runtime = "nodejs";

const CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const LEGACY_CANDIDATE_LIMIT = 100;
const LEGACY_SEMANTIC_META_FIELDS = ["ritual_key", "key", "name"];
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

function hasExplicitRoutineSemanticMetadata(row) {
  const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
  return LEGACY_SEMANTIC_META_FIELDS.some((field) => cleanString(meta[field]));
}

async function readLegacyCandidates(filters) {
  const candidates = await fetchSupabaseRows("routine_checks", {
    select: ROUTINE_CHECK_SELECT,
    limit: LEGACY_CANDIDATE_LIMIT + 1,
    order: "checked_at.desc",
    filters: withWorkspaceFilter(filters),
  });
  if (!Array.isArray(candidates)) return { state: "read-failure", rows: [] };
  if (candidates.length > LEGACY_CANDIDATE_LIMIT) return { state: "overflow", rows: [] };
  return { state: "ok", rows: candidates };
}

function legacyCandidateFilters({ projectId, dateKey }, semanticFilters) {
  const window = legacyCandidateWindow(dateKey);
  return [
    ["project_id", projectId ? eqFilter(projectId) : "is.null"],
    ...semanticFilters,
    ["status", eqFilter("done")],
    ["idempotency_key", "is.null"],
    ["checked_at", `gte.${window.start}`],
    ["checked_at", `lt.${window.end}`],
  ];
}

async function findLegacyRoutineCheck(payload, timeZone) {
  const { ritualKey, checkType, dateKey } = payload;
  const matchesIdentity = (row) => (
    routineSemanticKey(row) === ritualKey
    && routineLocalDateKey(row, timeZone) === dateKey
  );

  for (const metaField of LEGACY_SEMANTIC_META_FIELDS) {
    const explicit = await readLegacyCandidates(legacyCandidateFilters(payload, [
      [`meta->>${metaField}`, eqFilter(ritualKey)],
    ]));
    if (explicit.state !== "ok") return explicit;
    const duplicate = explicit.rows.find((row) => (
      hasExplicitRoutineSemanticMetadata(row) && matchesIdentity(row)
    ));
    if (duplicate) return { state: "ok", rows: [duplicate] };
  }

  const seedFallback = await readLegacyCandidates(legacyCandidateFilters(payload, [
    ["check_type", eqFilter(checkType)],
    ...LEGACY_SEMANTIC_META_FIELDS.map((field) => [`meta->>${field}`, "is.null"]),
  ]));
  if (seedFallback.state !== "ok") return seedFallback;
  return {
    state: "ok",
    rows: seedFallback.rows.filter((row) => (
      !hasExplicitRoutineSemanticMetadata(row) && matchesIdentity(row)
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

function undoNotFound(dateKey) {
  return NextResponse.json(
    { status: "not-found", message: "No check-in for the current local date.", dateKey, localDate: dateKey },
    { status: 404 },
  );
}

// 오늘 체크 취소. 체크는 (workspace, project, ritualKey, 워크스페이스 현지 날짜)당 한 행이라
// POST와 같은 멱등 키로 오늘 행을 찾아 지운다 — 날짜는 서버가 정하므로 어제 이전 기록은 이
// 경로로 지울 수 없다. 멱등 키가 없던 옛 행은 POST의 중복 판정과 같은 레거시 조회로 찾는다.
// 지울 행이 없으면 404 not-found — 클라이언트는 "이미 취소된 상태"로 읽고 다시 읽는다.
export async function DELETE(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const body = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
      ? { ...parsed.data, status: "done" }
      : parsed.data;
    const normalized = normalizePayload(body);
    if (normalized.error) return normalized.error;

    const payload = normalized.value;
    const workspaceId = resolveDefaultWorkspaceId();

    if (!workspaceId || !resolveSupabaseConfig()) {
      return NextResponse.json(
        { status: "preview", message: "Workspace or Supabase is not configured. This undo was not saved.", saved: false },
        { status: 202 },
      );
    }

    const workspaceTimeZone = await resolveWorkspaceTimeZone(workspaceId);
    if (!workspaceTimeZone.ok) return readFailure("workspaces timezone");

    const authoritative = buildAuthoritativeRecord(payload, workspaceId, workspaceTimeZone.timeZone);
    const { dateKey, record } = authoritative;

    const keyed = await findRoutineCheckByIdempotencyKey(record.idempotency_key);
    if (!Array.isArray(keyed)) return readFailure("routine_checks");

    let targets = keyed.filter((row) => row?.id && cleanString(row.status || "done") === "done");
    if (targets.length === 0) {
      const legacy = await findLegacyRoutineCheck(authoritative.payload, workspaceTimeZone.timeZone);
      if (legacy.state === "read-failure") return readFailure("routine_checks");
      if (legacy.state === "overflow") return legacyOverflowResponse();
      targets = legacy.rows.filter((row) => row?.id);
    }
    if (targets.length === 0) {
      // 루틴의 연결 프로젝트를 바꾸면 PATCH가 project_id만 옮기고 멱등 키는 옛 프로젝트로 남는다 —
      // 키로도, 키 없는 레거시 조회로도 오늘 행을 못 찾는다. 같은 루틴·같은 현지 날짜의 done 행을
      // 메타로 한 번 더 찾는다(날짜는 서버가 정한 오늘이므로 다른 날은 여전히 지울 수 없다).
      const moved = await fetchSupabaseRows("routine_checks", {
        select: ROUTINE_CHECK_SELECT,
        limit: 5,
        filters: withWorkspaceFilter([
          ["project_id", payload.projectId ? eqFilter(payload.projectId) : "is.null"],
          ["meta->>ritual_key", eqFilter(payload.ritualKey)],
          ["meta->>local_date", eqFilter(dateKey)],
          ["status", eqFilter("done")],
        ]),
      });
      if (!Array.isArray(moved)) return readFailure("routine_checks");
      targets = moved.filter((row) => row?.id);
    }

    if (targets.length === 0) return undoNotFound(dateKey);

    const ids = [...new Set(targets.map((row) => row.id))];
    const persistence = await deleteSupabaseRecord("routine_checks", withWorkspaceFilter([
      ["id", `in.(${ids.join(",")})`],
      ["status", eqFilter("done")],
    ]));
    // 동시에 들어온 다른 취소가 먼저 지웠다 — 실패가 아니라 "이미 취소됨"이다.
    if (persistence?.reason === "no-matching-row") return undoNotFound(dateKey);
    if (!persistence?.persisted) {
      return NextResponse.json(
        {
          status: "error",
          error: persistence?.detail || persistence?.reason || "Routine check undo persistence failed.",
          retryable: true,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { status: "saved", message: "Routine check removed.", deleted: ids.length, dateKey, localDate: dateKey },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
