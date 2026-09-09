import assert from "node:assert/strict";
import { test } from "node:test";
import { executePmsCommand } from "./pms-command-service.ts";
import { normalizePmsCommand } from "./pms-command.ts";
import { deliveryDraft, deliveryAssessment, validateDelivery, safeResultUrl, dayKey } from "../../../packages/project-delivery/index.ts";

const id = "11111111-1111-4111-8111-111111111111";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const plan = () => deliveryDraft({ deliverable: "기록 저장과 재조회", plannedStart: "2026-09-09", prototypeDate: "2026-09-11", criteria: [{ id: "readback", text: "새로고침 뒤 기록 재조회", done: false }], remainingHours: 5, availableHours: 8 });
function ledger() {
  let row = { id, workspace_id: workspaceId, name: "Test", status: "draft", due_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-09-09T01:00:00.123456+00:00", meta: { org_scope: "personal", unrelated: { preserve: true } } };
  let counter = 0;
  let writes = 0;
  const deps = {
    insert: async () => { throw Error("unexpected insert"); },
    fetchRows: async (_table, options) => options.filters.some(([k, v]) => k === "workspace_id" && v !== `eq.${workspaceId}`) ? [] : [structuredClone(row)],
    update: async (_table, filters, patch) => {
      if (filters.some(([k, v]) => v !== `eq.${row[k]}`)) return { persisted: false, reason: "no-matching-row", records: [] };
      writes++; row = { ...row, ...patch }; return { persisted: true, reason: "ok", records: [structuredClone(row)] };
    },
  };
  return { get row() { return row; }, get writes() { return writes; }, deps,
    send: (fields, expected = row.updated_at, workspace = workspaceId) => executePmsCommand({ action: "update_project", id, expectedUpdatedAt: expected, ...fields }, { workspaceId: workspace, now: `2026-09-09T02:${String(counter++).padStart(2, "0")}:00.000Z` }, deps) };
}

test("delivery lifecycle persists, verifies, completes, and reopens with evidence preserved", async () => {
  const store = ledger();
  assert.equal((await store.send({ delivery: plan() })).status, "saved");
  assert.deepEqual(store.row.meta.unrelated, { preserve: true });
  assert.equal((await store.send({ status: "completed" })).status, "invalid-input");
  assert.equal((await store.send({ deliveryEvent: "prototype" })).status, "invalid-input");
  assert.equal((await store.send({ deliveryEvent: "start" })).status, "saved");
  assert.equal(store.row.status, "active");
  const started = store.row.started_at;
  await store.send({ deliveryEvent: "start" });
  assert.equal(store.row.started_at, started);
  const ready = { ...plan(), resultUrl: "https://example.com/prototype", criteria: [{ ...plan().criteria[0], done: true }] };
  assert.equal((await store.send({ delivery: ready, deliveryEvent: "prototype" })).status, "saved");
  assert.ok(store.row.meta.delivery.prototypeVerifiedAt);
  assert.equal((await store.send({ status: "completed" })).status, "saved");
  assert.ok(store.row.completed_at);
  const completed = store.row.completed_at;
  await store.send({ status: "completed" });
  assert.equal(store.row.completed_at, completed);
  await store.send({ status: "active" });
  assert.equal(store.row.completed_at, null);
  assert.equal(store.row.meta.delivery.resultUrl, ready.resultUrl);
});

test("reschedule keeps baseline and every reason, stale writes cannot overwrite metadata", async () => {
  const store = ledger();
  await store.send({ delivery: plan() });
  const oldVersion = store.row.updated_at;
  assert.equal((await store.send({ dueAt: "2026-09-20" })).status, "invalid-input");
  await store.send({ dueAt: "2026-09-20", scheduleReason: "검증 시간 확보" });
  await store.send({ dueAt: "2026-09-22", scheduleReason: "외부 확인 대기" });
  assert.equal(store.row.meta.delivery.originalDueAt, "2026-09-15T00:00:00.000Z");
  assert.equal(store.row.meta.delivery.history.length, 2);
  assert.equal(store.row.meta.delivery.history[1].reason, "외부 확인 대기");
  const writes = store.writes;
  assert.equal((await store.send({ delivery: plan() }, oldVersion)).status, "conflict");
  assert.equal(store.writes, writes);
  assert.equal(store.row.meta.delivery.history.length, 2);
});

test("cross-workspace and failed reads never write, CAS protects concurrent updates without a supplied version", async () => {
  const store = ledger();
  assert.equal((await store.send({ delivery: plan() }, store.row.updated_at, "44444444-4444-4444-8444-444444444444")).status, "error");
  assert.equal(store.writes, 0);
  const original = store.deps.fetchRows;
  store.deps.fetchRows = async () => null;
  assert.equal((await store.send({ delivery: plan() })).status, "error");
  assert.equal(store.writes, 0);
  store.deps.fetchRows = original;
  store.deps.update = async (_table, filters) => {
    assert.ok(filters.some(([key]) => key === "updated_at"));
    return { persisted: false, reason: "no-matching-row", records: [] };
  };
  const result = await executePmsCommand({ action: "update_project", id, delivery: plan() }, { workspaceId }, store.deps);
  assert.equal(result.status, "conflict");
});

test("changing artifact or acceptance text invalidates prior prototype verification", async () => {
  const store = ledger();
  await store.send({ delivery: plan(), deliveryEvent: "start" });
  const ready = { ...plan(), resultUrl: "https://example.com/v1", criteria: [{ ...plan().criteria[0], done: true }] };
  await store.send({ delivery: ready, deliveryEvent: "prototype" });
  await store.send({ delivery: { ...ready, resultUrl: "https://example.com/v2" } });
  assert.equal(store.row.meta.delivery.prototypeVerifiedAt, null);
  assert.equal((await store.send({ status: "completed" })).status, "invalid-input");
});

test("pause requires a reason, resume clears the pause and keeps the same schedule", async () => {
  const store = ledger();
  await store.send({ delivery: plan(), deliveryEvent: "start" });
  assert.equal((await store.send({ deliveryEvent: "pause" })).status, "invalid-input");
  await store.send({ delivery: { ...plan(), blocker: "외부 검증 대기" }, deliveryEvent: "pause" });
  assert.equal(store.row.status, "blocked");
  assert.ok(store.row.meta.delivery.pausedAt);
  assert.equal((await store.send({ deliveryEvent: "resume" })).status, "invalid-input");
  await store.send({ delivery: plan(), deliveryEvent: "resume" });
  assert.equal(store.row.status, "active");
  assert.equal(store.row.meta.delivery.pausedAt, null);
  assert.equal(store.row.due_at, "2026-09-15T00:00:00.000Z");
});

test("create retries compare the delivery contract and next action uses the project source field", async () => {
  const input = { action: "create_project", id, areaId: "55555555-5555-4555-8555-555555555555", title: "Prototype", orgScope: "personal", dueAt: "2026-09-15", delivery: plan() };
  const normalized = normalizePmsCommand(input, { workspaceId });
  assert.equal(normalized.ok, true);
  const deps = { insert: async () => ({ persisted: false, reason: "duplicate" }), update: async () => { throw Error("unexpected"); }, fetchRows: async () => [normalized.record] };
  assert.equal((await executePmsCommand(input, { workspaceId }, deps)).status, "duplicate");
  assert.equal((await executePmsCommand({ ...input, delivery: { ...plan(), deliverable: "다른 결과물" } }, { workspaceId }, deps)).status, "conflict");
  const store = ledger();
  await store.send({ delivery: { ...plan(), nextAction: "샘플 검증" } });
  assert.equal(store.row.next_action, "샘플 검증");
});

test("invalid schedules, unsafe links, malformed conditions, and impossible hours are rejected", () => {
  assert.ok(validateDelivery({ ...plan(), plannedStart: "2026-02-31" }, "2026-09-15"));
  assert.ok(validateDelivery({ ...plan(), prototypeDate: "2026-09-20" }, "2026-09-15"));
  assert.ok(validateDelivery({ ...plan(), remainingHours: -1 }, "2026-09-15"));
  assert.ok(validateDelivery({ ...plan(), criteria: [...plan().criteria, ...plan().criteria] }, "2026-09-15"));
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://user:pass@example.com"]) assert.equal(safeResultUrl(url), "");
  const normalized = normalizePmsCommand({ action: "update_project", id, delivery: { ...plan(), criteria: [null] } }, { workspaceId });
  assert.equal(normalized.ok, false);
  assert.equal(normalizePmsCommand({ action: "update_project", id, dueAt: "2026-02-31" }, { workspaceId }).ok, false);
});

test("assessment differentiates missing data, capacity, blockers, and Seoul calendar deadlines", () => {
  const options = { dueAt: "2026-09-15", now: "2026-09-09T00:00:00Z" };
  assert.equal(deliveryAssessment(deliveryDraft(), options).key, "unknown");
  assert.equal(deliveryAssessment(plan(), options).key, "possible");
  assert.equal(deliveryAssessment({ ...plan(), remainingHours: 9 }, options).key, "difficult");
  assert.equal(deliveryAssessment({ ...plan(), blocker: "외부 승인" }, options).key, "caution");
  assert.equal(deliveryAssessment(plan(), { ...options, dueAt: "2026-09-08" }).key, "difficult");
  assert.equal(dayKey("2026-09-08T16:00:00Z"), "2026-09-09");
  assert.equal(deliveryAssessment(plan(), { ...options, dueAt: "2026-09-09T00:00:00Z", now: "2026-09-09T14:59:00Z" }).key, "possible");
});
