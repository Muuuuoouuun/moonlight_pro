// CRM 넛지 엔진 — 순수 함수. 새 입력을 요구하지 않고 이미 연결된 것(캘린더·기록·메모·약속)만
// 읽어 "지금 이 고객에게 할 한 가지"를 만든다.
//
// 계약은 기회 탐색 넛지(2026-09-13)에서 그대로 가져왔다:
//   · 고객당 제안은 **하나** — 우선순위로 고른 뒤에 억제를 적용한다. 숨긴 직후 낮은 후보가
//     대신 튀어나오면 "숨겼는데 또 뜬다"가 된다.
//   · `triggerKey`는 내용의 지문이다. 제목·이름 같은 무관한 변경에 안정적이어야 하고,
//     사실이 바뀌면 새 계기가 된다(그때는 다시 보여도 맞다).
//   · 모든 넛지는 대상·이유·행동 하나·탈출구를 갖는다.
//
// severity: act(지금 할 것) · organize(정리) · recap(요약). 표시 위치가 이 값으로 갈린다.

import { kstDayKey, diffKstDays } from "../kst-day.js";
import { normalizeEntityName } from "./lead-enrichment.js";
import { MIN_MATCH_NAME_LENGTH } from "./calendar-touchpoints.js";

// 기약 없음을 다시 보는 간격(프로필 §7 권장: 한 달 뒤 재확인).
export const DORMANT_RECHECK_DAYS = 30;
// 우려·거절 뒤 후속이 없을 때 계기가 되는 창.
export const REACTION_OPEN_DAYS = 30;

// 위가 이긴다. 행동이 정리를 이기고, 그 안에서는 손실이 큰 것부터.
const RULE_ORDER = [
  "meeting_unrecorded",
  "promise_missed",
  "reaction_open",
  "promise_due",
  "no_next_action",
  "dormant_recheck",
];

const RULE_SEVERITY = {
  meeting_unrecorded: "act",
  promise_missed: "act",
  reaction_open: "act",
  promise_due: "act",
  no_next_action: "organize",
  dormant_recheck: "organize",
  memo_unlinked: "organize",
  weekly_recap: "recap",
};

function timeOf(value) {
  const t = new Date(value || "").getTime();
  return Number.isFinite(t) ? t : null;
}

// 내용 지문 — 같은 사실이면 같은 키, 사실이 바뀌면 새 키.
function triggerKey(ruleId, parts) {
  return `${ruleId}:${parts.filter((p) => p != null && p !== "").join("|")}`;
}

function latestActivity(activities, customer) {
  let best = null;
  for (const a of activities || []) {
    if (!belongsTo(a, customer)) continue;
    const at = timeOf(a.occurredAt);
    if (at == null) continue;
    if (!best || at > timeOf(best.occurredAt)) best = a;
  }
  return best;
}

function belongsTo(activity, customer) {
  if (!activity || !customer) return false;
  if (customer.id && activity.leadId && String(activity.leadId) === String(customer.id)) return true;
  if (customer.id && activity.dealId && String(activity.dealId) === String(customer.id)) return true;
  if (customer.id && activity.accountId && String(activity.accountId) === String(customer.id)) return true;
  if (customer.companyId && activity.companyId && String(activity.companyId) === String(customer.companyId)) return true;
  return false;
}

// 억제 적용: 미루기는 레코드 전체(그 날짜까지), 숨기기는 같은 triggerKey만.
export function isSuppressed(nudge, suppressions = {}, todayKey = "") {
  const entry = suppressions?.[nudge.subject.id];
  if (!entry) return false;
  if (entry.snoozedUntil && todayKey && String(entry.snoozedUntil) > todayKey) return true;
  const dismissedKey = entry.dismissed?.[nudge.triggerKey] ?? entry[nudge.triggerKey]?.dismissed;
  return Boolean(dismissedKey);
}

