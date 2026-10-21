import assert from "node:assert/strict";
import { test } from "node:test";
import { executePmsCommand } from "./pms-command-service.ts";
import { normalizePmsCommand } from "./pms-command.ts";

// 결정 데스크(2026-10-15 결정 데스크 스펙 §4) — 질문·선택지·고른 선택지·미루기는 decisions.meta에 둔다.
// 고르지 않은 선택지는 지우지 않고, 고른 선택지는 저장된 선택지 안에 있어야 한다.
const decisionId = "44444444-4444-4444-8444-444444444444";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const ctx = { workspaceId, now: "2026-10-15T02:00:00.000Z" };
const options = [
  { id: "a", title: "핵심 기능만 이번에", gain: "목표일 지킴", loss: "보고서는 다음 버전" },
  { id: "b", title: "전체 범위", gain: "한 번에 끝", loss: "목표일 2주 밀림" },
];

test("create_decision: 질문·선택지·고른 선택지를 meta에 싣고, 비어 있는 키는 두지 않는다", () => {
  const created = normalizePmsCommand({ action: "create_decision", id: decisionId, title: "핵심 기능만 이번에", question: "범위를 어디까지로 할지", options, chosenOptionId: "a", decidedAt: "2026-10-15" }, ctx);
  assert.equal(created.ok, true);
  assert.deepEqual(created.record.meta, { source: "manual", question: "범위를 어디까지로 할지", options, chosenOptionId: "a" });

  const draft = normalizePmsCommand({ action: "create_decision", id: decisionId, title: "범위를 어디까지로 할지", question: "범위를 어디까지로 할지", options: [{ id: "a", title: "A안" }], deferUntil: "2026-10-22" }, ctx);
  assert.deepEqual(draft.record.meta.options, [{ id: "a", title: "A안", gain: "", loss: "" }]);
  assert.equal(draft.record.meta.deferUntil, "2026-10-22");
  assert.equal("chosenOptionId" in draft.record.meta, false);

  const plain = normalizePmsCommand({ action: "create_decision", id: decisionId, title: "그냥 결정" }, ctx);
  assert.deepEqual(plain.record.meta, { source: "manual" }, "예전 호출은 meta가 그대로");
});

test("선택지는 5개까지, id는 겹치지 않고, 고른 것은 그 안에 있어야 한다", () => {
  const reason = (fields) => normalizePmsCommand({ action: "create_decision", id: decisionId, title: "x", ...fields }, ctx).reason;
  assert.equal(reason({ options: Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, title: `${i}` })) }), "too-many-options");
  assert.equal(reason({ options: [{ id: "a", title: "A" }, { id: "a", title: "B" }] }), "invalid-options");
  assert.equal(reason({ options: [{ id: "a", title: "" }] }), "invalid-options");
  assert.equal(reason({ options: "a" }), "invalid-options");
  assert.equal(reason({ options, chosenOptionId: "c" }), "invalid-chosen-option");
  assert.equal(reason({ chosenOptionId: "a" }), "invalid-chosen-option", "선택지 없이 고를 수 없다");
  assert.equal(reason({ deferUntil: "2026-02-30" }), "invalid-defer-until");
});

test("같은 id 재시도는 선택지까지 같아야 duplicate — 다른 선택지면 충돌", async () => {
  const input = { action: "create_decision", id: decisionId, title: "핵심 기능만 이번에", question: "범위", options, chosenOptionId: "a", decidedAt: "2026-10-15T02:00:00.000Z" };
  const stored = normalizePmsCommand(input, ctx).record;
  const deps = {
    insert: async () => ({ persisted: false, reason: "duplicate", records: [] }),
    fetchRows: async () => [structuredClone(stored)],
    update: async () => { throw Error("unexpected update"); },
  };
  assert.equal((await executePmsCommand(input, ctx, deps)).status, "duplicate");
  const changed = await executePmsCommand({ ...input, chosenOptionId: "b" }, ctx, deps);
  assert.equal(changed.status, "conflict");
});

test("update_decision: 미정 초안을 확정하면 meta가 병합되고, 없는 선택지를 고르면 거절, 선택지를 바꾸면 사라진 선택은 비운다", async () => {
  let decision = { id: decisionId, workspace_id: workspaceId, title: "범위", decided_at: null, updated_at: "2026-10-14T02:00:00.000000+00:00",
    meta: { source: "project-unblock", sourceRef: { type: "project", id: "11111111-1111-4111-8111-111111111111" }, question: "범위", options, deferUntil: "2026-10-20" } };
  const deps = {
    insert: async () => { throw Error("unexpected insert"); },
    fetchRows: async () => [structuredClone(decision)],
    update: async (_table, filters, patch) => {
      if (filters.some(([k, v]) => v !== `eq.${decision[k]}`)) return { persisted: false, reason: "no-matching-row", records: [] };
      decision = { ...decision, ...patch }; return { persisted: true, reason: "ok", records: [structuredClone(decision)] };
    },
  };
  const decide = await executePmsCommand({ action: "update_decision", id: decisionId, title: "핵심 기능만 이번에", decidedAt: "2026-10-15", chosenOptionId: "a", deferUntil: null }, ctx, deps);
  assert.equal(decide.status, "saved");
  assert.equal(decision.meta.chosenOptionId, "a");
  assert.equal(decision.meta.deferUntil, null);
  assert.equal(decision.meta.source, "project-unblock", "출처는 보존");
  assert.deepEqual(decision.meta.options, options, "고르지 않은 선택지도 남는다");

  const missing = await executePmsCommand({ action: "update_decision", id: decisionId, chosenOptionId: "z" }, ctx, deps);
  assert.equal(missing.status, "invalid-input");

  const replaced = await executePmsCommand({ action: "update_decision", id: decisionId, options: [{ id: "c", title: "C안" }] }, ctx, deps);
  assert.equal(replaced.status, "saved");
  assert.equal(decision.meta.chosenOptionId, null);

  assert.equal(normalizePmsCommand({ action: "update_decision", id: decisionId, options: [{ id: "a", title: "A" }], chosenOptionId: "b" }, ctx).reason, "invalid-chosen-option");
  assert.equal(normalizePmsCommand({ action: "update_decision", id: decisionId, deferUntil: "내일" }, ctx).reason, "invalid-defer-until");
});
