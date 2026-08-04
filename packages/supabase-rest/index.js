// @com-moon/supabase-rest — the single Supabase PostgREST client for hub, engine,
// and gateway. Plain ESM JS so node-run tests and Next (both apps) can load it
// without a build step; types live in index.d.ts.
//
// Contracts preserved from the four implementations this replaces:
// - Reads return `null` when Supabase is not configured OR the request fails
//   (callers render preview/empty states on null) — but failures are now logged.
// - Writes return `{ persisted, reason, detail?, record?, records?, id? }` with
//   reason codes: ok | missing-config | missing-filter | duplicate | timeout |
//   http-<status> | request-failed | no-matching-row.
// - `cache: "no-store"` on every request (Next patches global fetch).
//
// New over the replaced copies: request timeouts, bulk insert/upsert, in-flight
// GET dedup (concurrent identical reads share one HTTP request), error logging.

const DEFAULT_TIMEOUT_MS = 10_000;

export function resolveSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
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

export function eqFilter(value) {
  return `eq.${value}`;
}

export function inFilter(values) {
  return `in.(${values.join(",")})`;
}

// in.() with PostgREST double-quoting — safe for values containing commas,
// parens, or quotes (e.g. free-text match keys). Prefer this over inFilter for
// any value that isn't a UUID/enum you control.
export function inFilterQuoted(values) {
  const quoted = values.map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);
  return `in.(${quoted.join(",")})`;
}

export function withWorkspaceFilter(filters = []) {
  const workspaceId = resolveDefaultWorkspaceId();
  return workspaceId ? [["workspace_id", eqFilter(workspaceId)], ...filters] : filters;
}

function buildRestUrl(baseUrl, table, options = {}) {
  const { select = "*", filters = [], limit, order } = options;
  const params = new URLSearchParams();

  params.set("select", select);

  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  if (order) {
    params.set("order", order);
  }

  filters.forEach(([key, value]) => {
    params.append(key, value);
  });

  return `${baseUrl}/rest/v1/${table}?${params.toString()}`;
}

