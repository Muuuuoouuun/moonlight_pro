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
    fetchRows: async (table) => table === "projects"
      ? [{ id: "11111111-1111-4111-8111-111111111111" }]
      : [],
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
    project_id: null,
    title: "Prepare weekly review",
    status: "todo",
    priority: "medium",
    next_action: null,
    due_at: null,
    meta: { source: "manual" },
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

test("treats a project retry as duplicate when canonical durable fields match", async () => {
  const existing = {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    brand_id: "22222222-2222-4222-8222-222222222222",
    owner_id: "99999999-9999-4999-8999-999999999999",
    name: "Phase 1 rollout",
    summary: "Ship the operator loop",
    status: "active",
    priority: "high",
    progress: 35,
    next_action: "Run the first weekly review",
    due_at: "2026-07-31T00:00:00.000Z",
    last_activity_at: "2026-07-15T09:00:00.000Z",
    created_at: "2026-07-15T09:00:00.000Z",
    updated_at: "2026-07-15T09:00:00.000Z",
    meta: { source: "hub", server_owner_snapshot: "cannot-be-reproduced" },
  };

  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: existing.id,
    brandId: existing.brand_id,
    title: existing.name,
    summary: existing.summary,
    status: existing.status,
    priority: existing.priority,
    progress: existing.progress,
    nextAction: existing.next_action,
    dueAt: existing.due_at,
    source: "hub",
  }, {
    workspaceId: existing.workspace_id,
    ownerId: "44444444-4444-4444-8444-444444444444",
    now: "2026-07-17T00:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "duplicate" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async (table) => {
      if (table === "brands") return [{ id: existing.brand_id }];
      if (table === "projects") return [existing];
      return [];
    },
  });

  assert.deepEqual(result, {
    status: "duplicate",
    action: "create_project",
    entity: existing,
  });
});

test("reports conflict when a project create id is reused for a different payload", async () => {
  const existing = {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    brand_id: null,
    owner_id: null,
    name: "Existing project",
    summary: null,
    status: "active",
    priority: "medium",
    progress: 0,
    next_action: null,
    due_at: null,
    meta: { source: "manual" },
  };

  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: existing.id,
    title: "Different project",
  }, {
    workspaceId: existing.workspace_id,
    now: "2026-07-17T00:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "duplicate" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async () => [existing],
  });

  assert.deepEqual(result, {
    status: "conflict",
    action: "create_project",
    error: "id-reuse-payload-mismatch",
    retryable: false,
    entity: existing,
  });
});

test("returns the persisted project representation from a concurrency-guarded update", async () => {
  const updates = [];
  const persisted = {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    name: "Persisted server title",
    updated_at: "2026-07-17T01:00:00.000Z",
  };

  const result = await pmsService.executePmsCommand({
    action: "update_project",
    id: persisted.id,
    title: "Requested title",
    expectedUpdatedAt: "2026-07-16T01:00:00.000Z",
  }, {
    workspaceId: persisted.workspace_id,
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async (table, filters, patch) => {
      updates.push({ table, filters, patch });
      return { persisted: true, reason: "ok", rows: [persisted] };
    },
    fetchRows: async () => [],
  });

  assert.deepEqual(updates[0].filters, [
    ["id", "eq.11111111-1111-4111-8111-111111111111"],
    ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
    ["updated_at", "eq.2026-07-16T01:00:00.000Z"],
  ]);
  assert.deepEqual(result, {
    status: "saved",
    action: "update_project",
    entity: persisted,
  });
});

test("reports a stale project update as conflict when no row matches the concurrency token", async () => {
  const current = {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    name: "Current persisted title",
    updated_at: "2026-07-16T02:00:00.000Z",
  };
  const result = await pmsService.executePmsCommand({
    action: "update_project",
    id: current.id,
    title: "Requested title",
    expectedUpdatedAt: "2026-07-16T01:00:00.000Z",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async () => ({ persisted: true, reason: "ok", rows: [] }),
    fetchRows: async (table, options) => {
      assert.equal(table, "projects");
      assert.deepEqual(options, {
        filters: [
          ["id", "eq.11111111-1111-4111-8111-111111111111"],
          ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
        ],
        limit: 1,
      });
      return [current];
    },
  });

  assert.deepEqual(result, {
    status: "conflict",
    action: "update_project",
    error: "stale-update",
    retryable: false,
    entity: current,
  });
});

test("reports a missing concurrency-guarded project update target as not found", async () => {
  const result = await pmsService.executePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Requested title",
    expectedUpdatedAt: "2026-07-16T01:00:00.000Z",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async () => ({ persisted: true, reason: "ok", rows: [] }),
    fetchRows: async () => [],
  });

  assert.deepEqual(result, {
    status: "error",
    action: "update_project",
    error: "not-found",
  });
});

