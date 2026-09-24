import { deliveryDraft, validateDelivery, completionIssue, dayKey } from "../../../packages/project-delivery/index.ts";

import { MAX_FOCUS_PER_DAY, normalizePmsCommand, zonedDateKey } from "./pms-command.ts";
import type { TaskFocusToggle } from "./pms-command.ts";

type PersistenceResult = {
  persisted: boolean;
  reason: string;
  detail?: string;
  record?: Record<string, unknown> | null;
  id?: string | null;
  records?: Array<Record<string, unknown>>;
};

type RowReadResult =
  | { ok: true; rows: Array<Record<string, unknown>> }
  | { ok: false; reason: string; detail?: string };

type Dependencies = {
  insert: (table: string, record: Record<string, unknown>) => Promise<PersistenceResult>;
  update: (
    table: string,
    filters: Array<[string, string]>,
    patch: Record<string, unknown>,
  ) => Promise<PersistenceResult>;
  fetchRows: (
    table: string,
    options?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>> | null>;
  fetchRowsDetailed?: (
    table: string,
    options?: Record<string, unknown>,
  ) => Promise<RowReadResult>;
};

type CommandContext = {
  workspaceId?: string;
  ownerId?: string | null;
  now?: string;
};

function comparableTimestamp(value: unknown) {
  if (typeof value !== "string" || !value) return value ?? null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function canonicalCreatePayload(action: string, row: Record<string, unknown>) {
  const meta = row.meta && typeof row.meta === "object"
    ? row.meta as Record<string, unknown>
    : {};

  if (action === "create_project") {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      area_id: row.area_id ?? null,
      brand_id: row.brand_id ?? null,
      lead_id: row.lead_id ?? null,
      customer_account_id: row.customer_account_id ?? null,
      name: row.name,
      summary: row.summary ?? null,
      status: row.status,
      priority: row.priority,
      progress: row.progress ?? 0,
      next_action: row.next_action ?? null,
      due_at: comparableTimestamp(row.due_at),
      delivery: meta.delivery ?? null,
      org_scope: meta.org_scope ?? null,
      origin_deal_id: meta.origin_deal_id ?? null,
      source: meta.source ?? null,
    };
  }

  if (action === "create_task") {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      project_id: row.project_id ?? null,
      deal_id: meta.deal_id ?? null,
      item_type: meta.item_type ?? "task",
      // JSONB can reorder object keys; item order itself remains meaningful.
      checklist: Array.isArray(meta.checklist)
        ? meta.checklist.map((item) => item && typeof item === "object"
          ? { id: item.id, title: item.title, done: item.done, note: item.note ?? "", ...(item.dueAt ? { dueAt: item.dueAt } : {}) }
          : item)
        : meta.checklist ?? [],
      title: row.title,
      status: row.status,
      priority: row.priority,
      description: row.description ?? null,
      next_action: row.next_action ?? null,
      due_at: comparableTimestamp(row.due_at),
      source: meta.source ?? null,
    };
  }

  if (action === "create_brand") {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      category: meta.category ?? null,
      org_scope: meta.org_scope ?? null,
      source: meta.source ?? null,
      glyph: meta.glyph ?? null,
    };
  }

  return null;
}

function sameCanonicalCreatePayload(
  action: string,
  requested: Record<string, unknown>,
  existing: Record<string, unknown>,
) {
  const requestedPayload = canonicalCreatePayload(action, requested);
  const existingPayload = canonicalCreatePayload(action, existing);
  return requestedPayload !== null &&
    JSON.stringify(requestedPayload) === JSON.stringify(existingPayload);
}

function filterValue(filters: Array<[string, string]> | undefined, key: string) {
  const value = filters?.find(([filterKey]) => filterKey === key)?.[1];
  return value?.startsWith("eq.") ? value.slice(3) : null;
}

function isDatabaseFocusLimit(detail: string | undefined) {
  if (!detail) return false;
  try {
    const error = JSON.parse(detail);
    return error?.code === "P0001" && error?.message === "focus-limit";
  } catch {
    return false;
  }
}

