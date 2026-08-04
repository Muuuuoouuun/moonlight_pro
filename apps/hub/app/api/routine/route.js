import { NextResponse } from "next/server";

import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { eqFilter, fetchSupabaseRows, withWorkspaceFilter } from "@/lib/server-read";
import { isCanonicalUuid } from "@/lib/uuid.js";
import {
  buildRoutineCheckRecord,
  deleteSupabaseRecord,
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
} from "@/lib/server-write";

export const runtime = "nodejs";

// Routine *definitions* (as opposed to check-in events, /api/routine/check).
// The schema has no separate "rituals" table (see work-ledger.js WHY comment) —
// a routine is defined by seeding a routine_checks row with status:'pending'
// and checked_at:null. work-ledger.js's mapRituals groups rows by
// (project_id, meta.ritual_key) regardless of status, so the seed row makes
// the routine appear in the Rhythm list at 0/7 before any check-in exists.
const CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const ROUTINE_ROW_SELECT = "id,project_id,check_type,meta";
const EDIT_ROW_LIMIT = 500;

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
    { status: "error", error: `${source} ledger read failed`, retryable: true },
    { status: 502 },
  );
}

async function assertProjectInWorkspace(projectId) {
  const rows = await fetchSupabaseRows("projects", {
    select: "id,name",
    limit: 2,
    filters: withWorkspaceFilter([["id", eqFilter(projectId)]]),
  });
  if (!Array.isArray(rows)) return { ok: false, readFailed: true };
  return { ok: rows.length === 1 };
}

function normalizeDefinePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: invalidInput("invalid-payload", "Routine define payload must be an object.") };
  }

  const ritualKey = cleanString(payload.ritualKey);
  const name = cleanString(payload.name);
  const checkType = cleanString(payload.checkType).toLowerCase();
  const projectId = cleanString(payload.projectId) || null;

  if (!ritualKey || ritualKey.length > 160) {
    return { error: invalidInput("invalid-ritual-key", "ritualKey is required and must be at most 160 characters.") };
  }
  if (!name || name.length > 200) {
    return { error: invalidInput("invalid-name", "name is required and must be at most 200 characters.") };
  }
  if (!CHECK_TYPES.has(checkType)) {
    return { error: invalidInput("invalid-check-type", "checkType must be morning, midday, evening, or weekly.") };
  }
  if (projectId && !isCanonicalUuid(projectId)) {
    return { error: invalidInput("invalid-project-id", "projectId must be a canonical UUID.") };
  }

  return { value: { ritualKey, name, checkType, projectId } };
}

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const normalized = normalizeDefinePayload(parsed.data);
    if (normalized.error) return normalized.error;

    const { ritualKey, name, checkType, projectId } = normalized.value;
    const workspaceId = resolveDefaultWorkspaceId();

    // 정의(씨앗) 행에는 idempotency_key를 절대 붙이지 않는다 — /api/routine/check가
    // (projectId, ritualKey, dateKey)만으로 중복 판정을 하므로, 같은 날 첫 체크인이 이
    // 씨앗 행과 idempotency_key가 겹쳐 "duplicate"로 오판될 수 있다.
    const record = {
      ...buildRoutineCheckRecord({ projectId, checkType, status: "pending", note: null, workspaceId }),
      meta: { ritual_key: ritualKey, name },
    };

    if (!workspaceId || !resolveSupabaseConfig()) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace or Supabase is not configured. This routine was not saved.",
          routine: record,
        },
        { status: 202 },
      );
    }

    if (projectId) {
      const check = await assertProjectInWorkspace(projectId);
      if (check.readFailed) return readFailure("projects");
      if (!check.ok) {
        return invalidInput("invalid-project-reference", "projectId must belong to the configured workspace.");
      }
    }

    const persistence = await insertSupabaseRecord("routine_checks", record, {
      returnRepresentation: true,
      select: "*",
    });

    if (!persistence.persisted) {
      if (persistence.reason === "missing-config") {
        return NextResponse.json(
          { status: "preview", message: "Supabase is not configured. This routine was not saved.", routine: record },
          { status: 202 },
        );
      }
      return NextResponse.json(
        {
          status: "error",
          error: persistence.detail || persistence.reason || "Routine define persistence failed.",
          retryable: true,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { status: "saved", message: "Routine saved to Supabase.", routine: persistence.record || record },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

function normalizeEditPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: invalidInput("invalid-payload", "Routine edit payload must be an object.") };
  }

  const ritualKey = cleanString(payload.ritualKey);
  if (!ritualKey) {
    return { error: invalidInput("invalid-ritual-key", "ritualKey is required to identify the routine.") };
  }

  const matchProjectId = cleanString(payload.matchProjectId) || null;
  if (matchProjectId && !isCanonicalUuid(matchProjectId)) {
    return { error: invalidInput("invalid-match-project-id", "matchProjectId must be a canonical UUID.") };
  }

  const result = { ritualKey, matchProjectId };

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = cleanString(payload.name);
    if (!name || name.length > 200) {
      return { error: invalidInput("invalid-name", "name must be 1–200 characters when provided.") };
    }
    result.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "checkType")) {
    const checkType = cleanString(payload.checkType).toLowerCase();
    if (!CHECK_TYPES.has(checkType)) {
      return { error: invalidInput("invalid-check-type", "checkType must be morning, midday, evening, or weekly.") };
    }
    result.checkType = checkType;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "projectId")) {
    const projectId = cleanString(payload.projectId) || null;
    if (projectId && !isCanonicalUuid(projectId)) {
      return { error: invalidInput("invalid-project-id", "projectId must be a canonical UUID.") };
    }
    result.projectId = projectId;
  }

  return { value: result };
}

