import { makeSupabaseHeaders, resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";

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

function extractCount(contentRange) {
  if (!contentRange) {
    return null;
  }

  const [, count] = contentRange.split("/");
  const parsed = Number.parseInt(count || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function eqFilter(value) {
  return `eq.${value}`;
}

export function inFilter(values) {
  return `in.(${values.join(",")})`;
}

export function withWorkspaceFilter(filters = []) {
  const workspaceId = resolveDefaultWorkspaceId();
  return workspaceId ? [["workspace_id", eqFilter(workspaceId)], ...filters] : filters;
}

export async function fetchSupabaseRows(table, options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetch(buildRestUrl(config.url, table, options), {
      headers: makeSupabaseHeaders(config.apiKey),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchSupabaseRowsWithState(
  table,
  options = {},
  { fetchImpl = fetch } = {},
) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return { state: "preview", rows: [] };
  }

  let response;
  try {
    response = await fetchImpl(buildRestUrl(config.url, table, options), {
      headers: makeSupabaseHeaders(config.apiKey),
      cache: "no-store",
    });
  } catch {
    return { state: "error", rows: [], errorCode: "request-failed" };
  }

  if (!response.ok) {
    return { state: "error", rows: [], errorCode: `http-${response.status}` };
  }

  try {
    const rows = await response.json();
    return Array.isArray(rows)
      ? { state: "live", rows }
      : { state: "error", rows: [], errorCode: "invalid-json" };
  } catch {
    return { state: "error", rows: [], errorCode: "invalid-json" };
  }
}

export async function countSupabaseRows(table, filters = []) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetch(
      buildRestUrl(config.url, table, {
        select: "id",
        filters,
        limit: 1,
      }),
      {
        headers: {
          ...makeSupabaseHeaders(config.apiKey, { prefer: "count=exact" }),
          Range: "0-0",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return extractCount(response.headers.get("content-range"));
  } catch {
    return null;
  }
}