// 오늘 Top 3 — meta.focus_dates(고른 날짜의 이력)에 하루를 넣거나 뺀다. 넣을 때만 같은 날짜를
// 고른 다른 할 일 수를 세어 MAX_FOCUS_PER_DAY를 넘기지 않는다. 배열 자체는 클라이언트가
// 보내지 않으므로 지난 날의 선택은 절대 지워지지 않는다(2026-09-20 §6.2: 소급 변동 방지).
async function applyFocusToggle(
  toggle: TaskFocusToggle,
  input: {
    taskId: string;
    workspaceFilters: Array<[string, string]>;
    meta: Record<string, unknown>;
    now?: string;
    fetchRows: Dependencies["fetchRows"];
  },
): Promise<{ ok: true; focusDates: string[] } | { ok: false; error: Record<string, unknown> }> {
  const date = toggle.date || zonedDateKey(input.now ? new Date(input.now) : new Date());
  if (!date) return { ok: false, error: { status: "error", error: "focus-date-unresolved" } };
  const current = Array.isArray(input.meta.focus_dates)
    ? (input.meta.focus_dates as unknown[]).filter((value): value is string => typeof value === "string")
    : [];

  if (!toggle.on) return { ok: true, focusDates: current.filter((day) => day !== date) };
  if (current.includes(date)) return { ok: true, focusDates: current };
  // 상한 조회는 반드시 워크스페이스로 좁힌다 — 필터 없이 세면 다른 워크스페이스의 선택까지
  // 세어 버린다. 워크스페이스를 모르면 쓰지 않고 닫는다(fail closed).
  if (!input.workspaceFilters.length) return { ok: false, error: { status: "error", error: "missing-workspace" } };

  // PostgREST jsonb containment: meta->focus_dates @> '["2026-09-21"]'.
  const others = await input.fetchRows("tasks", {
    select: "id",
    filters: [...input.workspaceFilters, ["meta->focus_dates", `cs.${JSON.stringify([date])}`]],
    limit: MAX_FOCUS_PER_DAY + 1,
  });
  if (others === null) return { ok: false, error: { status: "error", error: "focus-count-read-failed" } };
  const otherCount = others.filter((row) => String(row.id) !== input.taskId).length;
  if (otherCount >= MAX_FOCUS_PER_DAY) {
    return {
      ok: false,
      error: { status: "conflict", error: "focus-limit", retryable: false, limit: MAX_FOCUS_PER_DAY, date },
    };
  }
  return { ok: true, focusDates: [...current, date].sort() };
}

async function validateRelationship(
  command: Extract<ReturnType<typeof normalizePmsCommand>, { ok: true }>,
  dependencies: Dependencies,
) {
  const values = command.record || command.patch || {};
  const workspaceId = typeof command.record?.workspace_id === "string"
    ? command.record.workspace_id
    : filterValue(command.filters, "workspace_id");
  const relationships = command.table === "projects"
    ? [
        ["area_id", "areas", "invalid-reference"],
        ["brand_id", "brands", "invalid-brand-reference"],
        ["lead_id", "leads", "invalid-reference"],
        ["customer_account_id", "customer_accounts", "invalid-reference"],
      ].flatMap(([column, table, error]) => (
        typeof values[column] === "string"
          ? [{ table, id: values[column] as string, error }]
          : []
      ))
    : command.table === "tasks" && typeof values.project_id === "string"
      ? [{ table: "projects", id: values.project_id, error: "invalid-project-reference" }]
      : [];

  if (!relationships.length || !workspaceId) return null;

  for (const relationship of relationships) {
    const options = {
      select: "id",
      filters: [
        ["id", `eq.${relationship.id}`],
        ["workspace_id", `eq.${workspaceId}`],
      ] as Array<[string, string]>,
      limit: 1,
    };
    const detailed = dependencies.fetchRowsDetailed
      ? await dependencies.fetchRowsDetailed(relationship.table, options)
      : null;
    if (detailed && !detailed.ok) {
      if (detailed.reason === "missing-config") {
        return { status: "error", error: "missing-config" };
      }
      return {
        status: "error",
        error: "relationship-check-failed",
        detail: detailed.reason,
      };
    }
    const rows = detailed?.ok
      ? detailed.rows
      : await dependencies.fetchRows(relationship.table, options);
    if (rows === null) {
      return command.table === "projects"
        ? { status: "error", error: "reference-lookup-unavailable" }
        : { status: "error", error: "relationship-check-failed" };
    }
    if (!rows[0]) return { status: "invalid-input", error: relationship.error };
  }
  return null;
}

