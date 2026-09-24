import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

// followups-actions는 기존 쓰기 경로(persistRevenueRecord·updateSupabaseRecord) 위에 얇게 얹힌다.
// 순수 검증은 그대로, IO는 스텁으로 고정한다.
const stubs = {
  "@/lib/server-read": `
export function eqFilter(value) { return \`eq.\${value}\`; }
export async function fetchSupabaseRows(table, options = {}) {
  globalThis.__actions.calls.push({ op: "read", table, options });
  return globalThis.__actions.readRows;
}
`,
  "@/lib/server-write": `
export function resolveDefaultWorkspaceId() { return "ws-1"; }
export async function updateSupabaseRecord(table, filters, patch) {
  globalThis.__actions.calls.push({ op: "update", table, filters, patch });
  return globalThis.__actions.updateResult;
}
`,
  "@/lib/sales-os/revenue-write": `
export function buildFollowupWrite(payload) { return { built: payload }; }
export async function persistRevenueRecord(args) {
  globalThis.__actions.calls.push({ op: "persist", args });
  return globalThis.__actions.persistResult;
}
`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__actions = { calls: [], readRows: [], updateResult: { persisted: true }, persistResult: { status: "saved" } };
const {
  annotateContactActivity,
  parseActivityAnnotation,
  parseReschedule,
  rescheduleFollowup,
} = await import("./followups-actions.js?stubbed");

beforeEach(() => {
  state.calls = [];
  state.readRows = [{ id: "act-1", meta: { reaction_note: "keep" } }];
  state.updateResult = { persisted: true };
  state.persistResult = { status: "saved", id: "lead-1" };
});

test("reschedule accepts only a known entity kind, an id and a calendar date", () => {
  assert.deepEqual(parseReschedule({ kind: "lead", id: "lead-1", at: "2026-09-26" }), { ok: true, table: "leads", id: "lead-1", at: "2026-09-26" });
  assert.equal(parseReschedule({ kind: "deal", id: "d", at: "2026-09-26" }).table, "deals");
  assert.equal(parseReschedule({ kind: "account", id: "a", at: "2026-09-26" }).table, "customer_accounts");
  assert.equal(parseReschedule({ kind: "task", id: "x", at: "2026-09-26" }).reason, "invalid-kind");
  assert.equal(parseReschedule({ kind: "lead", id: " ", at: "2026-09-26" }).reason, "missing-id");
  assert.equal(parseReschedule({ kind: "lead", id: "x", at: "내일" }).reason, "invalid-date");
});

test("reschedule moves only the promise date through the follow-up write (no contact record)", async () => {
  const res = await rescheduleFollowup({ kind: "lead", id: "lead-1", at: "2026-09-26" });
  assert.equal(res.status, "saved");
  const call = state.calls.find((c) => c.op === "persist").args;
  assert.equal(call.table, "leads");
  assert.equal(call.op, "update");
  assert.equal(call.id, "lead-1");
  assert.deepEqual(call.payload, { at: "2026-09-26" }); // text 없음 — 약속 내용은 그대로 둔다
  assert.deepEqual(call.build({ at: "x" }), { built: { at: "x" } }); // buildFollowupWrite
  // preview(백엔드 미구성)는 그대로 돌려준다 — 성공으로 바꾸지 않는다.
  state.persistResult = { status: "preview", reason: "missing-workspace" };
  assert.equal((await rescheduleFollowup({ kind: "lead", id: "lead-1", at: "2026-09-26" })).status, "preview");
  const bad = await rescheduleFollowup({ kind: "lead", id: "lead-1", at: "soon" });
  assert.deepEqual(bad, { status: "invalid-input", reason: "invalid-date" });
});

test("annotation keeps only bounded timing, known sources and a recent real contact time", () => {
  const now = Date.parse("2026-09-24T06:00:00Z");
  const ok = parseActivityAnnotation({
    activityId: "act-1",
    occurredAt: "2026-09-23T05:00:00Z",
    capture: { recordSeconds: 24.4, source: "calendar", candidateId: "cal:evt-1", durationSec: 240 },
  }, now);
  assert.deepEqual(ok, {
    ok: true,
    activityId: "act-1",
    capture: { record_seconds: 24, source: "calendar", candidate_id: "cal:evt-1", duration_sec: 240 },
    occurredAt: "2026-09-23T05:00:00.000Z",
  });
  // 낙관 행 id·미래 시각·먼 과거·엉뚱한 출처는 받지 않는다.
  assert.equal(parseActivityAnnotation({ activityId: "local-123", capture: { recordSeconds: 5 } }, now).ok, false);
  assert.equal(parseActivityAnnotation({ activityId: "a", occurredAt: "2026-09-25T06:00:00Z" }, now).reason, "nothing-to-write");
  assert.equal(parseActivityAnnotation({ activityId: "a", occurredAt: "2026-07-01T06:00:00Z" }, now).reason, "nothing-to-write");
  assert.deepEqual(parseActivityAnnotation({ activityId: "a", capture: { recordSeconds: 0, source: "fax" } }, now).reason, "nothing-to-write");
});

test("annotation merges into the existing activity meta and never writes over an unread meta", async () => {
  const res = await annotateContactActivity({ activityId: "act-1", capture: { recordSeconds: 18, source: "sheet" } });
  assert.equal(res.status, "saved");
  const update = state.calls.find((c) => c.op === "update");
  assert.equal(update.table, "crm_activities");
  assert.deepEqual(update.filters, [["id", "eq.act-1"], ["workspace_id", "eq.ws-1"]]);
  assert.deepEqual(update.patch, { meta: { reaction_note: "keep", capture: { record_seconds: 18, source: "sheet" } } });

  state.calls = [];
  state.readRows = null; // 읽기 실패
  const unread = await annotateContactActivity({ activityId: "act-1", capture: { recordSeconds: 18 } });
  assert.equal(unread.status, "failed");
  assert.ok(!state.calls.some((c) => c.op === "update"), "기존 meta를 못 읽으면 쓰지 않는다");

  state.readRows = [];
  assert.equal((await annotateContactActivity({ activityId: "act-1", capture: { recordSeconds: 18 } })).reason, "activity-not-found");

  state.readRows = [{ id: "act-1", meta: {} }];
  state.updateResult = { persisted: false, reason: "missing-config" };
  assert.equal((await annotateContactActivity({ activityId: "act-1", capture: { recordSeconds: 18 } })).status, "preview");
});
