import assert from "node:assert/strict";
import { test } from "node:test";
import { executePmsCommand } from "./pms-command-service.ts";
import { normalizePmsCommand } from "./pms-command.ts";
import { deliveryDraft, parseDelivery } from "../../../packages/project-delivery/index.ts";

// 막힘 풀기(확인할 것 스펙 §5) — 병목 분류, 서버만 쓰는 막힘 이력, 결정 재시도의 멱등성,
// 결정 ↔ 할 일 링크. 예전 화면이 분류를 모르고 저장해도 분류가 지워지지 않는다.
const id = "11111111-1111-4111-8111-111111111111";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const decisionId = "44444444-4444-4444-8444-444444444444";
const taskId = "55555555-5555-4555-8555-555555555555";
const base = () => deliveryDraft({ deliverable: "제안서 확정" });

function ledger() {
  let row = { id, workspace_id: workspaceId, name: "프로젝트 C", status: "active", due_at: null, updated_at: "2026-10-01T01:00:00.000000+00:00", meta: { org_scope: "personal" } };
  let counter = 0;
  const deps = {
    insert: async () => { throw Error("unexpected insert"); },
    fetchRows: async () => [structuredClone(row)],
    update: async (_table, filters, patch) => {
      if (filters.some(([k, v]) => v !== `eq.${row[k]}`)) return { persisted: false, reason: "no-matching-row", records: [] };
      row = { ...row, ...patch }; return { persisted: true, reason: "ok", records: [structuredClone(row)] };
    },
  };
  return {
    get row() { return row; },
    send: (fields) => executePmsCommand({ action: "update_project", id, expectedUpdatedAt: row.updated_at, ...fields },
      { workspaceId, now: `2026-10-01T02:${String(counter++).padStart(2, "0")}:00.000Z` }, deps),
  };
}

test("병목 분류는 열거값만 받고, 보내지 않으면 저장된 분류를 유지하며, 막힌 점이 비면 함께 빈다", async () => {
  assert.equal(parseDelivery({ ...base(), blockerKind: "weather" }), null);
  assert.equal(parseDelivery({ ...base(), blocker: "x", blockerKind: "customer" }).blockerKind, "customer");
  const legacy = { ...base() };
  delete legacy.blockerKind;
  assert.equal("blockerKind" in parseDelivery(legacy), false);

  const store = ledger();
  assert.equal((await store.send({ delivery: { ...base(), blocker: "대표 승인 대기", blockerKind: "decision" }, deliveryEvent: "pause" })).status, "saved");
  assert.equal(store.row.meta.delivery.blockerKind, "decision");
  // 분류를 모르는 예전 화면이 막힌 점 글만 고쳐 저장한다.
  assert.equal((await store.send({ delivery: { ...legacy, blocker: "대표 승인 대기 — 금요일 회의" } })).status, "saved");
  assert.equal(store.row.meta.delivery.blockerKind, "decision");
});

test("막힌 점이 비는 순간 서버가 막힘 이력 한 줄을 남긴다 — 갈래·결정·메모 포함, 클라이언트 이력은 무시", async () => {
  const store = ledger();
  await store.send({ delivery: { ...base(), blocker: "대표 승인 대기", blockerKind: "decision" }, deliveryEvent: "pause" });
  const pausedAt = store.row.meta.delivery.pausedAt;
  const forged = { ...base(), blocker: "", blockerHistory: [{ text: "위조" }] };
  const result = await store.send({ delivery: forged, deliveryEvent: "resume", unblockResolution: "decision", decisionId, unblockNote: "범위를 A안으로" });
  assert.equal(result.status, "saved");
  assert.equal(store.row.status, "active");
  assert.equal(store.row.meta.delivery.blocker, "");
  assert.equal(store.row.meta.delivery.blockerKind, "");
  assert.deepEqual(store.row.meta.delivery.blockerHistory, [{
    at: pausedAt,
    resolvedAt: store.row.updated_at,
    text: "대표 승인 대기",
    kind: "decision",
    resolution: "decision",
    decisionId,
    note: "범위를 A안으로",
  }]);

  // 편집으로 막힌 점을 비워도(다시 진행 없이) 이력은 남고, 기본 갈래는 "이유가 풀렸어요"다.
  await store.send({ delivery: { ...base(), blocker: "자료 대기", blockerKind: "material" }, deliveryEvent: "pause" });
  await store.send({ delivery: { ...base(), blocker: "", nextVersion: "고급 보고서" }, deliveryEvent: "resume" });
  const history = store.row.meta.delivery.blockerHistory;
  assert.equal(history.length, 2);
  assert.equal(history[1].resolution, "resolved");
  assert.equal("decisionId" in history[1], false);
  assert.equal(store.row.meta.delivery.nextVersion, "고급 보고서");
});

