import { randomUUID } from "crypto";

const SHARED_SECRET_HEADER = "x-com-moon-shared-secret";
const UNTRUSTED_CONTEXT_FIELDS = new Set([
  "workspaceId",
  "workspace_id",
  "ownerId",
  "owner_id",
  "actorId",
  "actor_id",
]);
const ENGINE_WRITE_STATUSES = new Set([
  "saved",
  "accepted",
  "duplicate",
  "conflict",
  "failed",
  "degraded",
]);
const DEFAULT_TIMEOUT_MS = 10_000;

function correlationId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : randomUUID();
}

function json(body, status, correlation) {
  return Response.json(body, {
    status,
    headers: { "x-correlation-id": correlation },
  });
}

function failure(status, reason, error, retryable, correlation) {
  return json(
    { status: status === 503 ? "degraded" : "failed", reason, error, retryable, correlationId: correlation },
    status,
    correlation,
  );
}

function resolveConfig() {
  const engineUrl = process.env.COM_MOON_ENGINE_URL?.trim().replace(/\/$/, "");
  const sharedSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();
  const workspaceId = process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim();

  if (!engineUrl || !sharedSecret || !workspaceId) {
    return null;
  }

  return { engineUrl, sharedSecret, workspaceId };
}

function stripUntrustedContext(value) {
  if (Array.isArray(value)) {
    return value.map(stripUntrustedContext);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNTRUSTED_CONTEXT_FIELDS.has(key))
      .map(([key, child]) => [key, stripUntrustedContext(child)]),
  );
}

function validEngineBody(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validEngineResponse(value, responseCorrelation) {
  return (
    validEngineBody(value) &&
    ENGINE_WRITE_STATUSES.has(value.status) &&
    typeof value.retryable === "boolean" &&
    typeof value.correlationId === "string" &&
    value.correlationId.trim().length > 0 &&
    typeof responseCorrelation === "string" &&
    responseCorrelation.length > 0 &&
    value.correlationId === responseCorrelation
  );
}

export async function sendEngineWrite(
  path,
  {
    method = "POST",
    idempotencyKey,
    correlationId: requestedCorrelationId,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = {},
) {
  const correlation = correlationId(requestedCorrelationId);
  const config = resolveConfig();

  if (!config) {
    return failure(
      503,
      "missing-config",
      "Engine write transport is not configured.",
      false,
      correlation,
    );
  }

  const normalizedKey = typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
  if (!normalizedKey) {
    return failure(
      400,
      "missing-idempotency-key",
      "Idempotency-Key is required.",
      false,
      correlation,
    );
  }

  if (!validEngineBody(body)) {
    return failure(400, "invalid-body", "Request body must be a JSON object.", false, correlation);
  }

  const normalizedPath = typeof path === "string" ? path.trim() : "";
  if (!normalizedPath.startsWith("/") || normalizedPath.startsWith("//")) {
    return failure(400, "invalid-path", "Engine write path is invalid.", false, correlation);
  }

  const payload = {
    ...stripUntrustedContext(body),
    workspaceId: config.workspaceId,
  };
  const controller = new AbortController();
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const response = await fetchImpl(`${config.engineUrl}${normalizedPath}`, {
      method,
      headers: {
        "content-type": "application/json",
        [SHARED_SECRET_HEADER]: config.sharedSecret,
        "idempotency-key": normalizedKey,
        "x-correlation-id": correlation,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let responseBody;

    try {
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      responseBody = null;
    }

    const responseCorrelation = response.headers.get("x-correlation-id")?.trim() || null;

    if (
      !validEngineResponse(responseBody, responseCorrelation) ||
      response.status === 202 ||
      responseBody.status === "preview"
    ) {
      return failure(
        502,
        "upstream",
        "Engine returned an invalid response.",
        true,
        correlation,
      );
    }

    return json(responseBody, response.status, responseCorrelation);
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return failure(
        504,
        "timeout",
        "Engine write request timed out.",
        true,
        correlation,
      );
    }

    return failure(
      502,
      "upstream",
      "Engine write request failed.",
      true,
      correlation,
    );
  } finally {
    clearTimeout(timer);
  }
}
