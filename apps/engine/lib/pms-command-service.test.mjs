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
    area_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    brand_id: "22222222-2222-4222-8222-222222222222",
    lead_id: null,
    customer_account_id: null,
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
    meta: { source: "hub", org_scope: "classin", server_owner_snapshot: "cannot-be-reproduced" },
  };

  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: existing.id,
    areaId: existing.area_id,
    brandId: existing.brand_id,
    orgScope: "classin",
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
      if (table === "areas") return [{ id: existing.area_id }];
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

test("treats an evidence-free project retry as duplicate after a legacy zero default", async () => {
  const existing = {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    area_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    brand_id: null,
    lead_id: null,
    customer_account_id: null,
    owner_id: null,
    name: "Evidence-free project",
    summary: null,
    status: "active",
    priority: "medium",
    progress: 0,
    next_action: null,
    due_at: null,
    meta: { source: "manual", org_scope: "personal" },
  };

  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: existing.id,
    areaId: existing.area_id,
    orgScope: "personal",
    title: existing.name,
  }, {
    workspaceId: existing.workspace_id,
    now: "2026-07-17T00:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "duplicate" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async (table) => table === "areas" ? [{ id: existing.area_id }] : [existing],
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
    area_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    brand_id: null,
    lead_id: null,
    customer_account_id: null,
    owner_id: null,
    name: "Existing project",
    summary: null,
    status: "active",
    priority: "medium",
    progress: 0,
    next_action: null,
    due_at: null,
    meta: { source: "manual", org_scope: "personal" },
  };

  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: existing.id,
    areaId: existing.area_id,
    orgScope: "personal",
    title: "Different project",
  }, {
    workspaceId: existing.workspace_id,
    now: "2026-07-17T00:00:00.000Z",
  }, {
    insert: async () => ({ persisted: false, reason: "duplicate" }),
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async (table) => table === "areas" ? [{ id: existing.area_id }] : [existing],
  });

  assert.deepEqual(result, {
    status: "conflict",
    action: "create_project",
    error: "id-reuse-payload-mismatch",
    retryable: false,
    entity: existing,
  });
});

test("validates every non-null project reference in the same workspace before inserting", async () => {
  const workspaceId = "33333333-3333-4333-8333-333333333333";
  const areaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const brandId = "22222222-2222-4222-8222-222222222222";
  const leadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const accountId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const events = [];
  const rows = {
    areas: { id: areaId, workspace_id: workspaceId },
    brands: { id: brandId, workspace_id: workspaceId },
    leads: { id: leadId, workspace_id: workspaceId },
    customer_accounts: { id: accountId, workspace_id: workspaceId },
  };
  const dependencies = {
    insert: async (table) => {
      events.push({ kind: "insert", table });
      return { persisted: true, reason: "ok" };
    },
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async (table, options) => {
      events.push({ kind: "lookup", table, options });
      return [rows[table]];
    },
  };

  const leadResult = await pmsService.executePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    areaId,
    brandId,
    title: "Lead project",
    entityRef: { type: "lead", id: leadId },
    orgScope: "classin",
  }, { workspaceId, now: "2026-07-17T00:00:00.000Z" }, dependencies);

  assert.equal(leadResult.status, "saved");
  assert.deepEqual(events.map(({ kind, table }) => [kind, table]), [
    ["lookup", "areas"],
    ["lookup", "brands"],
    ["lookup", "leads"],
    ["insert", "projects"],
  ]);
  for (const event of events.filter(({ kind }) => kind === "lookup")) {
    assert.deepEqual(event.options, {
      select: "id",
      filters: [
        ["id", `eq.${rows[event.table].id}`],
        ["workspace_id", `eq.${workspaceId}`],
      ],
      limit: 1,
    });
  }

  events.length = 0;
  const accountResult = await pmsService.executePmsCommand({
    action: "create_project",
    id: "99999999-9999-4999-8999-999999999999",
    areaId,
    title: "Account project",
    entityRef: { type: "customer_account", id: accountId },
    orgScope: "personal",
  }, { workspaceId, now: "2026-07-17T00:00:00.000Z" }, dependencies);

  assert.equal(accountResult.status, "saved");
  assert.deepEqual(events.map(({ kind, table }) => [kind, table]), [
    ["lookup", "areas"],
    ["lookup", "customer_accounts"],
    ["insert", "projects"],
  ]);
});