export async function executePmsCommand(
  input: Record<string, unknown>,
  context: CommandContext,
  dependencies: Dependencies,
) {
  const command = normalizePmsCommand(input, context);
  if (!command.ok) {
    return { status: "invalid-input", error: command.reason };
  }

  const relationshipError = await validateRelationship(command, dependencies);
  if (relationshipError) return relationshipError;

  if (command.record) {
    const persistence = await dependencies.insert(command.table, command.record);
    if (!persistence.persisted) {
      if (persistence.reason === "duplicate") {
        const existing = await dependencies.fetchRows(command.table, {
          filters: [
            ["id", `eq.${command.record.id}`],
            ["workspace_id", `eq.${command.record.workspace_id}`],
          ],
          limit: 1,
        });
        if (existing?.[0]) {
          if (!sameCanonicalCreatePayload(command.action, command.record, existing[0])) {
            return {
              status: "conflict",
              action: command.action,
              error: "id-reuse-payload-mismatch",
              retryable: false,
              entity: existing[0],
            };
          }
          return {
            status: "duplicate",
            action: command.action,
            entity: existing[0],
          };
        }
      }
      return {
        status: "error",
        error: persistence.reason,
        detail: persistence.detail || null,
      };
    }

    return {
      status: "saved",
      action: command.action,
      entity: persistence.record || command.record,
    };
  }

  if (command.filters && command.patch) {
    if (command.table === "brands" && command.patch.meta) {
      const identityFilters = command.filters.filter(([key]) => key === "id" || key === "workspace_id");
      const rows = await dependencies.fetchRows("brands", { filters: identityFilters, limit: 1 });
      if (rows === null) return { status: "error", error: "current-entity-read-failed" };
      if (!rows[0]) return { status: "error", error: "not-found" };
      const current = rows[0];
      if (!current.updated_at) return { status: "error", error: "missing-brand-version" };
      const expected = filterValue(command.filters, "updated_at");
      if (expected && comparableTimestamp(expected) !== comparableTimestamp(current.updated_at)) {
        return { status: "conflict", error: "stale-update", entity: current };
      }
      const meta = current.meta && typeof current.meta === "object" ? current.meta as Record<string, unknown> : {};
      command.patch.meta = { ...meta, ...command.patch.meta as Record<string, unknown> };
      command.patch.updated_at ||= context.now || new Date().toISOString();
      if (!expected) command.filters.push(["updated_at", `eq.${current.updated_at}`]);
    }
    // Read + compare-and-swap protects the metadata merge and schedule history.
    if (command.table === "projects" && (command.patch.meta || "due_at" in command.patch || command.patch.status === "completed")) {
      const identityFilters = command.filters.filter(([key]) => key === "id" || key === "workspace_id");
      const rows = await dependencies.fetchRows("projects", { filters: identityFilters, limit: 1 });
      if (rows === null) return { status: "error", error: "current-entity-read-failed" };
      if (!rows[0]) return { status: "error", error: "not-found" };
      const current = rows[0];
      const expected = filterValue(command.filters, "updated_at");
      if (expected && expected !== current.updated_at) return { status: "conflict", error: "stale-update", entity: current };
      const meta = (current.meta || {}) as Record<string, any>;
      const previous = meta.delivery;
      const supplied = (command.patch.meta as Record<string, any> | undefined)?.delivery;
      if (previous || supplied || input.deliveryEvent) {
        if (!current.updated_at) return { status: "error", error: "missing-project-version" };
        const plan = deliveryDraft(supplied || previous);
        const dueAt = "due_at" in command.patch ? command.patch.due_at : current.due_at;
        const issue = validateDelivery(plan, dueAt);
        if (issue) return { status: "invalid-input", error: issue };
        const now = String(command.patch.updated_at);
        const delivery = { ...previous, ...plan, originalDueAt: previous?.originalDueAt ?? current.due_at ?? dueAt ?? null,
          history: Array.isArray(previous?.history) ? [...previous.history] : [] };
        if (dayKey(dueAt) !== dayKey(current.due_at)) {
          const reason = typeof input.scheduleReason === "string" ? input.scheduleReason.trim().slice(0, 1000) : "";
          if (current.due_at && !reason) return { status: "invalid-input", error: "목표 종료일 변경 이유를 남겨주세요." };
          delivery.history.push({ at: now, from: current.due_at ?? null, to: dueAt ?? null, reason: reason || "첫 종료일 설정" });
        }
        if (input.deliveryEvent === "start") {
          if (!plan.deliverable || !plan.criteria.length) return { status: "invalid-input", error: "결과물과 완료 조건을 먼저 정하세요." };
          if (current.status === "completed" || current.status === "archived") return { status: "invalid-input", error: "프로젝트를 먼저 다시 열어주세요." };
          command.patch.started_at = current.started_at || now;
          command.patch.status = "active";
        }
        if (input.deliveryEvent === "prototype") {
          if (current.status === "completed" || current.status === "archived") return { status: "invalid-input", error: "프로젝트를 먼저 다시 열어주세요." };
          if (!current.started_at) return { status: "invalid-input", error: "실제 착수를 먼저 기록하세요." };
          if (!plan.resultUrl) return { status: "invalid-input", error: "작동을 확인한 결과물 링크를 남겨주세요." };
          delivery.prototypeVerifiedAt = previous?.prototypeVerifiedAt || now;
        }
        if (input.deliveryEvent === "pause" || input.deliveryEvent === "resume") {
          if (current.status === "completed" || current.status === "archived") return { status: "invalid-input", error: "프로젝트를 먼저 다시 열어주세요." };
          if (input.deliveryEvent === "pause" && !plan.blocker) return { status: "invalid-input", error: "병목에 보류 이유를 남겨주세요." };
          if (input.deliveryEvent === "resume" && plan.blocker) return { status: "invalid-input", error: "병목을 해결하거나 다음 버전으로 옮긴 뒤 다시 진행하세요." };
          delivery.pausedAt = input.deliveryEvent === "pause" ? now : null;
          command.patch.status = input.deliveryEvent === "pause" ? "blocked" : current.started_at ? "active" : "draft";
        }
        // A changed artifact or acceptance contract needs a fresh verification.
        if (previous && (plan.resultUrl !== previous.resultUrl || plan.deliverable !== previous.deliverable ||
          JSON.stringify(plan.criteria.map(({ id, text }) => ({ id, text }))) !== JSON.stringify((previous.criteria || []).map(({ id, text }: any) => ({ id, text }))))) {
          delivery.prototypeVerifiedAt = input.deliveryEvent === "prototype" ? now : null;
        }
        if (command.patch.status === "completed" || current.status === "completed") {
          const issue = completionIssue(plan, delivery.prototypeVerifiedAt);
          if (issue) return { status: "invalid-input", error: issue };
          if (current.status === "completed") command.patch.completed_at = current.completed_at;
        }
        command.patch.meta = { ...meta, ...(command.patch.meta as Record<string, unknown> | undefined), delivery };
        if (supplied) command.patch.next_action = plan.nextAction || null;
        if (!expected) command.filters.push(["updated_at", `eq.${current.updated_at}`]);
      } else if (command.patch.meta) {
        // Plain meta keys (genre) merge into the stored metadata under the same version guard —
        // a bare patch would replace org_scope, source and every other key.
        if (!current.updated_at) return { status: "error", error: "missing-project-version" };
        command.patch.meta = { ...meta, ...(command.patch.meta as Record<string, unknown>) };
        if (!expected) command.filters.push(["updated_at", `eq.${current.updated_at}`]);
      }
    }
    if (command.table === "tasks" && (command.patch.meta || command.focus)) {
      const options = {
        filters: command.filters.filter(([key]) => key === "id" || key === "workspace_id"),
        limit: 1,
      };
      const detailed = dependencies.fetchRowsDetailed
        ? await dependencies.fetchRowsDetailed("tasks", options)
        : null;
      if (detailed && !detailed.ok) {
        return { status: "error", error: detailed.reason === "missing-config" ? "missing-config" : "task-metadata-read-failed" };
      }
      const rows = detailed?.ok ? detailed.rows : await dependencies.fetchRows("tasks", options);
      if (rows === null) return { status: "error", error: "task-metadata-read-failed" };
      if (!rows[0]) return { status: "error", error: "not-found" };
      const meta = rows[0].meta ?? {};
      if (typeof meta !== "object" || Array.isArray(meta)) return { status: "error", error: "invalid-task-metadata" };
      // A focus toggle merges a persisted JSON object. Guard that merge even when the caller
      // did not supply a version; otherwise two overlapping toggles of this task can each
      // return saved while the second PATCH discards the first date.
      if (command.focus && !filterValue(command.filters, "updated_at")) {
        if (!rows[0].updated_at) return { status: "error", error: "missing-task-version" };
        command.filters.push(["updated_at", `eq.${rows[0].updated_at}`]);
      }
      let metaPatch = (command.patch.meta as Record<string, unknown> | undefined) ?? {};
      if (command.focus) {
        const focus = await applyFocusToggle(command.focus, {
          taskId: String(rows[0].id ?? filterValue(command.filters, "id") ?? ""),
          workspaceFilters: command.filters.filter(([key]) => key === "workspace_id"),
          meta: meta as Record<string, unknown>,
          now: context.now,
          fetchRows: dependencies.fetchRows,
        });
        if (!focus.ok) return { ...focus.error, action: command.action };
        metaPatch = { ...metaPatch, focus_dates: focus.focusDates };
      }
      command.patch.meta = { ...meta, ...metaPatch };
    }
    const persistence = await dependencies.update(command.table, command.filters, command.patch);
    if (!persistence.persisted && persistence.reason !== "no-matching-row") {
      if (command.focus && isDatabaseFocusLimit(persistence.detail)) {
        return {
          status: "conflict",
          action: command.action,
          error: "focus-limit",
          retryable: false,
          limit: MAX_FOCUS_PER_DAY,
          date: command.focus.date || zonedDateKey(context.now || new Date()),
        };
      }
      return {
        status: "error",
        error: persistence.reason,
        detail: persistence.detail || null,
      };
    }

    // supabase-rest는 0행 PATCH를 {persisted:false, reason:"no-matching-row", records:[]}로
    // 반환한다 — 여기서 502로 끊으면 stale-409 재기동/404 분기가 프로덕션에서 죽는다
    // (2026-08-05 재감사 안정성 M).
    if (Array.isArray(persistence.records)) {
      if (!persistence.records[0]) {
        if (filterValue(command.filters, "updated_at")) {
          const identityFilters = command.filters.filter(
            ([key]) => key === "id" || key === "workspace_id",
          );
          const current = await dependencies.fetchRows(command.table, {
            filters: identityFilters,
            limit: 1,
          });
          if (current === null) {
            return {
              status: "error",
              action: command.action,
              error: "current-entity-read-failed",
            };
          }
          if (!current[0]) {
            return {
              status: "error",
              action: command.action,
              error: "not-found",
            };
          }
          return {
            status: "conflict",
            action: command.action,
            error: "stale-update",
            retryable: false,
            entity: current[0],
          };
        }
        return {
          status: "error",
          action: command.action,
          error: "not-found",
        };
      }

      return {
        status: "saved",
        action: command.action,
        entity: persistence.records[0],
      };
    }

    return {
      status: "saved",
      action: command.action,
      entity: {
        id: input.id,
        ...command.patch,
      },
    };
  }

  return { status: "error", error: "unsupported-command-shape" };
}
