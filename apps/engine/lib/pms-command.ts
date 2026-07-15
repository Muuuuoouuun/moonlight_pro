type CommandContext = {
  workspaceId?: string;
  ownerId?: string | null;
  now?: string;
};

type NormalizedCommand =
  | {
      ok: true;
      action: string;
      table: "projects" | "tasks";
      record?: Record<string, unknown>;
      filters?: Array<[string, string]>;
      patch?: Record<string, unknown>;
    }
  | { ok: false; reason: string };

const PROJECT_STATUSES = new Set(["draft", "active", "blocked", "completed", "archived"]);
const TASK_STATUSES = new Set(["inbox", "todo", "doing", "blocked", "done"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);
// PostgreSQL's uuid type accepts the full 8-4-4-4-12 hexadecimal form. The live
// workspace and brand seeds intentionally use readable non-RFC variant values.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength = 500) {
  return text(value, maxLength) || null;
}

function uuid(value: unknown) {
  const normalized = text(value, 100);
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function dateTime(value: unknown) {
  const normalized = text(value, 100);
  if (!normalized) return { ok: true, value: null };
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime())
    ? { ok: false, value: null }
    : { ok: true, value: parsed.toISOString() };
}

function has(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function progress(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export function normalizePmsCommand(
  input: Record<string, unknown> = {},
  context: CommandContext = {},
): NormalizedCommand {
  const action = text(input.action, 50).toLowerCase();
  const workspaceId = uuid(context.workspaceId);
  const ownerId = uuid(context.ownerId);
  const now = dateTime(context.now || new Date().toISOString());

  if (!workspaceId) return { ok: false, reason: "missing-workspace" };
  if (!now.ok || !now.value) return { ok: false, reason: "invalid-now" };

  if (action === "create_project") {
    const id = uuid(input.id);
    const title = text(input.title || input.name, 300);
    const brandId = uuid(input.brandId || input.brand_id);
    const status = text(input.status || "active", 30).toLowerCase();
    const priority = text(input.priority || "medium", 30).toLowerCase();
    const dueAt = dateTime(input.dueAt || input.due_at);
    const initialProgress = has(input, "progress") ? progress(input.progress) : 0;

    if (!id) return { ok: false, reason: "invalid-id" };
    if (!title) return { ok: false, reason: "missing-title" };
    if (!PROJECT_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
    if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
    if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };
    if (initialProgress === null) return { ok: false, reason: "invalid-progress" };

    return {
      ok: true,
      action,
      table: "projects",
      record: {
        id,
        workspace_id: workspaceId,
        brand_id: brandId,
        owner_id: ownerId,
        name: title,
        summary: nullableText(input.summary, 2000),
        status,
        priority,
        progress: initialProgress,
        next_action: nullableText(input.nextAction || input.next_action, 1000),
        due_at: dueAt.value,
        last_activity_at: now.value,
        meta: { source: text(input.source || "manual", 80) },
      },
    };
  }

  if (action === "create_task") {
    const id = uuid(input.id);
    const projectId = uuid(input.projectId || input.project_id);
    const title = text(input.title, 300);
    const status = text(input.status || "todo", 30).toLowerCase();
    const priority = text(input.priority || "medium", 30).toLowerCase();
    const dueAt = dateTime(input.dueAt || input.due_at);

    if (!id) return { ok: false, reason: "invalid-id" };
    if (!title) return { ok: false, reason: "missing-title" };
    if (!TASK_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
    if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
    if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };

    return {
      ok: true,
      action,
      table: "tasks",
      record: {
        id,
        workspace_id: workspaceId,
        project_id: projectId,
        owner_id: ownerId,
        title,
        status,
        priority,
        next_action: nullableText(input.nextAction || input.next_action, 1000),
        due_at: dueAt.value,
        completed_at: status === "done" ? now.value : null,
        meta: { source: text(input.source || "manual", 80) },
      },
    };
  }

  if (action === "update_task") {
    const id = uuid(input.id);
    if (!id) return { ok: false, reason: "invalid-id" };

    // Partial patch (same has()-gated shape as update_project below) — the existing
    // status-only completion path (Today board, checkbox toggle) keeps sending just
    // {id, status} and gets exactly the same {status, completed_at, updated_at} patch as
    // before. Title/priority/project/due are additive, for the 내 작업 detail drawer.
    const patch: Record<string, unknown> = {};
    if (has(input, "status")) {
      const status = text(input.status, 30).toLowerCase();
      if (!TASK_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
      patch.status = status;
      patch.completed_at = status === "done" ? now.value : null;
    }
    if (has(input, "title")) {
      const title = text(input.title, 300);
      if (!title) return { ok: false, reason: "missing-title" };
      patch.title = title;
    }
    if (has(input, "priority")) {
      const priority = text(input.priority, 30).toLowerCase();
      if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
      patch.priority = priority;
    }
    if (has(input, "projectId") || has(input, "project_id")) {
      patch.project_id = uuid(input.projectId || input.project_id);
    }
    if (has(input, "dueAt") || has(input, "due_at")) {
      const dueAt = dateTime(input.dueAt || input.due_at);
      if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };
      patch.due_at = dueAt.value;
    }

    if (Object.keys(patch).length === 0) return { ok: false, reason: "empty-patch" };
    patch.updated_at = now.value;

    return {
      ok: true,
      action,
      table: "tasks",
      filters: [
        ["id", `eq.${id}`],
        ["workspace_id", `eq.${workspaceId}`],
      ],
      patch,
    };
  }

  if (action === "update_project") {
    const id = uuid(input.id);
    if (!id) return { ok: false, reason: "invalid-id" };

    const patch: Record<string, unknown> = {};
    if (has(input, "brandId") || has(input, "brand_id")) {
      const brandId = uuid(input.brandId || input.brand_id);
      if (!brandId) return { ok: false, reason: "invalid-brand-id" };
      patch.brand_id = brandId;
    }
    if (has(input, "title") || has(input, "name")) {
      const title = text(input.title || input.name, 300);
      if (!title) return { ok: false, reason: "missing-title" };
      patch.name = title;
    }
    if (has(input, "summary")) patch.summary = nullableText(input.summary, 2000);
    if (has(input, "status")) {
      const status = text(input.status, 30).toLowerCase();
      if (!PROJECT_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
      patch.status = status;
      patch.completed_at = status === "completed" ? now.value : null;
    }
    if (has(input, "priority")) {
      const priority = text(input.priority, 30).toLowerCase();
      if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
      patch.priority = priority;
    }
    if (has(input, "progress")) {
      const normalizedProgress = progress(input.progress);
      if (normalizedProgress === null) return { ok: false, reason: "invalid-progress" };
      patch.progress = normalizedProgress;
    }
    if (has(input, "nextAction") || has(input, "next_action")) {
      patch.next_action = nullableText(input.nextAction || input.next_action, 1000);
    }
    if (has(input, "dueAt") || has(input, "due_at")) {
      const dueAt = dateTime(input.dueAt || input.due_at);
      if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };
      patch.due_at = dueAt.value;
    }

    if (Object.keys(patch).length === 0) return { ok: false, reason: "empty-patch" };
    patch.last_activity_at = now.value;
    patch.updated_at = now.value;

    return {
      ok: true,
      action,
      table: "projects",
      filters: [
        ["id", `eq.${id}`],
        ["workspace_id", `eq.${workspaceId}`],
      ],
      patch,
    };
  }

  return { ok: false, reason: "invalid-action" };
}
