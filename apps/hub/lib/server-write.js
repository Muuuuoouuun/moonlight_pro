const PROJECT_UPDATE_STATUSES = new Set(["reported", "active", "blocked", "done"]);
const ROUTINE_CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const ROUTINE_CHECK_STATUSES = new Set(["pending", "done", "skipped", "blocked"]);
const SHARED_WEBHOOK_SECRET_HEADER = "x-com-moon-shared-secret";
const PROJECT_WEBHOOK_TARGETS = new Set(["generic", "openclaw", "moltbot"]);

export function resolveSupabaseConfig() {
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

function isOpaqueSupabaseApiKey(apiKey) {
  return apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_");
}

export function makeSupabaseHeaders(apiKey, { contentType, prefer } = {}) {
  const headers = {
    apikey: apiKey,
  };

  if (contentType) {
    headers["content-type"] = contentType;
  }

  if (!isOpaqueSupabaseApiKey(apiKey)) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (prefer) {
    headers.prefer = prefer;
  }

  return headers;
}

export function resolveDefaultWorkspaceId() {
  return (
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    ""
  );
}

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
  if (target === "openclaw" || target === "moltbot") {
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

  if (target === "openclaw" || target === "moltbot") {
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

// Insert a row. Default behavior (no options) is unchanged: Prefer: return=minimal and a
// bare { persisted, reason } envelope — 15+ callsites rely on this. Pass
// { returnRepresentation: true, select } to switch to Prefer: return=representation, parse
// the inserted row, and get { persisted, reason, id, record } back (used by the Revenue
// write path so a create can adopt the DB-assigned id).
export async function insertSupabaseRecord(table, record, options = {}) {
  const config = resolveSupabaseConfig();
  const returnRepresentation = options.returnRepresentation === true;
  const select = typeof options.select === "string" && options.select.trim()
    ? options.select.trim()
    : "";

  if (!config) {
    return {
      persisted: false,
      reason: "missing-config",
    };
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}${returnRepresentation && select ? `?select=${encodeURIComponent(select)}` : ""}`, {
      method: "POST",
      headers: makeSupabaseHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: returnRepresentation ? "return=representation" : "return=minimal",
      }),
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

    if (returnRepresentation) {
      const rows = await response.json().catch(() => null);
      const row = Array.isArray(rows) ? rows[0] || null : null;
      return {
        persisted: true,
        reason: "ok",
        record: row,
        id: row?.id || null,
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

function buildFilterQuery(filters = []) {
  const params = new URLSearchParams();

  filters.forEach(([key, value]) => {
    params.append(key, value);
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

// Update rows matching `filters`. Default behavior (no options) is unchanged: Prefer:
// return=minimal and a bare { persisted, reason } envelope — existing callsites rely on it.
// Pass { returnRepresentation: true, select } to switch to Prefer: return=representation:
// the `select` is prepended as a query filter, the affected row is parsed, and
// { persisted, reason, id, record } comes back (persisted:false + 'no-matching-row' when the
// filter matched nothing). The separate updateSupabaseRecordReturning helper below is left
// intact for the work-orders guarded-transition path.
export async function updateSupabaseRecord(table, filters = [], record = {}, options = {}) {
  const config = resolveSupabaseConfig();
  const returnRepresentation = options.returnRepresentation === true;
  const select = typeof options.select === "string" && options.select.trim()
    ? options.select.trim()
    : "";

  if (!config) {
    return {
      persisted: false,
      reason: "missing-config",
    };
  }

  try {
    const queryFilters = [...filters];
    if (returnRepresentation && select) {
      queryFilters.unshift(["select", select]);
    }

    const response = await fetch(`${config.url}/rest/v1/${table}${buildFilterQuery(queryFilters)}`, {
      method: "PATCH",
      headers: makeSupabaseHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: returnRepresentation ? "return=representation" : "return=minimal",
      }),
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

    if (returnRepresentation) {
      const rows = await response.json().catch(() => null);
      const row = Array.isArray(rows) ? rows[0] || null : null;
      return {
        persisted: Boolean(row),
        reason: row ? "ok" : "no-matching-row",
        record: row,
        id: row?.id || null,
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

// PATCH variant that returns the affected rows (Prefer: return=representation).
// Callers use the returned array to know whether a guarded transition actually won
// (empty array = no row matched the filter). On success returns an array (possibly
// empty); on failure returns { error, detail }.
export async function updateSupabaseRecordReturning(table, filters = [], record = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return { error: "missing-config" };
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}${buildFilterQuery(filters)}`, {
      method: "PATCH",
      headers: makeSupabaseHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: "return=representation",
      }),
      body: JSON.stringify(record),
      cache: "no-store",
    });

    if (!response.ok) {
      return { error: `http-${response.status}`, detail: await response.text().catch(() => "") };
    }

    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return { error: "request-failed", detail: String(error) };
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
