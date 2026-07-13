const DEGRADED_REASONS = new Set([
  "missing-access-token",
  "missing-config",
  "missing-connection",
  "missing-workspace",
  "write-secret-not-configured",
]);

const VALIDATION_REASONS = new Set([
  "empty-capture",
  "invalid-action",
  "invalid-decision",
  "invalid-json",
  "missing-fields",
  "validation",
]);

const REASON_HTTP_STATUS = new Map([
  ["forbidden", 403],
  ["no-matching-row", 404],
  ["not-found", 404],
  ["payload-too-large", 413],
  ["request-failed", 503],
  ["timeout", 504],
  ["unauthorized", 401],
]);

function statusFromReason(reason) {
  const explicitStatus = reason.match(/^(?:http|supabase)-(\d{3})$/)?.[1];
  if (explicitStatus) {
    return Number(explicitStatus);
  }

  if (/timeout/i.test(reason)) {
    return 504;
  }

  return REASON_HTTP_STATUS.get(reason) || 500;
}

function isRetryableHttpStatus(httpStatus) {
  return httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500;
}

export function classifyWritePersistence(
  persistence = {},
  { successStatus = "saved", successHttpStatus = 200 } = {},
) {
  const persisted = persistence?.persisted === true;
  const partialPersisted = !persisted && persistence?.partialPersisted === true;
  const reason = String(persistence?.reason || (persisted ? "ok" : "persistence-failed"));
  let response;

  if (persisted) {
    response = {
      status: successStatus,
      httpStatus: successHttpStatus,
      retryable: false,
      reason,
    };
  } else if (DEGRADED_REASONS.has(reason)) {
    response = {
      status: "degraded",
      httpStatus: 503,
      retryable: true,
      reason,
    };
  } else if (VALIDATION_REASONS.has(reason)) {
    response = {
      status: "failed",
      httpStatus: 400,
      retryable: false,
      reason,
    };
  } else {
    const httpStatus = statusFromReason(reason);
    response = {
      status: "failed",
      httpStatus,
      retryable: isRetryableHttpStatus(httpStatus),
      reason,
    };
  }

  if (partialPersisted) {
    response.status = "failed";
    response.retryable = false;
    response.partialPersisted = true;
  }

  if (persistence?.correlationId) {
    response.correlationId = persistence.correlationId;
  }

  return response;
}
