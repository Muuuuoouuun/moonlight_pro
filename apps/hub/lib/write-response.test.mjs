import test from "node:test";
import assert from "node:assert/strict";

import { classifyWritePersistence } from "./write-response.js";

function assertClassification(actual, expected) {
  assert.deepEqual(
    {
      status: actual.status,
      httpStatus: actual.httpStatus,
      retryable: actual.retryable,
    },
    expected,
  );
}

test("durable persistence is a non-retryable saved response", () => {
  const result = classifyWritePersistence({ persisted: true });

  assertClassification(result, {
    status: "saved",
    httpStatus: 200,
    retryable: false,
  });
  assert.equal(result.reason, "ok");
});

test("missing persistence configuration is degraded and retryable", () => {
  const result = classifyWritePersistence({ persisted: false, reason: "missing-config" });

  assertClassification(result, {
    status: "degraded",
    httpStatus: 503,
    retryable: true,
  });
  assert.equal(result.reason, "missing-config");
});

test("an attempted upstream persistence failure keeps its HTTP status", () => {
  const result = classifyWritePersistence({ persisted: false, reason: "supabase-503" });

  assertClassification(result, {
    status: "failed",
    httpStatus: 503,
    retryable: true,
  });
  assert.equal(result.reason, "supabase-503");
});

test("a partial durable write is failed but never automatically retryable", () => {
  const result = classifyWritePersistence({
    persisted: false,
    partialPersisted: true,
    reason: "http-503",
  });

  assert.deepEqual(result, {
    status: "failed",
    httpStatus: 503,
    retryable: false,
    reason: "http-503",
    partialPersisted: true,
  });
});

test("validation failures are failed and non-retryable", () => {
  const result = classifyWritePersistence({ persisted: false, reason: "validation" });

  assertClassification(result, {
    status: "failed",
    httpStatus: 400,
    retryable: false,
  });
  assert.equal(result.reason, "validation");
});

test("route-specific success vocabulary and correlation IDs are preserved", () => {
  const result = classifyWritePersistence(
    { persisted: true, reason: "ok", correlationId: "capture-123" },
    { successStatus: "accepted", successHttpStatus: 201 },
  );

  assert.deepEqual(result, {
    status: "accepted",
    httpStatus: 201,
    retryable: false,
    reason: "ok",
    correlationId: "capture-123",
  });
});

test("workspace, auth, validation, and transport reasons use honest failure classes", () => {
  assertClassification(
    classifyWritePersistence({ persisted: false, reason: "missing-workspace" }),
    { status: "degraded", httpStatus: 503, retryable: true },
  );
  assertClassification(
    classifyWritePersistence({ persisted: false, reason: "unauthorized" }),
    { status: "failed", httpStatus: 401, retryable: false },
  );
  assertClassification(
    classifyWritePersistence({ persisted: false, reason: "invalid-action" }),
    { status: "failed", httpStatus: 400, retryable: false },
  );
  assertClassification(
    classifyWritePersistence({ persisted: false, reason: "http-429" }),
    { status: "failed", httpStatus: 429, retryable: true },
  );
  assertClassification(
    classifyWritePersistence({ persisted: false, reason: "request-failed" }),
    { status: "failed", httpStatus: 503, retryable: true },
  );
});
