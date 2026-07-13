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

export type SupabaseRpcFailureReason =
  | "missing-config"
  | "timeout"
  | "not-found"
  | "forbidden"
  | "invalid"
  | "invalid-transition"
  | "upstream";

type SupabaseRpcErrorOptions = {
  httpStatus?: number;
  metadata?: unknown;
  cause?: unknown;
};

type SupabaseRpcOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class SupabaseRpcError extends Error {
  readonly reason: SupabaseRpcFailureReason;
  readonly httpStatus?: number;
  readonly metadata?: unknown;

  constructor(
    reason: SupabaseRpcFailureReason,
    message: string,
    options: SupabaseRpcErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SupabaseRpcError";
    this.reason = reason;
    this.httpStatus = options.httpStatus;
    this.metadata = options.metadata;
  }
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

function resolveSupabaseRpcConfig(): SupabaseRestConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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

function parseRpcResponseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { body: text };
  }
}

function rpcErrorMessage(metadata: unknown, fallback: string) {
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    typeof (metadata as Record<string, unknown>).message === "string"
  ) {
    return (metadata as Record<string, string>).message;
  }

  return fallback;
}

function classifyRpcFailure(httpStatus: number, metadata: unknown): SupabaseRpcFailureReason {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const code = typeof record?.code === "string" ? record.code : "";
  const message = typeof record?.message === "string" ? record.message.toLowerCase() : "";

  if (httpStatus === 404 || code === "P0002") {
    return "not-found";
  }

  if (httpStatus === 403 || code === "42501") {
    return "forbidden";
  }

  if (message.includes("transition")) {
    return "invalid-transition";
  }

  if (httpStatus === 400 || httpStatus === 422 || code.startsWith("22")) {
    return "invalid";
  }

  return "upstream";
}

export async function callSupabaseRpc<T>(
  name: string,
  args: Record<string, unknown>,
  options: SupabaseRpcOptions = {},
): Promise<T> {
  const config = resolveSupabaseRpcConfig();

  if (!config) {
    throw new SupabaseRpcError(
      "missing-config",
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for RPC writes.",
    );
  }

  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `${config.url}/rest/v1/rpc/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: makeHeaders(config.apiKey, {
          contentType: "application/json",
          prefer: "return=representation",
        }),
        body: JSON.stringify(args),
        signal: controller.signal,
      },
    );
    const text = await response.text();
    const body = parseRpcResponseBody(text);

    if (!response.ok) {
      const reason = classifyRpcFailure(response.status, body);
      throw new SupabaseRpcError(
        reason,
        rpcErrorMessage(body, `Supabase RPC failed with HTTP ${response.status}.`),
        { httpStatus: response.status, metadata: body },
      );
    }

    if (text && body && typeof body === "object" && "body" in body) {
      throw new SupabaseRpcError("upstream", "Supabase RPC returned invalid JSON.", {
        httpStatus: response.status,
        metadata: body,
      });
    }

    return body as T;
  } catch (error) {
    if (error instanceof SupabaseRpcError) {
      throw error;
    }

    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new SupabaseRpcError("timeout", `Supabase RPC timed out after ${timeoutMs}ms.`, {
        cause: error,
      });
    }

    throw new SupabaseRpcError("upstream", "Supabase RPC request failed.", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function inFilter(values: string[]) {
  return `in.(${values.join(",")})`;
}

export async function checkSupabaseRest(table = "projects") {
  const config = resolveSupabaseRestConfig();

  if (!config) {
    return {
      configured: false,
      reachable: false,
      status: null,
      reason: "missing-config",
    };
  }

  try {
    const response = await fetch(buildRestUrl(config.url, table, {
      select: "id",
      limit: 1,
    }), {
      headers: makeHeaders(config.apiKey),
      cache: "no-store",
    });

    return {
      configured: true,
      reachable: response.ok,
      status: response.status,
      reason: response.ok ? "ok" : `http-${response.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
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
      const isDuplicate =
        response.status === 409 &&
        (detail.includes("23505") ||
          detail.includes("duplicate key value") ||
          detail.includes("idx_webhook_events_provider_event"));

      return {
        persisted: false,
        reason: isDuplicate ? "duplicate" : `http-${response.status}`,
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
