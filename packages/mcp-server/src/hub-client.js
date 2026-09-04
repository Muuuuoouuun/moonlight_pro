// Thin HTTP adapter over the existing Hub read API (apps/hub/app/api/hub/*) and the
// Google Calendar write route. Every call here hits a route that already has its own
// honest preview/live/error response taxonomy — this file does not invent new status
// semantics, it just forwards them to the MCP tool layer.
//
// It does classify *transport* outcomes, though (see `kind`). Before that classification
// existed, a dead Hub surfaced to the caller as a bare "fetch failed" and an HTTP 401/500
// surfaced as a successful tool result. Both are failures the tool layer must be able to
// tell apart from a route's honest `preview`.

const DEFAULT_TIMEOUT_MS = 60_000;

function resolveHubUrl() {
  const url = process.env.COM_MOON_HUB_URL?.trim() || "http://localhost:3000";
  return url.replace(/\/$/, "");
}

function resolveWriteSecret() {
  return process.env.COM_MOON_HUB_WRITE_SECRET?.trim() || "";
}

function resolveTimeoutMs() {
  const raw = Number.parseInt(process.env.COM_MOON_MCP_TIMEOUT_MS || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

// Node's fetch throws `TypeError: fetch failed` and hides the real reason on `.cause`.
// Unwrap it so the operator gets the actual code instead of the generic wrapper.
export function describeTransportFailure(error, { base, method, path, timeoutMs }) {
  const inner = error?.cause;
  const code = inner?.code || error?.code || (error?.name === "TimeoutError" ? "ETIMEDOUT" : null);
  const detail = inner?.message || error?.message || String(error);
  const where = `${method} ${path}`;

  if (error?.name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
    return (
      `Hub(${base}) 요청이 ${timeoutMs}ms 안에 끝나지 않았습니다 — ${where}. ` +
      `Hub가 응답하지 않거나 요청이 너무 무겁습니다. COM_MOON_MCP_TIMEOUT_MS로 한도를 늘릴 수 있습니다.`
    );
  }

  if (code === "ECONNREFUSED") {
    return (
      `Hub(${base})에 연결할 수 없습니다 (ECONNREFUSED) — ${where}. ` +
      `Hub 개발 서버가 떠 있지 않습니다. 'npm run dev:hub'로 먼저 띄우세요. ` +
      `이 MCP 서버는 Hub의 HTTP API를 부르는 어댑터라서 Hub 없이는 어떤 도구도 동작하지 않습니다.`
    );
  }

  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return (
      `Hub 주소(${base})의 호스트를 찾을 수 없습니다 (${code}) — ${where}. ` +
      `COM_MOON_HUB_URL 값을 확인하세요.`
    );
  }

  return `Hub(${base}) 요청이 실패했습니다 — ${where}. 원인: ${detail}${code ? ` (${code})` : ""}`;
}

function describeHttpFailure({ base, method, path, httpStatus, data, hasSecret }) {
  const routeStatus = typeof data?.status === "string" ? data.status : null;
  const routeError = typeof data?.error === "string" ? data.error : null;
  const lines = [`Hub 요청 실패 (HTTP ${httpStatus}) — ${method} ${path} @ ${base}`];

  if (routeStatus) {
    lines.push(`라우트 status: ${routeStatus}`);
  }
  if (routeError) {
    lines.push(`원인: ${routeError}`);
  }

  if (httpStatus === 401 || httpStatus === 403) {
    lines.push(
      hasSecret
        ? "조치: 이 MCP 서버의 COM_MOON_HUB_WRITE_SECRET이 Hub의 값과 같은지 확인하세요."
        : "조치: COM_MOON_HUB_WRITE_SECRET이 설정되어 있지 않습니다. Hub와 같은 값을 설정하세요.",
    );
  }
  if (data?.retryable === true) {
    lines.push("이 오류는 재시도 가능합니다 (retryable).");
  }

  return lines.join("\n");
}

function describeRouteError({ base, method, path, data }) {
  const lines = [`Hub 라우트가 오류를 보고했습니다 — ${method} ${path} @ ${base}`];

  if (typeof data?.error === "string") {
    lines.push(`원인: ${data.error}`);
  }
  if (data?.retryable === true) {
    lines.push("이 오류는 재시도 가능합니다 (retryable).");
  }

  return lines.join("\n");
}

async function hubFetch(path, { method = "GET", body, query } = {}) {
  const base = resolveHubUrl();
  const url = new URL(path, `${base}/`);
  const timeoutMs = resolveTimeoutMs();

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const headers = { "content-type": "application/json" };
  const secret = resolveWriteSecret();

  if (secret && method !== "GET") {
    headers.authorization = `Bearer ${secret}`;
  }

  let response;

  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // The Hub was never reached. This is the case that used to read as "fetch failed".
    return {
      ok: false,
      kind: "unreachable",
      httpStatus: 0,
      data: null,
      error: describeTransportFailure(error, { base, method, path, timeoutMs }),
    };
  }

  const text = await response.text();
  let data = null;
  let parseFailed = false;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    parseFailed = true;
    data = { status: "error", error: `Non-JSON response (${response.status}): ${text.slice(0, 200)}` };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: "http-error",
      httpStatus: response.status,
      data,
      error: describeHttpFailure({
        base,
        method,
        path,
        httpStatus: response.status,
        data,
        hasSecret: Boolean(secret),
      }),
    };
  }

  // A 200 body can still declare its own failure. `preview` never does — that is an
  // honest "not connected" answer and must reach the caller as a normal result.
  if (parseFailed || data?.status === "error") {
    return {
      ok: false,
      kind: "route-error",
      httpStatus: response.status,
      data,
      error: describeRouteError({ base, method, path, data }),
    };
  }

  return { ok: true, kind: "ok", httpStatus: response.status, data, error: null };
}

export function hubGet(path, query) {
  return hubFetch(path, { method: "GET", query });
}

export function hubPost(path, body) {
  return hubFetch(path, { method: "POST", body });
}

export function hasWriteSecret() {
  return Boolean(resolveWriteSecret());
}
