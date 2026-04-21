interface SupabaseRestConfig {
  url: string;
  apiKey: string;
}

interface SupabaseQueryOptions {
  select?: string;
  filters?: Array<[string, string]>;
  limit?: number;
  order?: string;
}

function resolveSupabaseRestConfig(): SupabaseRestConfig | null {
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

function isOpaqueSupabaseApiKey(apiKey: string) {
  return apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_");
}

function makeHeaders(apiKey: string, options: { contentType?: string; prefer?: string } = {}) {
  const headers: Record<string, string> = {
    apikey: apiKey,
  };

  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }

  if (!isOpaqueSupabaseApiKey(apiKey)) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (options.prefer) {
    headers.prefer = options.prefer;
  }

  return headers;
}

function buildRestUrl(baseUrl: string, table: string, options: SupabaseQueryOptions = {}) {
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

function buildMutationUrl(baseUrl: string, table: string, filters: Array<[string, string]> = []) {
  const params = new URLSearchParams();

  filters.forEach(([key, value]) => {
    params.append(key, value);
  });

  const query = params.toString();
  return `${baseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

function extractCount(contentRange: string | null) {
  if (!contentRange) {
    return null;
  }

  const [, count] = contentRange.split("/");
  const parsed = Number.parseInt(count || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function inFilter(values: string[]) {
  return `in.(${values.join(",")})`;
}

export async function fetchSupabaseRows(table: string, options: SupabaseQueryOptions = {}) {
  const config = resolveSupabaseRestConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetch(buildRestUrl(config.url, table, options), {
      headers: makeHeaders(config.apiKey),
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

export async function countSupabaseRows(table: string, filters: Array<[string, string]> = []) {
  const config = resolveSupabaseRestConfig();

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
          ...makeHeaders(config.apiKey, { prefer: "count=exact" }),
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

export async function insertSupabaseRecord(table: string, record: Record<string, unknown>) {
  const config = resolveSupabaseRestConfig();

  if (!config) {
    return {
      persisted: false,
      reason: "missing-config",
    };
  }

  try {
    const response = await fetch(buildMutationUrl(config.url, table), {
      method: "POST",
      headers: makeHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: "return=minimal",
      }),
      body: JSON.stringify(record),
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

export async function updateSupabaseRecord(
  table: string,
  filters: Array<[string, string]>,
  record: Record<string, unknown>,
) {
  const config = resolveSupabaseRestConfig();

  if (!config) {
    return {
      persisted: false,
      reason: "missing-config",
    };
  }

  if (!filters.length) {
    return {
      persisted: false,
      reason: "missing-filters",
    };
  }

  try {
    const response = await fetch(buildMutationUrl(config.url, table, filters), {
      method: "PATCH",
      headers: makeHeaders(config.apiKey, {
        contentType: "application/json",
        prefer: "return=minimal",
      }),
      body: JSON.stringify(record),
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