export async function PATCH(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const normalized = normalizeEditPayload(parsed.data);
    if (normalized.error) return normalized.error;

    const { ritualKey, matchProjectId, name, checkType, projectId } = normalized.value;

    if (!resolveSupabaseConfig()) {
      return NextResponse.json(
        { status: "preview", message: "Supabase is not configured. This edit was not saved." },
        { status: 202 },
      );
    }

    if (Object.prototype.hasOwnProperty.call(normalized.value, "projectId") && projectId) {
      const check = await assertProjectInWorkspace(projectId);
      if (check.readFailed) return readFailure("projects");
      if (!check.ok) {
        return invalidInput("invalid-project-reference", "projectId must belong to the configured workspace.");
      }
    }

    // 같은 (project_id, ritual_key) 그룹의 모든 행을 찾아 각자의 meta를 보존하며 patch한다.
    // PostgREST PATCH는 컬럼 전체를 덮어쓰므로, meta는 행마다 개별 병합해야 다른 meta 필드
    // (예: local_date)를 지우지 않는다.
    const rows = await fetchSupabaseRows("routine_checks", {
      select: ROUTINE_ROW_SELECT,
      limit: EDIT_ROW_LIMIT + 1,
      filters: withWorkspaceFilter([
        ["project_id", matchProjectId ? eqFilter(matchProjectId) : "is.null"],
        [`meta->>ritual_key`, eqFilter(ritualKey)],
      ]),
    });

    if (!Array.isArray(rows)) return readFailure("routine_checks");
    if (rows.length === 0) {
      return NextResponse.json(
        { status: "not-found", error: "no-matching-routine", message: "No routine rows matched ritualKey/matchProjectId." },
        { status: 404 },
      );
    }
    if (rows.length > EDIT_ROW_LIMIT) {
      return NextResponse.json(
        {
          status: "error",
          error: "edit-candidate-overflow",
          message: `This routine has more than ${EDIT_ROW_LIMIT} check-ins; edit was refused to avoid a partial update.`,
          retryable: false,
        },
        { status: 502 },
      );
    }

    const results = await Promise.all(rows.map((row) => {
      const existingMeta = row.meta && typeof row.meta === "object" ? row.meta : {};
      const patch = {
        meta: { ...existingMeta, ritual_key: ritualKey, ...(name ? { name } : {}) },
      };
      if (checkType) patch.check_type = checkType;
      if (Object.prototype.hasOwnProperty.call(normalized.value, "projectId")) patch.project_id = projectId;

      return updateSupabaseRecord(
        "routine_checks",
        [["id", eqFilter(row.id)]],
        patch,
      );
    }));

    const failed = results.find((r) => !r.persisted);
    if (failed) {
      return NextResponse.json(
        {
          status: "error",
          error: failed.detail || failed.reason || "Routine edit persistence partially failed.",
          retryable: true,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { status: "saved", message: "Routine updated.", updated: rows.length },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

function normalizeDeletePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: invalidInput("invalid-payload", "Routine delete payload must be an object.") };
  }

  const ritualKey = cleanString(payload.ritualKey);
  if (!ritualKey) {
    return { error: invalidInput("invalid-ritual-key", "ritualKey is required to identify the routine.") };
  }

  const matchProjectId = cleanString(payload.matchProjectId) || null;
  if (matchProjectId && !isCanonicalUuid(matchProjectId)) {
    return { error: invalidInput("invalid-match-project-id", "matchProjectId must be a canonical UUID.") };
  }

  return { value: { ritualKey, matchProjectId } };
}

// 루틴 삭제 = 같은 (project_id, ritual_key) 그룹의 모든 routine_checks 행을 지운다 —
// 정의(씨앗) 행과 그 루틴의 모든 체크인 이력이 함께 사라진다. 부분 삭제는 없다: 필터가
// 매치하는 모든 행을 PostgREST가 단일 요청으로 지운다(PATCH처럼 행별 루프가 아님).
export async function DELETE(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) return guard;

    const parsed = await readHubWriteJson(req);
    if (parsed.error) return parsed.error;

    const normalized = normalizeDeletePayload(parsed.data);
    if (normalized.error) return normalized.error;

    const { ritualKey, matchProjectId } = normalized.value;

    if (!resolveSupabaseConfig()) {
      return NextResponse.json(
        { status: "preview", message: "Supabase is not configured. This delete was not saved." },
        { status: 202 },
      );
    }

    const filters = withWorkspaceFilter([
      ["project_id", matchProjectId ? eqFilter(matchProjectId) : "is.null"],
      [`meta->>ritual_key`, eqFilter(ritualKey)],
    ]);

    const rows = await fetchSupabaseRows("routine_checks", { select: "id", limit: EDIT_ROW_LIMIT + 1, filters });
    if (!Array.isArray(rows)) return readFailure("routine_checks");
    if (rows.length === 0) {
      return NextResponse.json(
        { status: "not-found", error: "no-matching-routine", message: "No routine rows matched ritualKey/matchProjectId." },
        { status: 404 },
      );
    }

    const persistence = await deleteSupabaseRecord("routine_checks", filters);
    if (!persistence.persisted) {
      return NextResponse.json(
        {
          status: "error",
          error: persistence.detail || persistence.reason || "Routine delete persistence failed.",
          retryable: true,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { status: "saved", message: "Routine deleted.", deleted: rows.length },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