// 고객 한 명이 만들 수 있는 모든 후보. 우선순위 정렬 전.
function candidatesFor(customer, ctx) {
  const { activities, unrecordedByCustomer, todayKey } = ctx;
  const out = [];

  // ① 캘린더에 미팅이 있는데 기록이 없다 (N1이 찾아 준 것)
  const unrecorded = unrecordedByCustomer.get(String(customer.id));
  if (unrecorded) {
    out.push({
      ruleId: "meeting_unrecorded",
      triggerKey: triggerKey("meeting_unrecorded", [unrecorded.eventId || unrecorded.startAt]),
      title: `${unrecorded.title} — 기록이 없어요`,
      reason: `${kstDayKey(unrecorded.startAt)} 일정 · 기록을 못 찾았어요`,
      action: { kind: "record", label: "기록 남기기", prefill: { kind: unrecorded.channel } },
      escape: ["cancelled", "not-a-customer"],
      meta: { eventId: unrecorded.eventId },
    });
  }

  const nextAtKey = customer.nextActionAt ? kstDayKey(customer.nextActionAt) : "";
  const last = latestActivity(activities, customer);
  const lastAt = last ? timeOf(last.occurredAt) : null;

  // ② 약속한 날이 지났는데 그 뒤로 기록이 없다
  if (nextAtKey && todayKey && nextAtKey < todayKey) {
    const promisedMs = timeOf(customer.nextActionAt);
    const recordedAfter = lastAt != null && promisedMs != null && lastAt >= promisedMs;
    if (!recordedAfter) {
      const late = diffKstDays(nextAtKey, todayKey);
      out.push({
        ruleId: "promise_missed",
        triggerKey: triggerKey("promise_missed", [nextAtKey]),
        title: customer.nextAction || "약속한 연락",
        reason: `${nextAtKey}에 하기로 했어요 · ${late}일 지남`,
        action: { kind: "record", label: "기록 남기기", prefill: {} },
        escape: ["snooze"],
      });
    }
  }

  // ③ 오늘 하기로 한 것
  if (nextAtKey && todayKey && nextAtKey === todayKey) {
    out.push({
      ruleId: "promise_due",
      triggerKey: triggerKey("promise_due", [nextAtKey]),
      title: customer.nextAction || "오늘 연락하기로 한 고객",
      reason: "오늘 하기로 했어요",
      action: { kind: "record", label: "연락하기", prefill: {} },
      escape: ["snooze"],
    });
  }

  // ④ 우려·거절을 들은 뒤 아무 정리가 없다
  if (last && ["concern", "rejected"].includes(last.reaction)) {
    const ageDays = diffKstDays(kstDayKey(last.occurredAt), todayKey);
    if (ageDays <= REACTION_OPEN_DAYS && !customer.nextActionAt && !customer.dormant) {
      const quote = String(last.body || "").trim().slice(0, 14);
      out.push({
        ruleId: "reaction_open",
        triggerKey: triggerKey("reaction_open", [last.id || last.occurredAt]),
        title: last.reaction === "rejected" ? "거절 뒤 정리가 안 됐어요" : "우려를 들은 뒤 정리가 안 됐어요",
        reason: quote ? `"${quote}" · ${ageDays}일 전` : `${ageDays}일 전 기록`,
        action: { kind: "record", label: "후속 정하기", prefill: {} },
        escape: ["dismiss"],
      });
    }
  }

  // ⑤ 다음 행동이 비어 있다 (정리)
  if (!customer.nextAction && !customer.dormant && customer.open !== false) {
    out.push({
      ruleId: "no_next_action",
      triggerKey: triggerKey("no_next_action", [last?.id || "none"]),
      title: "다음 행동이 비어 있어요",
      reason: last ? `마지막 기록 ${diffKstDays(kstDayKey(last.occurredAt), todayKey)}일 전` : "아직 기록이 없어요",
      action: { kind: "record", label: "정하기", prefill: {} },
      escape: ["dismiss"],
    });
  }

  // ⑥ 기약 없음으로 둔 지 한 달 (정리)
  if (customer.dormant && customer.dormantSince) {
    const days = diffKstDays(kstDayKey(customer.dormantSince), todayKey);
    if (days >= DORMANT_RECHECK_DAYS) {
      out.push({
        ruleId: "dormant_recheck",
        triggerKey: triggerKey("dormant_recheck", [kstDayKey(customer.dormantSince)]),
        title: "한 달 지났어요 — 다시 볼까요?",
        reason: `${days}일째 기약 없음`,
        action: { kind: "record", label: "시점 정하기", prefill: {} },
        escape: ["snooze"],
      });
    }
  }

  return out;
}

