import assert from "node:assert/strict";
import { test } from "node:test";

let quickCapture = null;

try {
  quickCapture = await import("./quick-task-capture.js");
} catch {
  // Red phase: the home has no durable one-line task capture contract yet.
}

test("builds a durable inbox task from one trimmed line", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");

  assert.deepEqual(
    quickCapture.buildQuickTaskCapture({
      id: "99999999-9999-4999-8999-999999999999",
      raw: "  고객 후속 일정 확인  ",
    }),
    {
      ok: true,
      payload: {
        id: "99999999-9999-4999-8999-999999999999",
        title: "고객 후속 일정 확인",
        status: "inbox",
        priority: "medium",
        source: "quick-capture",
      },
    },
  );
});

test("rejects empty capture without changing durable state", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");
  assert.deepEqual(quickCapture.buildQuickTaskCapture({ id: "id", raw: "   " }), {
    ok: false,
    reason: "empty-capture",
  });
});

test("clears input only after a durable saved or duplicate response", () => {
  assert.ok(quickCapture, "quick-task-capture.js must exist");
  assert.equal(quickCapture.isDurableQuickTaskResult({ status: "saved" }), true);
  assert.equal(quickCapture.isDurableQuickTaskResult({ status: "duplicate" }), true);
  assert.equal(quickCapture.isDurableQuickTaskResult({ status: "preview" }), false);
  assert.equal(quickCapture.isDurableQuickTaskResult({ status: "error" }), false);
});
