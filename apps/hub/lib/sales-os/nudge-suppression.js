// 넛지 억제 저장 — 대상 레코드의 meta.nudges에 쌓는다(마이그레이션 0).
//
// 입력 검증과 patch 모양은 순수 함수로 분리한다(buildNudgeSuppressionWrite). 쓰기는
// persistRevenueRecord를 그대로 쓰므로 기존 meta 병합 계약(읽기 실패 시 저장 중단 —
// 빈 meta 위에 덮어써 형제 키를 날리지 않는다)이 그대로 적용된다.

import { eqFilter, fetchSupabaseRows } from "../server-read.js";
import { resolveDefaultWorkspaceId } from "../server-write.js";
import { persistRevenueRecord } from "./revenue-write.js";

const ACTIONS = new Set(["snooze", "dismiss", "resume"]);
const SUBJECTS = { lead: "leads", deal: "deals", account: "customer_accounts" };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function buildNudgeSuppressionWrite(input = {}) {
  const subjectType = String(input.subjectType || "");
  const table = SUBJECTS[subjectType];
  if (!table) return { ok: false, reason: "invalid-subject" };
  if (!input.subjectId) return { ok: false, reason: "missing-subject-id" };

  const action = String(input.action || "");
  if (!ACTIONS.has(action)) return { ok: false, reason: "invalid-action" };

  const triggerKey = String(input.triggerKey || "").trim();
  // 숨기기는 "무엇을" 숨기는지가 있어야 한다 — 키 없이 숨기면 그 고객이 영구히 조용해진다.
  if (action === "dismiss" && !triggerKey) return { ok: false, reason: "missing-trigger-key" };

  const until = String(input.until || "").trim();
  if (action === "snooze" && !DATE_ONLY.test(until)) return { ok: false, reason: "invalid-until" };

  return { ok: true, table, id: input.subjectId, action, triggerKey, until };
}

// meta.nudges 한 조각. 기존 억제는 보존하고 이번 것만 얹는다.
export function buildNudgeMetaPatch(current = {}, { action, triggerKey, until, at = new Date().toISOString() } = {}) {
  const base = current && typeof current === "object" ? current : {};
  const dismissed = { ...(base.dismissed || {}) };

  if (action === "resume") {
    if (triggerKey) delete dismissed[triggerKey];
    return { ...base, snoozedUntil: null, dismissed, at };
  }
  if (action === "snooze") return { ...base, snoozedUntil: until, dismissed, at };
  dismissed[triggerKey] = true;
  return { ...base, dismissed, at };
}

// persistRevenueRecord의 meta 병합은 **얕다** — `meta.nudges`를 통째로 갈아끼운다.
// 빈 값에서 patch를 만들면 A를 숨긴 뒤 미루기를 하는 순간 A의 숨김이 사라진다.
// 그래서 현재 nudges를 먼저 읽어 그 위에 얹는다. 읽기에 실패하면 저장을 중단한다 —
// 모르는 상태 위에 덮어쓰는 것이 조용히 억제를 날리는 경로다.
async function readCurrentNudges(table, id) {
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId) return { ok: true, nudges: {} }; // 미구성 — persistRevenueRecord가 preview로 답한다
  const rows = await fetchSupabaseRows(table, {
    select: "meta",
    filters: [["id", eqFilter(id)], ["workspace_id", eqFilter(workspaceId)]],
    limit: 1,
  });
  if (!Array.isArray(rows)) return { ok: false };
  const meta = rows[0]?.meta;
  const nudges = meta && typeof meta === "object" && meta.nudges && typeof meta.nudges === "object" ? meta.nudges : {};
  return { ok: true, nudges };
}

export async function persistNudgeSuppression({ table, id, action, triggerKey, until }) {
  const current = await readCurrentNudges(table, id);
  if (!current.ok) {
    return { status: "failed", reason: "nudge-meta-read-failed", detail: "기존 넛지 설정을 읽지 못해 저장을 중단했습니다." };
  }
  const nudges = buildNudgeMetaPatch(current.nudges, { action, triggerKey, until });
  return persistRevenueRecord({
    table,
    op: "update",
    id,
    payload: {},
    build: () => ({ columns: {}, metaPatch: { nudges } }),
  });
}
