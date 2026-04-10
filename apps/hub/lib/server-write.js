const PROJECT_UPDATE_STATUSES = new Set(["reported", "active", "blocked", "done"]);
const ROUTINE_CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const ROUTINE_CHECK_STATUSES = new Set(["pending", "done", "skipped", "blocked"]);

function resolveSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !apiKey) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    apiKey,
  };
}

export function resolveDefaultWorkspaceId() {
  return (
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    ""
  );
}

function resolveEngineUrl(override) {
  return (
    override?.trim() ||
    process.env.COM_MOON_ENGINE_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
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

export async function insertSupabaseRecord(table, record) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return {
      persisted: false,
      reason: "missing-config",
    };
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: config.apiKey,
        authorization: `Bearer ${config.apiKey}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify(record),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        persisted: false,
        reason: `http-${response.status}`,
        detail,
      };
    }

    return {
      persisted: true,
      reason: "ok",
    };
  } catch (error) {
    return {
      persisted: false,
      reason: "request-failed",
      detail: String(error),
    };
  }
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
  const engineUrl = resolveEngineUrl(payload.engineUrl);

  if (!engineUrl) {
    return {
      sent: false,
      reason: "missing-engine-url",
      target: null,
    };
  }

  const response = await fetch(`${engineUrl}/api/webhook/project`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workspaceId: normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId(),
      projectId: normalizeNullableString(payload.projectId),
      title: normalizeString(payload.title, "Webhook smoke test"),
      summary: normalizeNullableString(payload.summary),
      status: normalizeProjectStatus(payload.status),
      progress: normalizeProgress(payload.progress),
      milestone: normalizeNullableString(payload.milestone),
      nextAction: normalizeNullableString(payload.nextAction),
      checkType: normalizeNullableString(payload.checkType),
      provider: "hub-smoke-test",
      source: "hub",
      eventType: "project.progress",
      payload: {
        origin: "hub-webhook-test",
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  return {
    sent: response.ok,
    statusCode: response.status,
    target: `${engineUrl}/api/webhook/project`,
    data,
  };
}
