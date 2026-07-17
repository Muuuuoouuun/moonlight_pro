import assert from "node:assert/strict";
import { test } from "node:test";

let pmsCommand = null;

try {
  pmsCommand = await import("./pms-command.ts");
} catch {
  // Red phase: the durable PMS command contract does not exist yet.
}

test("normalizes a durable project create without inventing progress evidence", () => {
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
      next_action: "Run the first weekly review",
      due_at: "2026-07-31T00:00:00.000Z",
      last_activity_at: "2026-07-15T00:00:00.000Z",
      meta: { source: "hub" },
    },
  });
});

test("normalizes a durable brand (container) create command", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "create_brand",
    id: "66666666-6666-4666-8666-666666666666",
    name: "우리 학원 KA",
    slug: "our-ka-2026",
    category: "ka-deal",
    orgScope: "classin",
    source: "hub-projects",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    ownerId: "44444444-4444-4444-8444-444444444444",
    now: "2026-07-16T00:00:00.000Z",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "create_brand",
    table: "brands",
    record: {
      id: "66666666-6666-4666-8666-666666666666",
      workspace_id: "33333333-3333-4333-8333-333333333333",
      slug: "our-ka-2026",
      name: "우리 학원 KA",
      kind: "brand",
      meta: { category: "ka-deal", org_scope: "classin", source: "hub-projects" },
    },
  });
});

test("brand create keeps a glyph only when one is supplied", () => {
  const withGlyph = pmsCommand.normalizePmsCommand({
    action: "create_brand", id: "66666666-6666-4666-8666-666666666666",
    name: "채널", slug: "chan", category: "sns-channel", orgScope: "personal", glyph: "✦",
  }, { workspaceId: "33333333-3333-4333-8333-333333333333", now: "2026-07-16T00:00:00.000Z" });
  assert.equal(withGlyph.record.meta.glyph, "✦");

  const withoutGlyph = pmsCommand.normalizePmsCommand({
    action: "create_brand", id: "66666666-6666-4666-8666-666666666666",
    name: "채널", slug: "chan", category: "sns-channel", orgScope: "personal",
  }, { workspaceId: "33333333-3333-4333-8333-333333333333", now: "2026-07-16T00:00:00.000Z" });
  assert.ok(!("glyph" in withoutGlyph.record.meta), "glyph must be omitted, not null");
});

test("brand create rejects unknown category and org scope", () => {
  const ctx = { workspaceId: "33333333-3333-4333-8333-333333333333", now: "2026-07-16T00:00:00.000Z" };
  const base = { action: "create_brand", id: "66666666-6666-4666-8666-666666666666", name: "X", slug: "x" };
  assert.deepEqual(
    pmsCommand.normalizePmsCommand({ ...base, category: "bogus", orgScope: "classin" }, ctx),
    { ok: false, reason: "invalid-category" },
  );
  assert.deepEqual(
    pmsCommand.normalizePmsCommand({ ...base, category: "general", orgScope: "bogus" }, ctx),
    { ok: false, reason: "invalid-org-scope" },
  );
  assert.deepEqual(
    pmsCommand.normalizePmsCommand({ ...base, category: "general" }, ctx),
    { ok: false, reason: "invalid-org-scope" },
  );
  assert.deepEqual(
    pmsCommand.normalizePmsCommand({ action: "create_brand", id: "66666666-6666-4666-8666-666666666666", name: "X", category: "general", orgScope: "personal" }, ctx),
    { ok: false, reason: "missing-slug" },
  );
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
    expectedUpdatedAt: "2026-07-14T12:34:56+09:00",
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
      ["updated_at", "eq.2026-07-14T03:34:56.000Z"],
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

test("normalizes a durable decision create command linked to a project", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "create_decision",
    id: "77777777-7777-4777-8777-777777777777",
    title: "월 구독 요금제 유지",
    projectId: "11111111-1111-4111-8111-111111111111",
    rationale: "이탈률 낮고 신규 유입 채널이 아직 검증 안 됨",
    decidedAt: "2026-07-16T09:00:00+09:00",
    source: "hub",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    ownerId: "44444444-4444-4444-8444-444444444444",
    now: "2026-07-16T00:00:00.000Z",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "create_decision",
    table: "decisions",
    record: {
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: "33333333-3333-4333-8333-333333333333",
      project_id: "11111111-1111-4111-8111-111111111111",
      actor_id: "44444444-4444-4444-8444-444444444444",
      title: "월 구독 요금제 유지",
      summary: "이탈률 낮고 신규 유입 채널이 아직 검증 안 됨",
      rationale: "이탈률 낮고 신규 유입 채널이 아직 검증 안 됨",
      decided_at: "2026-07-16T00:00:00.000Z",
      meta: { source: "hub" },
    },
  });
});

