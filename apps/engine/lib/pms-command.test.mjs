import assert from "node:assert/strict";
import { test } from "node:test";

let pmsCommand = null;

try {
  pmsCommand = await import("./pms-command.ts");
} catch {
  // Red phase: the durable PMS command contract does not exist yet.
}

test("normalizes a durable project create command", () => {
  assert.ok(pmsCommand, "pms-command.ts must exist");

  const result = pmsCommand.normalizePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Phase 1 operator rollout",
    brandId: "22222222-2222-4222-8222-222222222222",
    status: "active",
    priority: "high",
    nextAction: "Run the first weekly review",
    dueAt: "2026-07-31T09:00:00+09:00",
    source: "hub",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    ownerId: "44444444-4444-4444-8444-444444444444",
    now: "2026-07-15T00:00:00.000Z",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "create_project",
    table: "projects",
    record: {
      id: "11111111-1111-4111-8111-111111111111",
      workspace_id: "33333333-3333-4333-8333-333333333333",
      brand_id: "22222222-2222-4222-8222-222222222222",
      owner_id: "44444444-4444-4444-8444-444444444444",
      name: "Phase 1 operator rollout",
      summary: null,
      status: "active",
      priority: "high",
      progress: 0,
      next_action: "Run the first weekly review",
      due_at: "2026-07-31T00:00:00.000Z",
      last_activity_at: "2026-07-15T00:00:00.000Z",
      meta: { source: "hub" },
    },
  });
});

test("accepts PostgreSQL UUID values used by the live seeded workspace", () => {
  const result = pmsCommand.normalizePmsCommand(
    {
      action: "create_task",
      id: "22222222-2222-2222-2222-222222222222",
      title: "Live workspace task",
    },
    {
      workspaceId: "11111111-1111-1111-1111-111111111111",
      ownerId: "33333333-3333-3333-3333-333333333333",
      now: "2026-07-15T01:30:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.record.workspace_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(result.record.id, "22222222-2222-2222-2222-222222222222");
});

test("preserves an explicit initial project progress from the create drawer", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "In-flight project",
    progress: 35,
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-15T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.record.progress, 35);
});

test("normalizes a task create command with project ownership and explicit status", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "create_task",
    id: "55555555-5555-4555-8555-555555555555",
    projectId: "11111111-1111-4111-8111-111111111111",
    title: "Prepare weekly review",
    status: "doing",
    priority: "critical",
    dueAt: "2026-07-16",
    source: "mcp",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    ownerId: "44444444-4444-4444-8444-444444444444",
    now: "2026-07-15T00:00:00.000Z",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "create_task",
    table: "tasks",
    record: {
      id: "55555555-5555-4555-8555-555555555555",
      workspace_id: "33333333-3333-4333-8333-333333333333",
      project_id: "11111111-1111-4111-8111-111111111111",
      owner_id: "44444444-4444-4444-8444-444444444444",
      title: "Prepare weekly review",
      status: "doing",
      priority: "critical",
      next_action: null,
      due_at: "2026-07-16T00:00:00.000Z",
      completed_at: null,
      meta: { source: "mcp" },
    },
  });
});

test("marks a task complete with a workspace-scoped update", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "update_task",
    id: "55555555-5555-4555-8555-555555555555",
    status: "done",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-15T01:30:00.000Z",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "update_task",
    table: "tasks",
    filters: [
      ["id", "eq.55555555-5555-4555-8555-555555555555"],
      ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
    ],
    patch: {
      status: "done",
      completed_at: "2026-07-15T01:30:00.000Z",
      updated_at: "2026-07-15T01:30:00.000Z",
    },
  });
});

test("normalizes an editable project patch without changing workspace ownership", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Phase 1 rollout",
    summary: "Ship the operator loop",
    status: "blocked",
    priority: "medium",
    progress: 40,
    nextAction: "Resolve production callback",
    dueAt: "2026-08-01",
    brandId: "22222222-2222-4222-8222-222222222222",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-15T02:00:00.000Z",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "update_project",
    table: "projects",
    filters: [
      ["id", "eq.11111111-1111-4111-8111-111111111111"],
      ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
    ],
    patch: {
      brand_id: "22222222-2222-4222-8222-222222222222",
      name: "Phase 1 rollout",
      summary: "Ship the operator loop",
      status: "blocked",
      priority: "medium",
      progress: 40,
      next_action: "Resolve production callback",
      due_at: "2026-08-01T00:00:00.000Z",
      completed_at: null,
      last_activity_at: "2026-07-15T02:00:00.000Z",
      updated_at: "2026-07-15T02:00:00.000Z",
    },
  });
});
