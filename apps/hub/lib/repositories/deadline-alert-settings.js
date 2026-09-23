import { eqFilter, fetchSupabaseRowsDetailed } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig, updateSupabaseRecord } from "@/lib/server-write";
import { collectLegacyDeadlines, readDeadlineAlertReset, weekStartDayKey } from "../deadline-alert-reset.js";

const READ_LIMIT = 1000;

async function readWorkspace(workspaceId) {
  const result = await fetchSupabaseRowsDetailed("workspaces", {
    select: "id,meta,updated_at",
    filters: [["id", eqFilter(workspaceId)]],
    limit: 1,
    strictRows: true,
  });
  return result.error || !result.rows?.[0]
    ? { error: result.error?.reason || "workspace-not-found" }
    : { row: result.rows[0] };
}

export async function getDeadlineAlertSettings() {
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId || !resolveSupabaseConfig()) return { status: "preview", reset: null };
  const result = await readWorkspace(workspaceId);
  if (result.error) return { status: "error", error: result.error, reset: null };
  return {
    status: "live",
    reset: readDeadlineAlertReset(result.row.meta),
    workspaceId,
    workspace: result.row,
  };
}

async function readLegacyRows(table, dateColumn, beforeDay, select, workspaceId) {
  const result = await fetchSupabaseRowsDetailed(table, {
    select,
    filters: [
      ["workspace_id", eqFilter(workspaceId)],
      [dateColumn, `lt.${beforeDay}T00:00:00+09:00`],
    ],
    count: "exact",
    limit: READ_LIMIT,
    strictRows: true,
  });
  if (result.error || !result.rows || result.rows.length === READ_LIMIT ||
      (Number.isFinite(result.count) && result.count > result.rows.length)) {
    return { error: result.error?.reason || `${table}-read-incomplete` };
  }
  return { rows: result.rows };
}

export async function saveDeadlineAlertReset(action, now = new Date()) {
  if (!["reset", "restore"].includes(action)) return { status: "invalid-input" };
  const settings = await getDeadlineAlertSettings();
  if (settings.status !== "live") return { status: "error", error: settings.error || "workspace-unavailable" };

  const { workspace, workspaceId } = settings;
  let reset = null;
  if (action === "reset") {
    const beforeDay = weekStartDayKey(now);
    const [tasks, deals, projects] = await Promise.all([
      readLegacyRows("tasks", "due_at", beforeDay, "id,status,due_at", workspaceId),
      readLegacyRows("deals", "expected_close_at", beforeDay, "id,stage,expected_close_at,meta", workspaceId),
      readLegacyRows("projects", "due_at", beforeDay, "id,status,due_at", workspaceId),
    ]);
    const error = tasks.error || deals.error || projects.error;
    if (error) return { status: "error", error };
    reset = {
      resetAt: now.toISOString(),
      beforeDay,
      items: collectLegacyDeadlines({ tasks: tasks.rows, deals: deals.rows, projects: projects.rows }, beforeDay),
    };
  }

  const meta = { ...(workspace.meta || {}) };
  if (reset) meta.deadline_alert_reset = reset;
  else delete meta.deadline_alert_reset;
  const saved = await updateSupabaseRecord("workspaces", [
    ["id", eqFilter(workspaceId)],
    ["updated_at", eqFilter(workspace.updated_at)],
  ], { meta }, { returnRepresentation: true, select: "id,meta,updated_at" });
  if (!saved.persisted) {
    return { status: saved.reason === "no-matching-row" ? "conflict" : "error", error: saved.reason };
  }
  return { status: "live", reset: readDeadlineAlertReset(saved.record?.meta) };
}
