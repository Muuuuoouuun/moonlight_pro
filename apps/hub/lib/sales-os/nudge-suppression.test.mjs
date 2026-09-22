import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// revenue-write → customer-delete까지 딸려오므로 그쪽이 쓰는 export도 스텁에 있어야 한다.
const readStub = `
export function eqFilter(v) { return \`eq.\${v}\`; }
export function inFilter(values) { return \`in.(\${values.join(",")})\`; }
export function withWorkspaceFilter(f = []) { return f; }
export async function fetchSupabaseRows() { return globalThis.__nudgeRows; }
export async function fetchSupabaseRowsDetailed() { return { rows: [], error: null }; }
`;
const writeStub = `
export function resolveDefaultWorkspaceId() { return "ws-1"; }
export function resolveSupabaseConfig() { return { url: "https://x.test", key: "k" }; }
export async function upsertSupabaseRecords() { return { persisted: false, reason: "stub" }; }
export async function updateSupabaseRecord(table, filters, patch) {
  globalThis.__nudgeWrite = { table, filters, patch };
  return { persisted: true, record: null };
}
export async function insertSupabaseRecord() { return { persisted: false, reason: "stub" }; }
export async function deleteSupabaseRecord() { return { persisted: false, reason: "stub" }; }
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "../server-read.js") return { url: `data:text/javascript,${encodeURIComponent(readStub)}`, shortCircuit: true };
    if (specifier === "../server-write.js") return { url: `data:text/javascript,${encodeURIComponent(writeStub)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

globalThis.__nudgeRows = [];
const { buildNudgeMetaPatch, buildNudgeSuppressionWrite, persistNudgeSuppression } =
  await import("./nudge-suppression.js?suppression");

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const DEAL_ID = "22222222-2222-4222-8222-222222222222";

test("input validation names what is wrong instead of writing a half-formed record", () => {
  assert.equal(buildNudgeSuppressionWrite({ subjectType: "memo", subjectId: LEAD_ID, action: "dismiss" }).reason, "invalid-subject");
  assert.equal(buildNudgeSuppressionWrite({ subjectType: "lead", action: "dismiss" }).reason, "missing-subject-id");
  // 비UUID가 통과하면 PostgREST 캐스팅 오류 → failed → 라우트 502. 입력 오류를 서버 장애로
  // 보고하지 않도록 형식도 여기서 막는다.
  assert.equal(buildNudgeSuppressionWrite({ subjectType: "lead", subjectId: "l1", action: "dismiss", triggerKey: "k" }).reason, "invalid-subject-id");
  assert.equal(buildNudgeSuppressionWrite({ subjectType: "lead", subjectId: LEAD_ID, action: "nope" }).reason, "invalid-action");
  // 키 없이 숨기면 그 고객이 영구히 조용해진다.
  assert.equal(buildNudgeSuppressionWrite({ subjectType: "lead", subjectId: LEAD_ID, action: "dismiss" }).reason, "missing-trigger-key");
  assert.equal(buildNudgeSuppressionWrite({ subjectType: "lead", subjectId: LEAD_ID, action: "snooze", until: "내일" }).reason, "invalid-until");

  const ok = buildNudgeSuppressionWrite({ subjectType: "deal", subjectId: DEAL_ID, action: "snooze", until: "2026-10-01" });
  assert.deepEqual({ ok: ok.ok, table: ok.table, until: ok.until }, { ok: true, table: "deals", until: "2026-10-01" });
});

test("a later snooze must not erase earlier dismissals", () => {
  const afterDismiss = buildNudgeMetaPatch({}, { action: "dismiss", triggerKey: "promise_missed:2026-09-20", at: "t1" });
  assert.deepEqual(afterDismiss.dismissed, { "promise_missed:2026-09-20": true });

  const afterSnooze = buildNudgeMetaPatch(afterDismiss, { action: "snooze", until: "2026-10-01", at: "t2" });
  assert.equal(afterSnooze.snoozedUntil, "2026-10-01");
  // 이게 이 파일의 핵심 — 얕은 덮어쓰기면 여기서 숨김이 사라진다.
  assert.deepEqual(afterSnooze.dismissed, { "promise_missed:2026-09-20": true });
});

test("resume clears the snooze and only the named dismissal", () => {
  const state = buildNudgeMetaPatch(
    { snoozedUntil: "2026-10-01", dismissed: { a: true, b: true } },
    { action: "resume", triggerKey: "a", at: "t3" },
  );
  assert.equal(state.snoozedUntil, null);
  assert.deepEqual(state.dismissed, { b: true });
});

test("a failed read of the existing suppressions aborts the write", async () => {
  globalThis.__nudgeRows = null; // read 실패
  const res = await persistNudgeSuppression({ table: "leads", id: "l1", action: "dismiss", triggerKey: "k" });
  // 모르는 상태 위에 덮어쓰면 조용히 억제가 날아간다 — 저장하지 않고 이름을 댄다.
  assert.equal(res.status, "failed");
  assert.equal(res.reason, "nudge-meta-read-failed");
});

test("existing suppressions and sibling meta keys both survive the write", async () => {
  globalThis.__nudgeRows = [{ meta: { nudges: { dismissed: { old: true } }, workspace: "classin" } }];
  globalThis.__nudgeWrite = null;

  const res = await persistNudgeSuppression({ table: "leads", id: "l1", action: "dismiss", triggerKey: "new" });
  assert.equal(res.status, "saved");

  const written = globalThis.__nudgeWrite.patch.meta;
  // 이전 숨김이 남아 있고 이번 것이 더해졌다.
  assert.deepEqual(written.nudges.dismissed, { old: true, new: true });
  // 형제 meta 키(workspace 등)도 날아가지 않는다 — persistRevenueRecord의 병합 계약.
  assert.equal(written.workspace, "classin");
});