test("decision create derives a non-null summary from rationale, then falls back to title", () => {
  const ctx = { workspaceId: "33333333-3333-4333-8333-333333333333", now: "2026-07-16T00:00:00.000Z" };

  const withRationale = pmsCommand.normalizePmsCommand({
    action: "create_decision",
    id: "77777777-7777-4777-8777-777777777777",
    title: "월 구독 요금제 유지",
    rationale: "이탈률 낮고 신규 유입 채널이 아직 검증 안 됨",
  }, ctx);
  assert.equal(withRationale.record.summary, "이탈률 낮고 신규 유입 채널이 아직 검증 안 됨");

  // Bare "Record decision" quick-create: no rationale yet, no project link — decided_at stays
  // null so the Decisions timeline reads it as Draft (work-ledger.js resolveDecisionStatus).
  const titleOnly = pmsCommand.normalizePmsCommand({
    action: "create_decision",
    id: "77777777-7777-4777-8777-777777777777",
    title: "월 구독 요금제 유지",
  }, ctx);
  assert.equal(titleOnly.record.summary, "월 구독 요금제 유지");
  assert.equal(titleOnly.record.rationale, null);
  assert.equal(titleOnly.record.decided_at, null);
  assert.equal(titleOnly.record.project_id, null);
});

test("decision create requires a title and a valid decided-at timestamp", () => {
  const ctx = { workspaceId: "33333333-3333-4333-8333-333333333333", now: "2026-07-16T00:00:00.000Z" };

  assert.deepEqual(
    pmsCommand.normalizePmsCommand({ action: "create_decision", id: "77777777-7777-4777-8777-777777777777" }, ctx),
    { ok: false, reason: "missing-title" },
  );
  assert.deepEqual(
    pmsCommand.normalizePmsCommand({
      action: "create_decision",
      id: "77777777-7777-4777-8777-777777777777",
      title: "X",
      decidedAt: "not-a-date",
    }, ctx),
    { ok: false, reason: "invalid-decided-at" },
  );
});

test("normalizes a decision update patch, allowing the project link and decided-at to be cleared", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "update_decision",
    id: "77777777-7777-4777-8777-777777777777",
    title: "월 구독 요금제 유지 (재확인)",
    projectId: "",
    rationale: "",
    decidedAt: "",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-17T03:00:00.000Z",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "update_decision",
    table: "decisions",
    filters: [
      ["id", "eq.77777777-7777-4777-8777-777777777777"],
      ["workspace_id", "eq.33333333-3333-4333-8333-333333333333"],
    ],
    patch: {
      title: "월 구독 요금제 유지 (재확인)",
      project_id: null,
      rationale: null,
      decided_at: null,
      updated_at: "2026-07-17T03:00:00.000Z",
    },
  });
});

test("rejects an invalid expected project update timestamp", () => {
  const result = pmsCommand.normalizePmsCommand({
    action: "update_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Phase 1 rollout",
    expectedUpdatedAt: "not-a-timestamp",
  }, {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-15T02:00:00.000Z",
  });

  assert.deepEqual(result, { ok: false, reason: "invalid-expected-updated-at" });
});

test("rejects malformed project and brand relationship ids instead of clearing them", () => {
  const context = {
    workspaceId: "33333333-3333-4333-8333-333333333333",
    now: "2026-07-15T02:00:00.000Z",
  };

  assert.deepEqual(pmsCommand.normalizePmsCommand({
    action: "create_project",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Project",
    brandId: "not-a-brand-id",
  }, context), { ok: false, reason: "invalid-brand-id" });
  assert.deepEqual(pmsCommand.normalizePmsCommand({
    action: "create_task",
    id: "55555555-5555-4555-8555-555555555555",
    title: "Task",
    projectId: "not-a-project-id",
  }, context), { ok: false, reason: "invalid-project-id" });
  assert.deepEqual(pmsCommand.normalizePmsCommand({
    action: "update_task",
    id: "55555555-5555-4555-8555-555555555555",
    projectId: "not-a-project-id",
  }, context), { ok: false, reason: "invalid-project-id" });
});
