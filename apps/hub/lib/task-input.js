const TASK_STATUSES = new Set(["inbox", "todo", "doing", "blocked", "done"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

function text(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optional(value, maxLength) {
  return text(value, maxLength) || null;
}

function dueAt(value) {
  const normalized = text(value);

  if (!normalized) {
    return { ok: true, value: null };
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return { ok: false, value: null };
  }

  return { ok: true, value: date.toISOString() };
}

export function normalizeTaskInput(input = {}, workspaceId = "") {
  const workspace = text(workspaceId);

  if (!workspace) {
    return { ok: false, reason: "missing-workspace" };
  }

  const title = text(input.title, 300);

  if (!title) {
    return { ok: false, reason: "missing-title" };
  }

  const status = text(input.status || "todo").toLowerCase();
  const priority = text(input.priority || "medium").toLowerCase();

  if (!TASK_STATUSES.has(status)) {
    return { ok: false, reason: "invalid-status" };
  }

  if (!TASK_PRIORITIES.has(priority)) {
    return { ok: false, reason: "invalid-priority" };
  }

  const normalizedDueAt = dueAt(input.dueAt || input.due_at);

  if (!normalizedDueAt.ok) {
    return { ok: false, reason: "invalid-due-at" };
  }

  return {
    ok: true,
    record: {
      workspace_id: workspace,
      project_id: optional(input.projectId || input.project_id, 100),
      area_id: optional(input.areaId || input.area_id, 100),
      title,
      status,
      priority,
      next_action: optional(input.nextAction || input.next_action, 1000),
      due_at: normalizedDueAt.value,
      meta: {
        source: text(input.source || "manual", 80),
      },
    },
  };
}
