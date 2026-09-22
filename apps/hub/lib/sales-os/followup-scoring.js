// Follow-up scoring — pure, IO-free. Closes the outcome -> triage learning loop:
// yesterday's outreach result changes today's call list. Kept @/-free so it unit-tests
// standalone (mirrors sheets-normalize). Legible, additive signals on purpose — no opaque ML.

// outreach action -> momentum. Positive engagement pulls a lead UP the list (strike while warm);
// no_response / lost push it DOWN. won is terminal (leaves the active funnel anyway).
export const ACTION_MOMENTUM = {
  meeting: 30,
  proposal: 28,
  replied: 18,
  won: 0,
  sent: -4,
  no_response: -16,
  lost: -40,
};

// Recency-decayed boost added to triage priority. Full weight today, ~half at 7d, ~0 by 21d.
// ageDays null (unknown date) -> half weight. Pure: callers pass the already-computed ageDays.
export function outcomeBoost({ action = null, ageDays = null } = {}) {
  if (!action) return 0;
  const base = ACTION_MOMENTUM[String(action).toLowerCase()] ?? 0;
  if (base === 0) return 0;
  const decay = ageDays == null ? 0.5 : Math.max(0, 1 - ageDays / 21);
  return Math.round(base * decay * 10) / 10;
}

// Centralized priority: staleness (primary) + value + learned outcome boost.
export function priorityFor({ sinceDays = null, threshold = 3, valueTerm = 0, boost = 0 } = {}) {
  const staleTerm = (sinceDays == null ? threshold : sinceDays) * 10;
  return Math.round((staleTerm + valueTerm + boost) * 100) / 100;
}

// A "기약 없음" (no fixed next-action date) contact stays out of the active follow-up list
// until this many days have passed since it was marked dormant — then it resurfaces for a
// recheck (docs/operator-workflow-profile.md §7 권장: 한 달 뒤 다시 확인 대상).
export const DORMANT_RESURFACE_DAYS = 30;

export function shouldResurfaceDormant(dormantSinceDays) {
  return dormantSinceDays != null && dormantSinceDays >= DORMANT_RESURFACE_DAYS;
}

// Derived 0-100 lead score from outreach history — the periodic leads.score recompute input.
// Starts neutral (40), recent last action moves it, repeated engagement compounds.
export function momentumScore({ lastAction = null, ageDays = null, replies = 0, meetings = 0, noResponses = 0 } = {}) {
  let s = 40;
  if (lastAction) {
    const base = ACTION_MOMENTUM[String(lastAction).toLowerCase()] ?? 0;
    const decay = ageDays == null ? 0.5 : Math.max(0, 1 - ageDays / 21);
    s += base * decay;
  }
  s += meetings * 12 + replies * 6 - noResponses * 8;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ── crm_activities → 학습 어휘 (2026-09-21 0a) ──────────────────────────────────────
// 연락 결과의 저장소는 crm_activities 하나다 — UI 두 곳(고객 DB 컨택 시트·고객 연락 인라인
// 폼)이 record_contact_outcome_v1로 쓴다. 큐의 boost·momentum은 위 outreach 어휘
// (ACTION_MOMENTUM)를 그대로 쓰므로 kind·reaction을 그 어휘로 접는다. 대화가 아닌 기록
// (note/update/deal/ai)은 null → boost 0. 반응 어휘는 0016 CHECK와 동일.
export const CONTACT_KINDS = new Set(["call", "kakao", "meeting", "demo", "visit", "info_session", "email", "quote"]);
const MEETING_KINDS = new Set(["meeting", "demo", "visit", "info_session"]);
const ENGAGED_REACTIONS = new Set(["positive", "neutral", "concern"]);

export const KIND_LABEL = {
  call: "통화", kakao: "카톡", meeting: "미팅", demo: "데모", visit: "방문", info_session: "설명회",
  email: "이메일", quote: "견적", note: "메모", update: "업데이트", deal: "딜", ai: "AI",
};
export const REACTION_LABEL = { positive: "긍정", neutral: "중립", concern: "우려", rejected: "거절", no_response: "무응답" };

export function activityToOutcomeAction({ kind = null, reaction = null } = {}) {
  const k = String(kind || "").toLowerCase();
  if (!CONTACT_KINDS.has(k)) return null;
  const r = String(reaction || "").toLowerCase();
  if (r === "no_response") return "no_response";
  if (r === "rejected") return "lost";
  if (MEETING_KINDS.has(k)) return "meeting";
  if (k === "quote") return "proposal";
  if (ENGAGED_REACTIONS.has(r)) return "replied";
  return "sent";
}
