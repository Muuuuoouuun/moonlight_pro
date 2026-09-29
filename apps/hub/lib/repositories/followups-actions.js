// 오늘 연락(2026-09-24)의 쓰기 두 가지 — 둘 다 작은 기존 경로 위에 얹는다.
//
// 1) 약속 날짜 다시 잡기: 놓친 약속의 [날짜 다시]와 기약 없음의 [시점 정하기]. 연락을 한 게
//    아니므로 연락 기록 RPC(record_contact_outcome_v1)를 쓰지 않는다 — 기록 없이 날짜만 옮긴다.
//    저장은 통합 라우트가 이미 쓰는 buildFollowupWrite + persistRevenueRecord(기존 meta 병합)다.
// 2) 방금 저장한 연락 기록에 꼬리표 달기: 기록창을 연 뒤 저장까지 걸린 초와, 기록 후보(캘린더·
//    통화)에서 온 기록이면 실제 연락 시각·통화 길이. RPC v1은 occurred_at을 now()로 쓰고 meta를
//    받지 않으므로(0042) 저장 직후 같은 행을 한 번 더 고친다. 실패해도 기록 자체는 이미 저장됐다.

import { eqFilter, fetchSupabaseRows } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, updateSupabaseRecord } from "@/lib/server-write";
import { buildFollowupWrite, persistRevenueRecord } from "@/lib/sales-os/revenue-write";

const TABLE_BY_KIND = { lead: "leads", deal: "deals", account: "customer_accounts" };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

// 순수 — 입력 검증만. { ok, table, id, at } | { ok:false, reason }
export function parseReschedule(input = {}) {
  const table = TABLE_BY_KIND[String(input.kind || "")];
  if (!table) return { ok: false, reason: "invalid-kind" };
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return { ok: false, reason: "missing-id" };
  const at = String(input.at || "").trim();
  if (!DATE_ONLY.test(at) || Number.isNaN(Date.parse(at))) return { ok: false, reason: "invalid-date" };
  return { ok: true, table, id, at };
}

export async function rescheduleFollowup(input = {}) {
  const parsed = parseReschedule(input);
  if (!parsed.ok) return { status: "invalid-input", reason: parsed.reason };
  // 날짜를 다시 잡으면 기약 없음도 풀린다(buildFollowupWrite: dormant false · dormant_since null).
  const result = await persistRevenueRecord({
    table: parsed.table,
    op: "update",
    id: parsed.id,
    payload: { at: parsed.at },
    build: buildFollowupWrite,
  });
  return { ...result, at: parsed.at };
}

const CAPTURE_SOURCES = new Set(["sheet", "calendar", "phone"]);

function boundedInt(value, min, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// 순수 — 꼬리표 입력 정리. 아무것도 남지 않으면 null(쓰기 생략).
export function parseActivityAnnotation(input = {}, now = Date.now()) {
  const activityId = typeof input.activityId === "string" ? input.activityId.trim() : "";
  if (!activityId || activityId.startsWith("local-")) return { ok: false, reason: "missing-activity" };

  const raw = input.capture && typeof input.capture === "object" ? input.capture : {};
  const capture = {};
  const seconds = boundedInt(raw.recordSeconds, 1, 3600);
  if (seconds != null) capture.record_seconds = seconds;
  if (CAPTURE_SOURCES.has(raw.source)) capture.source = raw.source;
  if (typeof raw.candidateId === "string" && raw.candidateId.trim()) capture.candidate_id = raw.candidateId.trim().slice(0, 120);
  const duration = boundedInt(raw.durationSec, 0, 86400);
  if (duration != null) capture.duration_sec = duration;

  // 실제 연락 시각 — 후보에서 온 기록만 보낸다. 미래나 30일보다 먼 과거는 받지 않는다.
  let occurredAt = null;
  if (input.occurredAt) {
    const t = Date.parse(String(input.occurredAt));
    if (Number.isFinite(t) && t <= now + 5 * 60000 && t >= now - 30 * DAY_MS) occurredAt = new Date(t).toISOString();
  }

  if (!Object.keys(capture).length && !occurredAt) return { ok: false, reason: "nothing-to-write" };
  return { ok: true, activityId, capture, occurredAt };
}

export async function annotateContactActivity(input = {}, { workspaceId = resolveDefaultWorkspaceId() } = {}) {
  const parsed = parseActivityAnnotation(input);
  if (!parsed.ok) return { status: "invalid-input", reason: parsed.reason };
  if (!workspaceId) return { status: "preview", reason: "missing-workspace" };

  const filters = [["id", eqFilter(parsed.activityId)], ["workspace_id", eqFilter(workspaceId)]];
  const rows = await fetchSupabaseRows("crm_activities", { select: "id,meta", filters, limit: 1 });
  // 기존 meta를 못 읽었으면 쓰지 않는다 — 빈 meta 위에 덮으면 형제 키가 사라진다.
  if (!Array.isArray(rows)) return { status: "failed", reason: "meta-read-failed" };
  if (!rows[0]) return { status: "failed", reason: "activity-not-found" };

  const existing = rows[0].meta && typeof rows[0].meta === "object" ? rows[0].meta : {};
  const patch = {};
  if (Object.keys(parsed.capture).length) {
    patch.meta = { ...existing, capture: { ...(existing.capture || {}), ...parsed.capture } };
  }
  if (parsed.occurredAt) patch.occurred_at = parsed.occurredAt;

  const res = await updateSupabaseRecord("crm_activities", filters, patch);
  if (!res.persisted) {
    return res.reason === "missing-config"
      ? { status: "preview", reason: res.reason }
      : { status: "failed", reason: res.reason || "update-failed" };
  }
  return { status: "saved", activityId: parsed.activityId };
}