test("막힘 풀기 입력은 정해진 갈래와 UUID만 받는다", () => {
  const ctx = { workspaceId, now: "2026-10-01T02:00:00.000Z" };
  assert.equal(normalizePmsCommand({ action: "update_project", id, unblockResolution: "maybe", delivery: base() }, ctx).reason, "invalid-unblock-resolution");
  assert.equal(normalizePmsCommand({ action: "update_project", id, decisionId: "nope", delivery: base() }, ctx).reason, "invalid-decision-id");
  assert.equal(normalizePmsCommand({ action: "update_project", id, unblockResolution: "next-version", delivery: base() }, ctx).ok, true);
});

test("결정은 출처를 남기고, 같은 id·같은 내용의 재시도는 duplicate다", async () => {
  const ctx = { workspaceId, now: "2026-10-01T02:00:00.000Z" };
  const input = { action: "create_decision", id: decisionId, title: "A안으로 간다", rationale: "일정 안에 끝낼 수 있다", projectId: id, decidedAt: "2026-10-01T02:00:00.000Z", source: "project-unblock", sourceRef: { type: "project", id } };
  const command = normalizePmsCommand(input, ctx);
  assert.equal(command.ok, true);
  assert.deepEqual(command.record.meta, { source: "project-unblock", sourceRef: { type: "project", id } });
  assert.equal(normalizePmsCommand({ ...input, sourceRef: { type: "planet", id } }, ctx).reason, "invalid-source-ref");
  // 회의 리뷰에서 모은 결정은 회의 메모를 가리킨다(Q-CF4).
  assert.deepEqual(normalizePmsCommand({ ...input, source: "meeting-review", sourceRef: { type: "meeting", id: "note-1" } }, ctx).record.meta.sourceRef, { type: "meeting", id: "note-1" });

  const stored = structuredClone(command.record);
  const deps = {
    insert: async () => ({ persisted: false, reason: "duplicate" }),
    fetchRows: async () => [stored],
    update: async () => { throw Error("unexpected update"); },
  };
  assert.equal((await executePmsCommand(input, ctx, deps)).status, "duplicate");
  const changed = await executePmsCommand({ ...input, title: "B안으로 간다" }, ctx, deps);
  assert.equal(changed.status, "conflict");
  assert.equal(changed.error, "id-reuse-payload-mismatch");
});

test("그래서 할 일은 결정·신호 키를 meta에 달고, 결정 링크는 저장된 meta에 병합된다", async () => {
  const ctx = { workspaceId, now: "2026-10-01T02:00:00.000Z" };
  const task = normalizePmsCommand({ action: "create_task", id: taskId, title: "A안 견적 보내기", projectId: id, decisionId, signalKey: `work-blocked:${id}` }, ctx);
  assert.equal(task.ok, true);
  assert.equal(task.record.meta.decision_id, decisionId);
  assert.equal(task.record.meta.signal_key, `work-blocked:${id}`);
  assert.equal(normalizePmsCommand({ action: "create_task", id: taskId, title: "x", decisionId: "bad" }, ctx).reason, "invalid-decision-id");

  let decision = { id: decisionId, workspace_id: workspaceId, title: "A안", updated_at: "2026-10-01T02:00:00.000000+00:00", meta: { source: "project-unblock", sourceRef: { type: "project", id } } };
  const deps = {
    insert: async () => { throw Error("unexpected insert"); },
    fetchRows: async () => [structuredClone(decision)],
    update: async (_table, filters, patch) => {
      if (filters.some(([k, v]) => v !== `eq.${decision[k]}`)) return { persisted: false, reason: "no-matching-row", records: [] };
      decision = { ...decision, ...patch }; return { persisted: true, reason: "ok", records: [structuredClone(decision)] };
    },
  };
  const linked = await executePmsCommand({ action: "update_decision", id: decisionId, nextTaskId: taskId, unblockedProjectId: id }, ctx, deps);
  assert.equal(linked.status, "saved");
  assert.deepEqual(decision.meta, { source: "project-unblock", sourceRef: { type: "project", id }, nextTaskId: taskId, unblockedProjectId: id });
  assert.equal(normalizePmsCommand({ action: "update_decision", id: decisionId, nextTaskId: "x" }, ctx).reason, "invalid-next-task-id");
});