test("reports a guarded project current-row lookup failure as an error", async () => {
  const result = await pmsService.executePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Requested title",
    expectedUpdatedAt: "2026-07-16T01:00:00.000Z",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async () => ({ persisted: true, reason: "ok", rows: [] }),
    fetchRows: async () => null,
  });

  assert.deepEqual(result, {
    status: "error",
    action: "update_project",
    error: "current-entity-read-failed",
  });
});

test("reports a missing project update target when no row matches without a concurrency token", async () => {
  const result = await pmsService.executePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Requested title",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async () => ({ persisted: true, reason: "ok", rows: [] }),
    fetchRows: async () => {
      throw new Error("unguarded zero-row updates must not perform a follow-up read");
    },
  });

  assert.deepEqual(result, {
    status: "error",
    action: "update_project",
    error: "not-found",
  });
});

test("rejects project brand relationships outside the workspace on create and update", async () => {
  const writes = [];
  const dependencies = {
    insert: async (...args) => {
      writes.push(["insert", ...args]);
      return { persisted: true, reason: "ok" };
    },
    update: async (...args) => {
      writes.push(["update", ...args]);
      return { persisted: true, reason: "ok", rows: [] };
    },
    fetchRows: async (table, options) => {
      assert.equal(table, "brands");
      assert.deepEqual(options.filters, [
        ["id", "eq.22222222-2222-4222-8222-222222222222"],
        ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
      ]);
      return [];
    },
  };
  const context = {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  };

  const created = await pmsService.executePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    brandId: "22222222-2222-4222-8222-222222222222",
    title: "Cross-workspace project",
  }, context, dependencies);
  const updated = await pmsService.executePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    brandId: "22222222-2222-4222-8222-222222222222",
  }, context, dependencies);

  assert.deepEqual(created, { status: "invalid-input", error: "invalid-brand-reference" });
  assert.deepEqual(updated, { status: "invalid-input", error: "invalid-brand-reference" });
  assert.equal(writes.length, 0);
});

test("rejects task project relationships outside the workspace on create and update", async () => {
  const writes = [];
  const dependencies = {
    insert: async (...args) => {
      writes.push(["insert", ...args]);
      return { persisted: true, reason: "ok" };
    },
    update: async (...args) => {
      writes.push(["update", ...args]);
      return { persisted: true, reason: "ok", rows: [] };
    },
    fetchRows: async (table, options) => {
      assert.equal(table, "projects");
      assert.deepEqual(options.filters, [
        ["id", "eq.11111111-1111-4111-8111-111111111111"],
        ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
      ]);
      return [];
    },
  };
  const context = {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  };

  const created = await pmsService.executePmsCommand({
    action: "create_task",
    id: "55555555-5555-4555-8555-555555555555",
    projectId: "11111111-1111-4111-8111-111111111111",
    title: "Cross-workspace task",
  }, context, dependencies);
  const updated = await pmsService.executePmsCommand({
    action: "update_task",
    id: "55555555-5555-4555-8555-555555555555",
    projectId: "11111111-1111-4111-8111-111111111111",
  }, context, dependencies);

  assert.deepEqual(created, { status: "invalid-input", error: "invalid-project-reference" });
  assert.deepEqual(updated, { status: "invalid-input", error: "invalid-project-reference" });
  assert.equal(writes.length, 0);
});

test("preserves missing Supabase configuration from a detailed relationship lookup", async () => {
  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    brandId: "22222222-2222-4222-8222-222222222222",
    title: "Project",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async () => null,
    fetchRowsDetailed: async () => ({ ok: false, reason: "missing-config" }),
  });

  assert.deepEqual(result, { status: "error", error: "missing-config" });
});

test("keeps an HTTP relationship lookup failure distinct from missing configuration", async () => {
  const result = await pmsService.executePmsCommand({
    action: "create_task",
    id: "55555555-5555-4555-8555-555555555555",
    projectId: "11111111-1111-4111-8111-111111111111",
    title: "Task",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async () => null,
    fetchRowsDetailed: async () => ({ ok: false, reason: "http-503" }),
  });

  assert.deepEqual(result, {
    status: "error",
    error: "relationship-check-failed",
    detail: "http-503",
  });
});

test("keeps a network relationship lookup failure in the 502 error taxonomy", async () => {
  const result = await pmsService.executePmsCommand({
    action: "create_task",
    id: "55555555-5555-4555-8555-555555555555",
    projectId: "11111111-1111-4111-8111-111111111111",
    title: "Task",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T01:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async () => null,
    fetchRowsDetailed: async () => ({ ok: false, reason: "request-failed" }),
  });

  assert.deepEqual(result, {
    status: "error",
    error: "relationship-check-failed",
    detail: "request-failed",
  });
});