test("rejects an empty same-workspace project lead lookup before insert", async () => {
  const inserts = [];
  const workspaceId = "33333333-3333-4333-8333-333333333333";
  const areaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const leadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    areaId,
    title: "Invalid lead project",
    entityRef: { type: "lead", id: leadId },
    orgScope: "classin",
  }, { workspaceId, now: "2026-07-17T00:00:00.000Z" }, {
    insert: async (table, record) => {
      inserts.push({ table, record });
      return { persisted: true, reason: "ok" };
    },
    update: async () => ({ persisted: false, reason: "unexpected-update" }),
    fetchRows: async (table, options) => {
      if (table === "areas") return [{ id: areaId, workspace_id: workspaceId }];
      assert.equal(table, "leads");
      assert.deepEqual(options.filters, [
        ["id", `eq.${leadId}`],
        ["workspace_id", `eq.${workspaceId}`],
      ]);
      return [];
    },
  });

  assert.deepEqual(result, { status: "invalid-input", error: "invalid-reference" });
  assert.equal(inserts.length, 0);
});

test("reports an unavailable project reference lookup without inserting", async () => {
  const mutations = [];
  const workspaceId = "33333333-3333-4333-8333-333333333333";
  const areaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const leadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const result = await pmsService.executePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    areaId,
    title: "Deferred lead validation",
    entityRef: { type: "lead", id: leadId },
    orgScope: "classin",
  }, { workspaceId, now: "2026-07-17T00:00:00.000Z" }, {
    insert: async () => {
      mutations.push("insert");
      return { persisted: true, reason: "ok" };
    },
    update: async () => {
      mutations.push("update");
      return { persisted: true, reason: "ok" };
    },
    fetchRows: async (table) => {
      if (table === "areas") return [{ id: areaId, workspace_id: workspaceId }];
      assert.equal(table, "leads");
      return null;
    },
  });

  assert.deepEqual(result, { status: "error", error: "reference-lookup-unavailable" });
  assert.deepEqual(mutations, []);
});

test("validates a selected customer before project update and skips cleared references", async () => {
  const workspaceId = "33333333-3333-4333-8333-333333333333";
  const accountId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const events = [];
  const dependencies = {
    insert: async () => ({ persisted: false, reason: "unexpected-insert" }),
    update: async (table, filters, patch) => {
      events.push({ kind: "update", table, filters, patch });
      return { persisted: true, reason: "ok" };
    },
    fetchRows: async (table, options) => {
      events.push({ kind: "lookup", table, options });
      return [{ id: accountId, workspace_id: workspaceId }];
    },
  };

  const selected = await pmsService.executePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    entityRef: { type: "customer_account", id: accountId },
  }, { workspaceId, now: "2026-07-17T01:00:00.000Z" }, dependencies);

  assert.equal(selected.status, "saved");
  assert.deepEqual(events.map(({ kind, table }) => [kind, table]), [
    ["lookup", "customer_accounts"],
    ["update", "projects"],
  ]);

  events.length = 0;
  const cleared = await pmsService.executePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    brandId: "",
    entityRef: null,
  }, { workspaceId, now: "2026-07-17T02:00:00.000Z" }, dependencies);

  assert.equal(cleared.status, "saved");
  assert.deepEqual(events.map(({ kind, table }) => [kind, table]), [
    ["update", "projects"],
  ]);
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
      return { persisted: true, reason: "ok", records: [persisted] };
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
    update: async () => ({ persisted: false, reason: "no-matching-row", records: [] }),
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
    update: async () => ({ persisted: false, reason: "no-matching-row", records: [] }),
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
    update: async () => ({ persisted: false, reason: "no-matching-row", records: [] }),
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
    update: async () => ({ persisted: false, reason: "no-matching-row", records: [] }),
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
      return { persisted: false, reason: "no-matching-row", records: [] };
    },
    fetchRows: async (table, options) => {
      assert.deepEqual(options.filters, [
        ["id", table === "areas"
          ? "eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          : "eq.22222222-2222-4222-8222-222222222222"],
        ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
      ]);
      if (table === "areas") return [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }];
      assert.equal(table, "brands");
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
    areaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    brandId: "22222222-2222-4222-8222-222222222222",
    orgScope: "personal",
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
      return { persisted: false, reason: "no-matching-row", records: [] };
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
    areaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    brandId: "22222222-2222-4222-8222-222222222222",
    orgScope: "personal",
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
