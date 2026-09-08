// Thin HTTP adapter over the existing Hub read API (apps/hub/app/api/hub/*) and the
// Google Calendar write route. Every call here hits a route that already has its own
// honest preview/live/error response taxonomy — this file does not invent new status
// semantics, it just forwards them to the MCP tool layer.

function resolveHubUrl() {
  const url = process.env.COM_MOON_HUB_URL?.trim() || "http://localhost:3000";
  return url.replace(/\/$/, "");
}

function resolveWriteSecret() {
  return process.env.COM_MOON_HUB_WRITE_SECRET?.trim() || "";
}

async function hubFetch(path, { method = "GET", body, query } = {}) {
  const base = resolveHubUrl();
  const url = new URL(path, `${base}/`);

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

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
    redirect: "error",
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : { status: "error", error: "empty-response" };
  } catch {
    data = { status: "error", error: "non-json-response", httpStatus: response.status };
  }

  if (!response.ok) {
    throw new Error(`Hub request failed (HTTP ${response.status}). Check the operation's ledger before retrying a write.`);
  }

  return { httpStatus: response.status, ok: response.ok, data };
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
