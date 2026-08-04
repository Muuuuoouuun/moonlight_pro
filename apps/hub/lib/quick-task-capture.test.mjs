import assert from "node:assert/strict";
import { test } from "node:test";

let quickCapture = null;

try {
  quickCapture = await import("./quick-task-capture.js");
} catch {
  // Red phase: the home has no durable one-line task capture contract yet.
}

test("builds task and inbox requests with one reusable idempotency key", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");

  assert.deepEqual(
    quickCapture.buildQuickCapture({
      id: "99999999-9999-4999-8999-999999999999",
      raw: "  고객 후속 일정 확인  ",
      hint: "task",
    }),
    {
      ok: true,
      payload: {
        raw: "고객 후속 일정 확인",
        hint: "task",
        idempotencyKey: "99999999-9999-4999-8999-999999999999",
      },
    },
  );
  assert.equal(quickCapture.buildQuickCapture({ id: "id", raw: "메모", hint: "inbox" }).payload.hint, "inbox");
});

test("rejects empty capture without changing durable state", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");
  assert.deepEqual(quickCapture.buildQuickCapture({ id: "id", raw: "   ", hint: "task" }), {
    ok: false,
    reason: "empty-capture",
  });
});

test("clears input only after a durable saved or duplicate receipt response", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "saved" }), true);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "duplicate" }), true);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "conflict" }), false);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "preview" }), false);
  assert.equal(quickCapture.isDurableQuickCaptureResult({ status: "error" }), false);
});
