// Hub write layer — persistence delegates to the shared @com-moon/supabase-rest
// client; this module keeps the hub-specific record builders and the engine
// webhook bridge.
export {
  deleteSupabaseRecord,
  insertSupabaseRecord,
  invokeSupabaseRpc,
  makeSupabaseHeaders,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
  upsertSupabaseRecords,
} from "@com-moon/supabase-rest";

import { resolveDefaultWorkspaceId } from "@com-moon/supabase-rest";

const PROJECT_UPDATE_STATUSES = new Set(["reported", "active", "blocked", "done"]);
const ROUTINE_CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const ROUTINE_CHECK_STATUSES = new Set(["pending", "done", "skipped", "blocked"]);
const SHARED_WEBHOOK_SECRET_HEADER = "x-com-moon-shared-secret";
const PROJECT_WEBHOOK_TARGETS = new Set(["generic", "moltbot"]);

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || "").replace(/\/$/, "");
}

function resolveSharedWebhookSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || "";
}

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeProgress(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(100, parsed));
}

function normalizeProjectStatus(value) {
  const normalized = normalizeString(value, "reported").toLowerCase();

  if (["in progress", "in_progress", "doing", "active"].includes(normalized)) {
    return "active";
  }

  if (["completed", "complete", "done"].includes(normalized)) {
    return "done";
  }

  if (["draft", "planned", "planning", "review", "backlog", "queued", "pending"].includes(normalized)) {
    return "reported";
  }

  return PROJECT_UPDATE_STATUSES.has(normalized) ? normalized : "reported";
}

function normalizeCheckType(value) {
  const normalized = normalizeString(value, "midday").toLowerCase();
  return ROUTINE_CHECK_TYPES.has(normalized) ? normalized : "midday";
}

function normalizeCheckStatus(value) {
  const normalized = normalizeString(value, "pending").toLowerCase();
  return ROUTINE_CHECK_STATUSES.has(normalized) ? normalized : "pending";
}

function normalizeWebhookTarget(value) {
  const normalized = normalizeString(value, "generic").toLowerCase();
  return PROJECT_WEBHOOK_TARGETS.has(normalized) ? normalized : "generic";
}

function resolveProjectWebhookPath(target) {
  if (target === "moltbot") {
    return `/api/webhook/project/${target}`;
  }

  return "/api/webhook/project";
}

function buildProjectWebhookRequestBody(payload, target) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const projectId = normalizeNullableString(payload.projectId);
  const title = normalizeString(payload.title, "Webhook smoke test");
  const summary = normalizeNullableString(payload.summary);
  const status = normalizeProjectStatus(payload.status);
  const progress = normalizeProgress(payload.progress);
  const milestone = normalizeNullableString(payload.milestone);
  const nextAction = normalizeNullableString(payload.nextAction);
  const checkType = normalizeNullableString(payload.checkType);

  if (target === "moltbot") {
    return {
      meta: {
        workspaceId,
        provider: target,
        source: "hub-smoke-test",
      },
      project: {
        id: projectId,
        title,
        status,
        progress,
        milestone,
        nextAction,
      },
      event: {
        type: `project.${target}.smoke-test`,
        summary,
        note: `Smoke test fired from Hub OS into ${target}.`,
      },
      check: {
        checkType,
      },
      payload: {
        origin: "hub-webhook-test",
        route: target,
      },
    };
  }

  return {
    workspaceId,
    projectId,
    title,
    summary,
    status,
    progress,
    milestone,
    nextAction,
    checkType,
    provider: "hub-smoke-test",
    source: "hub",
    eventType: "project.progress",
    payload: {
      origin: "hub-webhook-test",
    },
  };
}

export function buildProjectUpdateRecord(payload) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();

  return {
    workspace_id: workspaceId || null,
    project_id: normalizeNullableString(payload.projectId),
    source: "hub",
    event_type: normalizeString(payload.eventType, "manual.progress"),
    status: normalizeProjectStatus(payload.status),
    title: normalizeString(payload.title, "Quick project update"),
    summary: normalizeNullableString(payload.summary),
    progress: normalizeProgress(payload.progress),
    milestone: normalizeNullableString(payload.milestone),
    next_action: normalizeNullableString(payload.nextAction),
    payload: {
      origin: "hub",
      capture_mode: "manual",
    },
    happened_at: new Date().toISOString(),
  };
}

export function buildRoutineCheckRecord(payload) {
  const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
  const status = normalizeCheckStatus(payload.status);
  const timestamp = new Date().toISOString();

  return {
    workspace_id: workspaceId || null,
    project_id: normalizeNullableString(payload.projectId),
    check_type: normalizeCheckType(payload.checkType),
    status,
    note: normalizeNullableString(payload.note),
    checked_at: status === "done" ? timestamp : null,
  };
}

export async function sendProjectWebhook(payload) {
  const engineUrl = resolveEngineUrl();
  const target = normalizeWebhookTarget(payload.targetRoute);
  const routePath = resolveProjectWebhookPath(target);

  if (!engineUrl) {
    return {
      sent: false,
      reason: "missing-engine-url",
      target: null,
    };
  }

  const headers = {
    "content-type": "application/json",
  };

  const sharedSecret = resolveSharedWebhookSecret();
  if (sharedSecret) {
    headers[SHARED_WEBHOOK_SECRET_HEADER] = sharedSecret;
  }

  const response = await fetch(`${engineUrl}${routePath}`, {
    method: "POST",
    headers,
    body: JSON.stringify(buildProjectWebhookRequestBody(payload, target)),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  return {
    sent: response.ok,
    statusCode: response.status,
    target: `${engineUrl}${routePath}`,
    targetRoute: target,
    data,
  };
}
