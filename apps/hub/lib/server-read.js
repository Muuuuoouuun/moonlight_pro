import { makeSupabaseHeaders, resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";

function buildRestUrl(baseUrl, table, options = {}) {
  const { select = "*", filters = [], limit, offset, order } = options;
  const params = new URLSearchParams();

  params.set("select", select);

  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  if (typeof offset === "number" && offset > 0) {
    params.set("offset", String(offset));
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

export async function fetchSupabaseRows(table, options = {}, { fetchImpl = fetch } = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetchImpl(buildRestUrl(config.url, table, options), {
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

function pageSignature(rows) {
  if (!rows.length) return "empty";
  return JSON.stringify(rows.map((row) => row?.id ?? row));
}

function postgrestLiteral(value) {
  const literal = String(value ?? "");
  return /[(),"]/u.test(literal)
    ? `"${literal.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    : literal;
}

function buildKeysetFilter(lastRow, keyset) {
  const field = keyset?.field;
  const tieBreaker = keyset?.tieBreaker;
  const direction = keyset?.direction === "asc" ? "asc" : "desc";
  if (!/^[a-z_][a-z0-9_]*$/iu.test(field || "") || !/^[a-z_][a-z0-9_]*$/iu.test(tieBreaker || "")) {
    return null;
  }
  const fieldValue = lastRow?.[field];
  const tieValue = lastRow?.[tieBreaker];
  if (fieldValue === undefined || fieldValue === null || tieValue === undefined || tieValue === null) {
    return null;
  }
  const comparison = direction === "asc" ? "gt" : "lt";
  const primary = postgrestLiteral(fieldValue);
  const tie = postgrestLiteral(tieValue);
  return [
    "or",
    `(${field}.${comparison}.${primary},and(${field}.eq.${primary},${tieBreaker}.${comparison}.${tie}))`,
  ];
}

export async function fetchAllSupabaseRows(
  table,
  options = {},
  { fetchImpl = fetch, pageSize = 500 } = {},
) {
  if (typeof options.limit === "number") {
    return fetchSupabaseRows(table, options, { fetchImpl });
  }

  const size = Math.max(1, Math.floor(pageSize));
  const rows = [];
  const seenPages = new Set();
  const seenIds = new Set();
  let offset = 0;
  let keysetFilter = null;
  for (;;) {
    const page = await fetchSupabaseRows(table, {
      ...options,
      limit: size,
      filters: [...(options.filters || []), ...(keysetFilter ? [keysetFilter] : [])],
      ...(!options.keyset && offset > 0 ? { offset } : {}),
    }, { fetchImpl });
    if (!Array.isArray(page)) return null;
    const signature = pageSignature(page);
    if (page.length && seenPages.has(signature)) return null;
    seenPages.add(signature);
    if (options.keyset && page.some((row) => row?.id && seenIds.has(row.id))) return null;
    page.forEach((row) => { if (row?.id) seenIds.add(row.id); });
    rows.push(...page);
    if (page.length < size) return rows;
    if (options.keyset) {
      keysetFilter = buildKeysetFilter(page.at(-1), options.keyset);
      if (!keysetFilter) return null;
    } else {
      offset += size;
    }
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

export async function fetchAllSupabaseRowsWithState(
  table,
  options = {},
  { fetchImpl = fetch, pageSize = 500 } = {},
) {
  if (typeof options.limit === "number") {
    return fetchSupabaseRowsWithState(table, options, { fetchImpl });
  }

  const size = Math.max(1, Math.floor(pageSize));
  const rows = [];
  const seenPages = new Set();
  const seenIds = new Set();
  let offset = 0;
  let keysetFilter = null;
  for (;;) {
    const page = await fetchSupabaseRowsWithState(table, {
      ...options,
      limit: size,
      filters: [...(options.filters || []), ...(keysetFilter ? [keysetFilter] : [])],
      ...(!options.keyset && offset > 0 ? { offset } : {}),
    }, { fetchImpl });
    if (page.state !== "live") return { ...page, rows: [] };
    const signature = pageSignature(page.rows);
    if (page.rows.length && seenPages.has(signature)) {
      return { state: "error", rows: [], errorCode: "pagination-loop" };
    }
    seenPages.add(signature);
    if (options.keyset && page.rows.some((row) => row?.id && seenIds.has(row.id))) {
      return { state: "error", rows: [], errorCode: "pagination-overlap" };
    }
    page.rows.forEach((row) => { if (row?.id) seenIds.add(row.id); });
    rows.push(...page.rows);
    if (page.rows.length < size) return { state: "live", rows };
    if (options.keyset) {
      keysetFilter = buildKeysetFilter(page.rows.at(-1), options.keyset);
      if (!keysetFilter) return { state: "error", rows: [], errorCode: "pagination-cursor" };
    } else {
      offset += size;
    }
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
