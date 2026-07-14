import assert from "node:assert/strict";
import { test } from "node:test";

let pmsService = null;

try {
  pmsService = await import("./pms-command-service.ts");
} catch {
  // Red phase: the persistence service does not exist yet.
}

test("persists one normalized task create and returns its durable identity", async () => {
  assert.ok(pmsService, "pms-command-service.ts must exist");
  const inserts = [];

  const result = await pmsService.executePmsCommand({
    action: "create_task",
    id: "55555555-5555-4555-8555-555555555555",
    projectId: "11111111-1111-4111-8111-111111111111",
    title: "Prepare weekly review",
    status: "todo",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    ownerId: "44444444-4444-4444-8444-444444444444",
    now: "2026-07-15T00:00:00.000Z",
  }, {
    insert: async (table, record) => {
      inserts.push({ table, record });
      return { persisted: true, reason: "ok" };
    },
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async () => [],
  });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "tasks");
  assert.equal(inserts[0].record.id, "55555555-5555-4555-8555-555555555555");
  assert.deepEqual(result, {
    status: "saved",
    action: "create_task",
    entity: inserts[0].record,
  });
});

test("applies a workspace-scoped task status update", async () => {
  const updates = [];
  const result = await pmsService.executePmsCommand({
    action: "update_task",
    id: "55555555-5555-4555-8555-555555555555",
    status: "doing",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-15T03:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async (table, filters, patch) => {
      updates.push({ table, filters, patch });
      return { persisted: true, reason: "ok" };
    },
    fetchRows: async () => [],
  });

  assert.deepEqual(updates, [{
    table: "tasks",
    filters: [
      ["id", "eq.55555555-5555-4555-8555-555555555555"],
      ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
    ],
    patch: {
      status: "doing",
      completed_at: null,
      updated_at: "2026-07-15T03:00:00.000Z",
    },
  }]);
  assert.deepEqual(result, {
    status: "saved",
    action: "update_task",
    entity: {
      id: "55555555-5555-4555-8555-555555555555",
      status: "doing",
      completed_at: null,
      updated_at: "2026-07-15T03:00:00.000Z",
    },
  });
});

test("treats a retried client-generated create id as the same durable entity", async () => {
  const existing = {
    id: "55555555-5555-4555-8555-555555555555",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    title: "Prepare weekly review",
    status: "todo",
  };
  const result = await pmsService.executePmsCommand({
    action: "create_task",
    id: existing.id,
    title: existing.title,
  }, {
    workspaceId: existing.workspace_id,
    now: "2026-07-15T00:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "duplicate" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async (table, options) => {
      assert.equal(table, "tasks");
      assert.deepEqual(options.filters, [
        ["id", "eq.55555555-5555-4555-8555-555555555555"],
        ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
      ]);
      return [existing];
    },
  });

  assert.deepEqual(result, {
    status: "duplicate",
    action: "create_task",
    entity: existing,
  });
});
