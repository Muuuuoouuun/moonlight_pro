import assert from "node:assert/strict";
import { test } from "node:test";

let captureCommand = null;

try {
  captureCommand = await import("./capture-command.ts");
} catch {
  // Red phase: Engine has no canonical quick-capture command yet.
}

const workspaceId = "11111111-1111-1111-1111-111111111111";
const ownerId = "22222222-2222-2222-2222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";
const leadId = "44444444-4444-4444-8444-444444444444";

test("normalizes task and inbox captures into the same receipt RPC envelope", () => {
  assert.ok(captureCommand, "capture-command.ts must exist");

  const task = captureCommand.normalizeCaptureCommand({
    raw: "  고객 후속 일정 확인  ",
    hint: "task",
    idempotencyKey,
    entityRef: { id: leadId, type: "lead" },
  }, { workspaceId, ownerId });
  const inbox = captureCommand.normalizeCaptureCommand({
    raw: "고객 후속 일정 확인",
    hint: "inbox",
    idempotencyKey,
    entityRef: { type: "lead", id: leadId },
  }, { workspaceId, ownerId });

  assert.equal(task.ok, true);
  assert.equal(inbox.ok, true);
  assert.deepEqual(task.params, {
    p_workspace_id: workspaceId,
    p_owner_id: ownerId,
    p_raw: "고객 후속 일정 확인",
    p_hint: "task",
    p_idempotency_key: idempotencyKey,
    p_request_hash: task.params.p_request_hash,
    p_entity_ref: { type: "lead", id: leadId },
  });
  assert.match(task.params.p_request_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(task.params.p_request_hash, inbox.params.p_request_hash);
});

test("rejects lossy, unsupported, or non-idempotent capture input", () => {
  assert.ok(captureCommand, "capture-command.ts must exist");
  assert.deepEqual(
    captureCommand.normalizeCaptureCommand({ raw: " ", hint: "task", idempotencyKey }, { workspaceId }),
    { ok: false, reason: "empty-capture" },
  );
  assert.deepEqual(
    captureCommand.normalizeCaptureCommand({ raw: "x".repeat(4001), hint: "task", idempotencyKey }, { workspaceId }),
    { ok: false, reason: "capture-too-long" },
  );
  assert.deepEqual(
    captureCommand.normalizeCaptureCommand({ raw: "hello", hint: "unknown", idempotencyKey }, { workspaceId }),
    { ok: false, reason: "invalid-hint" },
  );
  assert.deepEqual(
    captureCommand.normalizeCaptureCommand({ raw: "hello", hint: "task", idempotencyKey: "retry-me" }, { workspaceId }),
    { ok: false, reason: "invalid-idempotency-key" },
  );
});

test("returns the RPC result without changing durable status semantics", async () => {
  assert.ok(captureCommand, "capture-command.ts must exist");
  const calls = [];
  const saved = await captureCommand.executeCaptureCommand({
    raw: "고객 후속 일정 확인",
    hint: "task",
    idempotencyKey,
  }, { workspaceId, ownerId }, {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return {
        ok: true,
        data: {
          status: "saved",
          destinationType: "task",
          destinationId: idempotencyKey,
          correlationId: idempotencyKey,
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "capture_quick_input_v1");
  assert.equal(saved.status, "saved");
  assert.equal(saved.destinationType, "task");

  const preview = await captureCommand.executeCaptureCommand({
    raw: "보관할 메모",
    hint: "inbox",
    idempotencyKey,
  }, { workspaceId }, {
    rpc: async () => ({ ok: false, error: "missing-config" }),
  });
  assert.deepEqual(preview, { status: "preview", error: "missing-config", retryable: true });
});