function buildMutationUrl(baseUrl, table, filters = [], extraParams = []) {
  const params = new URLSearchParams();

  extraParams.forEach(([key, value]) => {
    params.append(key, value);
  });

  filters.forEach(([key, value]) => {
    params.append(key, value);
  });

  const query = params.toString();
  return `${baseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

function extractCount(contentRange) {
  if (!contentRange) {
    return null;
  }

  const [, count] = contentRange.split("/");
  const parsed = Number.parseInt(count || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTimeoutMs(timeoutMs) {
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }

  const fromEnv = Number.parseInt(process.env.SUPABASE_REST_TIMEOUT_MS || "", 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
}

function logSupabaseFailure(op, table, reason, detail = "") {
  // "missing-config" is the expected local/preview state and "duplicate" is a
  // normal idempotency outcome — neither is worth log noise.
  if (reason === "missing-config" || reason === "duplicate") {
    return;
  }

  const trimmed = typeof detail === "string" ? detail.slice(0, 200) : "";
  console.error(`[supabase-rest] ${op} ${table} failed (${reason})${trimmed ? `: ${trimmed}` : ""}`);
}

function isTimeoutError(error) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

// Executes one HTTP call against PostgREST and normalizes the outcome. Never throws.
async function supabaseFetch(op, table, url, { method = "GET", headers, body, timeoutMs } = {}) {
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(resolveTimeoutMs(timeoutMs)),
    });

    const text = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      text,
      contentRange: response.headers.get("content-range"),
    };
  } catch (error) {
    const reason = isTimeoutError(error) ? "timeout" : "request-failed";
    return {
      ok: false,
      status: null,
      text: String(error),
      contentRange: null,
      failureReason: reason,
    };
  }
}

function parseRows(text) {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Reads
// ============================================================================

// Concurrent identical GETs share one HTTP request. Each consumer parses the
// response text independently, so no rows array is ever shared across callers.
const inflightReads = new Map();

async function dedupedRead(url, request) {
  const existing = inflightReads.get(url);
  if (existing) {
    return existing;
  }

  const promise = request().finally(() => {
    inflightReads.delete(url);
  });
  inflightReads.set(url, promise);
  return promise;
}

export async function fetchSupabaseRowsDetailed(table, options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return { rows: null, count: null, configured: false, error: null };
  }

  // count: "exact" returns the total row count of the filtered set alongside the
  // (limited) rows in one request, via the Content-Range header.
  const withCount = options.count === "exact";
  const url = buildRestUrl(config.url, table, options);
  const request = () =>
    supabaseFetch("select", table, url, {
      headers: makeSupabaseHeaders(config.apiKey, withCount ? { prefer: "count=exact" } : {}),
      timeoutMs: options.timeoutMs,
    });

  const result = options.dedupe === false || withCount
    ? await request()
    : await dedupedRead(url, request);

  if (!result.ok) {
    const reason = result.failureReason || `http-${result.status}`;
    logSupabaseFailure("select", table, reason, result.text);
    return {
      rows: null,
      count: null,
      configured: true,
      error: { reason, status: result.status, detail: result.text },
    };
  }

  return {
    rows: parseRows(result.text) ?? [],
    count: withCount ? extractCount(result.contentRange) : null,
    configured: true,
    error: null,
  };
}

export async function fetchSupabaseRows(table, options = {}) {
  const { rows } = await fetchSupabaseRowsDetailed(table, options);
  return rows;
}

export async function countSupabaseRows(table, filters = [], options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  const url = buildRestUrl(config.url, table, { select: "id", filters, limit: 1 });
  const result = await supabaseFetch("count", table, url, {
    headers: {
      ...makeSupabaseHeaders(config.apiKey, { prefer: "count=exact" }),
      Range: "0-0",
    },
    timeoutMs: options.timeoutMs,
  });

  if (!result.ok) {
    logSupabaseFailure("count", table, result.failureReason || `http-${result.status}`, result.text);
    return null;
  }

  return extractCount(result.contentRange);
}

// ============================================================================
// Writes
// ============================================================================

function isDuplicateViolation(status, detail) {
  return (
    status === 409 &&
    (detail.includes("23505") || detail.includes("duplicate key value"))
  );
}

function buildWriteResult(result, { returnRepresentation, bulk }) {
  if (!result.ok) {
    const reason = result.failureReason
      || (isDuplicateViolation(result.status, result.text) ? "duplicate" : `http-${result.status}`);
    return {
      persisted: false,
      reason,
      detail: result.text,
    };
  }

  if (!returnRepresentation) {
    return { persisted: true, reason: "ok" };
  }

  const rows = parseRows(result.text) || [];
  const row = rows[0] || null;

  if (bulk) {
    return {
      persisted: true,
      reason: "ok",
      records: rows,
      record: row,
      id: row?.id || null,
    };
  }

  return {
    persisted: true,
    reason: "ok",
    record: row,
    id: row?.id || null,
  };
}

export async function insertSupabaseRecord(table, record, options = {}) {
  const config = resolveSupabaseConfig();
  const returnRepresentation = options.returnRepresentation === true;
  const select = typeof options.select === "string" && options.select.trim() ? options.select.trim() : "";
  const bulk = Array.isArray(record);

  if (!config) {
    return { persisted: false, reason: "missing-config" };
  }

  if (bulk && record.length === 0) {
    return { persisted: true, reason: "ok", records: [] };
  }

  const extraParams = returnRepresentation && select ? [["select", select]] : [];
  const url = buildMutationUrl(config.url, table, [], extraParams);
  const result = await supabaseFetch("insert", table, url, {
    method: "POST",
    headers: makeSupabaseHeaders(config.apiKey, {
      contentType: "application/json",
      prefer: returnRepresentation ? "return=representation" : "return=minimal",
    }),
    body: JSON.stringify(record),
    timeoutMs: options.timeoutMs,
  });

  const outcome = buildWriteResult(result, { returnRepresentation, bulk });
  if (!outcome.persisted) {
    logSupabaseFailure("insert", table, outcome.reason, outcome.detail);
  }
  return outcome;
}

// Bulk INSERT ... ON CONFLICT (onConflict) DO UPDATE of the provided columns.
// Rows that hit the conflict target are patched with only the columns present in
// `records`; new rows are inserted. `ignoreDuplicates: true` switches to DO NOTHING.
export async function upsertSupabaseRecords(table, records, options = {}) {
  const config = resolveSupabaseConfig();
  const rows = Array.isArray(records) ? records : [records];
  const returnRepresentation = options.returnRepresentation === true;
  const select = typeof options.select === "string" && options.select.trim() ? options.select.trim() : "";

  if (!config) {
    return { persisted: false, reason: "missing-config" };
  }

  if (rows.length === 0) {
    return { persisted: true, reason: "ok", records: [] };
  }

  const resolution = options.ignoreDuplicates === true ? "ignore-duplicates" : "merge-duplicates";
  const preferParts = [`resolution=${resolution}`, returnRepresentation ? "return=representation" : "return=minimal"];
  const extraParams = [];
  if (options.onConflict) {
    extraParams.push(["on_conflict", options.onConflict]);
  }
  if (returnRepresentation && select) {
    extraParams.push(["select", select]);
  }

  const url = buildMutationUrl(config.url, table, [], extraParams);
  const result = await supabaseFetch("upsert", table, url, {
    method: "POST",
    headers: makeSupabaseHeaders(config.apiKey, {
      contentType: "application/json",
      prefer: preferParts.join(","),
    }),
    body: JSON.stringify(rows),
    timeoutMs: options.timeoutMs,
  });

  const outcome = buildWriteResult(result, { returnRepresentation, bulk: true });
  if (!outcome.persisted) {
    logSupabaseFailure("upsert", table, outcome.reason, outcome.detail);
  }
  return outcome;
}

export async function updateSupabaseRecord(table, filters = [], record = {}, options = {}) {
  const config = resolveSupabaseConfig();
  const returnRepresentation = options.returnRepresentation === true;
  const select = typeof options.select === "string" && options.select.trim() ? options.select.trim() : "";

  if (!config) {
    return { persisted: false, reason: "missing-config" };
  }

  if (!Array.isArray(filters) || filters.length === 0) {
    // Refuse an unfiltered PATCH — that would rewrite the whole table.
    return { persisted: false, reason: "missing-filter" };
  }

  const extraParams = returnRepresentation && select ? [["select", select]] : [];
  const url = buildMutationUrl(config.url, table, filters, extraParams);
  const result = await supabaseFetch("update", table, url, {
    method: "PATCH",
    headers: makeSupabaseHeaders(config.apiKey, {
      contentType: "application/json",
      prefer: returnRepresentation ? "return=representation" : "return=minimal",
    }),
    body: JSON.stringify(record),
    timeoutMs: options.timeoutMs,
  });

  if (result.ok && returnRepresentation) {
    const rows = parseRows(result.text) || [];
    const row = rows[0] || null;
    return {
      persisted: Boolean(row),
      reason: row ? "ok" : "no-matching-row",
      record: row,
      id: row?.id || null,
      records: rows,
    };
  }

  const outcome = buildWriteResult(result, { returnRepresentation: false, bulk: false });
  if (!outcome.persisted) {
    logSupabaseFailure("update", table, outcome.reason, outcome.detail);
  }
  return outcome;
}

export async function deleteSupabaseRecord(table, filters = [], options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return { persisted: false, reason: "missing-config" };
  }

  if (!Array.isArray(filters) || filters.length === 0) {
    // Refuse an unfiltered DELETE — that would wipe the whole table.
    return { persisted: false, reason: "missing-filter" };
  }

  const url = buildMutationUrl(config.url, table, filters);
  const result = await supabaseFetch("delete", table, url, {
    method: "DELETE",
    headers: makeSupabaseHeaders(config.apiKey, { prefer: "return=minimal" }),
    timeoutMs: options.timeoutMs,
  });

  const outcome = buildWriteResult(result, { returnRepresentation: false, bulk: false });
  if (!outcome.persisted) {
    logSupabaseFailure("delete", table, outcome.reason, outcome.detail);
  }
  return outcome;
}

// PostgREST RPC compatibility for command-style routes. Keeping this in the
// shared client lets Hub and Engine use the same config, auth and timeout
// semantics after the backend client consolidation.
export async function invokeSupabaseRpc(name, params = {}, options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return { ok: false, status: null, error: "missing-config" };
  }

  const url = `${config.url}/rest/v1/rpc/${encodeURIComponent(name)}`;
  const result = await supabaseFetch("rpc", name, url, {
    method: "POST",
    headers: makeSupabaseHeaders(config.apiKey, { contentType: "application/json" }),
    body: JSON.stringify(params),
    timeoutMs: options.timeoutMs,
  });

  if (!result.ok) {
    const error = result.failureReason || `http-${result.status}`;
    let detail = result.text;
    try {
      const parsed = JSON.parse(result.text || "{}");
      detail = typeof parsed?.message === "string" ? parsed.message : result.text;
    } catch {
      // Keep the bounded raw response as diagnostic detail.
    }
    logSupabaseFailure("rpc", name, error, detail);
    return { ok: false, status: result.status, error, detail };
  }

  let data = null;
  try {
    data = result.text ? JSON.parse(result.text) : null;
  } catch {
    data = result.text;
  }
  return { ok: true, status: result.status, data };
}

// ============================================================================
// Health
// ============================================================================

export async function checkSupabaseRest(table = "projects", options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return {
      configured: false,
      reachable: false,
      status: null,
      reason: "missing-config",
    };
  }

  const url = buildRestUrl(config.url, table, { select: "id", limit: 1 });
  const result = await supabaseFetch("health", table, url, {
    headers: makeSupabaseHeaders(config.apiKey),
    timeoutMs: options.timeoutMs ?? 5_000,
  });

  return {
    configured: true,
    reachable: result.ok,
    status: result.status,
    reason: result.ok ? "ok" : result.failureReason || `http-${result.status}`,
  };
}