// 고객별 넛지 — 고객당 하나. 억제는 최고 우선 후보를 고른 뒤에 적용한다.
export function buildCrmNudges({
  customers = [],
  activities = [],
  unrecordedMeetings = [],
  suppressions = {},
  now = Date.now(),
} = {}) {
  const todayKey = kstDayKey(new Date(now instanceof Date ? now.getTime() : Number(now) || Date.now()));
  const unrecordedByCustomer = new Map();
  for (const m of unrecordedMeetings || []) {
    const id = String(m?.customer?.id || "");
    if (id && !unrecordedByCustomer.has(id)) unrecordedByCustomer.set(id, m);
  }

  const ctx = { activities, unrecordedByCustomer, todayKey };
  const nudges = [];

  for (const customer of customers) {
    if (!customer?.id) continue;
    const candidates = candidatesFor(customer, ctx);
    if (!candidates.length) continue;

    candidates.sort((a, b) => RULE_ORDER.indexOf(a.ruleId) - RULE_ORDER.indexOf(b.ruleId));
    const top = candidates[0];
    const nudge = {
      ...top,
      severity: RULE_SEVERITY[top.ruleId] || "organize",
      subject: { type: customer.kind || "lead", id: customer.id, name: customer.name, companyId: customer.companyId || null },
    };
    // 억제는 여기서 — 후보를 고른 뒤라 숨긴 직후 다른 계기가 대신 튀지 않는다.
    if (isSuppressed(nudge, suppressions, todayKey)) continue;
    nudges.push(nudge);
  }

  return nudges.sort((a, b) => RULE_ORDER.indexOf(a.ruleId) - RULE_ORDER.indexOf(b.ruleId));
}

// 메모 넛지는 고객 축이 아니라 메모 축이다 — 본문에 고객명이 있는데 연결이 없는 메모.
export function buildMemoNudges({ memos = [], customers = [], suppressions = {}, now = Date.now() } = {}) {
  const todayKey = kstDayKey(new Date(now instanceof Date ? now.getTime() : Number(now) || Date.now()));
  const named = customers
    .map((c) => ({ customer: c, keys: [c.name, c.companyName].filter(Boolean).map(normalizeEntityName) }))
    .filter((entry) => entry.keys.some((k) => k.length >= MIN_MATCH_NAME_LENGTH));

  const out = [];
  for (const memo of memos || []) {
    if (!memo?.id || memo.linked) continue;
    const haystack = normalizeEntityName(`${memo.title || ""} ${memo.body || ""}`);
    if (!haystack) continue;
    let hit = null;
    for (const entry of named) {
      const key = entry.keys.find((k) => k.length >= MIN_MATCH_NAME_LENGTH && haystack.includes(k));
      if (key && (!hit || key.length > hit.key.length)) hit = { key, customer: entry.customer };
    }
    if (!hit) continue;
    const nudge = {
      ruleId: "memo_unlinked",
      triggerKey: triggerKey("memo_unlinked", [memo.id]),
      severity: RULE_SEVERITY.memo_unlinked,
      subject: { type: "memo", id: memo.id, name: memo.title || "제목 없는 메모", companyId: hit.customer.companyId || null },
      title: `이 메모, ${hit.customer.name} 이야기 같아요`,
      reason: memo.occurredAt ? `${kstDayKey(memo.occurredAt)} 메모 · 연결 없음` : "연결 없음",
      action: { kind: "memo-record", label: "기록으로 정리", prefill: { customer: hit.customer } },
      escape: ["dismiss"],
    };
    if (isSuppressed(nudge, suppressions, todayKey)) continue;
    out.push(nudge);
  }
  return out;
}
