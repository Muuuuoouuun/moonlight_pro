// 기록 기반 Guru 추천 — 순수 함수. 새 입력을 요구하지 않고 이미 저장된 사실만 읽는다.
//
// 운영자 결정(2026-09-25, docs/superpowers/specs/2026-09-24-agent-layer-direction.md §2.1 ⑦):
// 저장된 사실이 확인될 때만 플레이북 원문 속 구체 기법 하나를 고르고, 그 사실을 "왜 이
// 추천인가"로 함께 보인다. 모델 호출·업무 생성·알림·발송은 하지 않는다 — 추천은 읽을거리다.
//
// 규칙과 제외 조건은 docs/sales-guru-knowledge-base.md의 해당 절과
// docs/research/2026-09-24-guru-source-quality.md를 따른다.
//   · 날짜는 운영자가 스스로 정한 약속이다. "고객이 무응답"이라고 쓰지 않는다.
//   · 우려의 내용은 추정하지 않는다 — 반응이 '우려'였다는 기록만 쓴다.
//   · 연속 무응답·거절 뒤에는 원문에 압박 기법만 남으므로 추천하지 않는다.
//   · 단계를 몰라 potential로 떨어진 행은 단계 사실로 쓰지 않는다 — 견적·최종미팅·클로징만.
//   · 넓은 new/active/dormant 구분만으로 구체 기법을 고르지 않는다(09-25 객관 점검 §상황 적합성).

import { kstDayKey, diffKstDays } from "../kst-day.js";
import { dealStageLabel } from "../deal-stages.js";
import { channelLabel } from "./contact-record.js";
import { adviceScopeForRecord } from "./advice-scope.js";

// 운영자의 접촉이 아닌 자동·내부 기록 — crm-nudges.js의 AUTO_ACTIVITY_KINDS와 같은 목록.
// 딜 단계를 옮기기만 해도 kind='deal' 행이 생기므로 거르지 않으면 "연락했다"로 오인한다.
const AUTO_ACTIVITY_KINDS = new Set(["deal", "ai", "update"]);

// 반응을 기록한 연락이 이 창보다 오래됐으면 지금의 근거로 쓰지 않는다
// (crm-nudges.js REACTION_OPEN_DAYS와 같은 30일).
export const RECOMMENDATION_REACTION_DAYS = 30;
// 신규 리드의 "아직 연락 기록 없음"이 첫 접촉 준비의 근거가 되는 창.
export const NEW_LEAD_DAYS = 30;

// 위가 이긴다. 기한을 넘긴 고객 약속 → 오늘 정한 연락 → 결정에 가까운 반응 → 정리 순
// (운영자 프로필 §4 임시 우선순위). 고객당 추천은 하나다.
export const GURU_RECOMMENDATION_RULES = Object.freeze([
  Object.freeze({ id: "quote-date-passed", cardId: "sales-meddic", severity: "act" }),
  Object.freeze({ id: "contact-due-today", cardId: "sales-hill-purpose", severity: "act" }),
  Object.freeze({ id: "positive-no-date", cardId: "sales-voss-feasibility", severity: "act" }),
  Object.freeze({ id: "concern-open", cardId: "sales-carnegie-listen", severity: "act" }),
  Object.freeze({ id: "after-contract", cardId: "sales-girard-after-sale", severity: "organize" }),
  Object.freeze({ id: "new-uncontacted", cardId: "sales-ross-fit", severity: "organize" }),
]);

const RULE_BY_ID = new Map(GURU_RECOMMENDATION_RULES.map((rule) => [rule.id, rule]));
const RULE_RANK = new Map(GURU_RECOMMENDATION_RULES.map((rule, index) => [rule.id, index]));

function toMs(now) {
  if (now instanceof Date) return now.getTime();
  const n = Number(now);
  return Number.isFinite(n) ? n : Date.now();
}

function timeOf(value) {
  const t = new Date(value || "").getTime();
  return Number.isFinite(t) ? t : null;
}

function shortDate(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  return match ? `${Number(match[2])}/${Number(match[3])}` : "";
}

function clip(text, max) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

// 활동의 회사. 연락 기록 저장(0042 record_contact_outcome_v1)이 company_id를 채우지 않는 행이
// 있어, 활동이 가리키는 리드·딜·계정의 회사를 원장에서 찾아 쓴다 — 리드에 남긴 연락이 같은
// 회사의 견적 딜에서 안 보이면 "그 뒤 연락 기록 없음"을 틀리게 말한다.
function activityCompany(activity, companyOf) {
  if (activity?.companyId) return String(activity.companyId);
  const fromLedger = companyOf?.(activity);
  return fromLedger ? String(fromLedger) : null;
}

// crm-nudges.js belongsTo와 같은 기준에, 딜의 원래 리드에 남긴 연락과 원장으로 찾은 회사를 더한다.
function belongsTo(activity, record, companyOf) {
  if (!activity || !record?.id) return false;
  const id = String(record.id);
  if (activity.leadId && String(activity.leadId) === id) return true;
  if (activity.dealId && String(activity.dealId) === id) return true;
  if (activity.accountId && String(activity.accountId) === id) return true;
  if (record.leadId && activity.leadId && String(activity.leadId) === String(record.leadId)) return true;
  if (record.companyId && activityCompany(activity, companyOf) === String(record.companyId)) return true;
  return false;
}

// 최신순 운영자 연락. 시각을 읽을 수 없는 행은 순서를 정할 수 없어 뺀다.
function operatorContacts(activities, record, companyOf) {
  return (Array.isArray(activities) ? activities : [])
    .filter((activity) => !AUTO_ACTIVITY_KINDS.has(String(activity?.kind || "").toLowerCase())
      && timeOf(activity?.occurredAt) != null
      && belongsTo(activity, record, companyOf))
    .sort((a, b) => timeOf(b.occurredAt) - timeOf(a.occurredAt));
}

// 원장의 리드·딜·계정 id → 회사 id.
export function ledgerCompanyResolver({ leads = [], deals = [], accounts = [] } = {}) {
  const byLead = new Map();
  const byDeal = new Map();
  const byAccount = new Map();
  for (const lead of Array.isArray(leads) ? leads : []) if (lead?.id && lead.companyId) byLead.set(String(lead.id), lead.companyId);
  for (const deal of Array.isArray(deals) ? deals : []) if (deal?.id && deal.companyId) byDeal.set(String(deal.id), deal.companyId);
  for (const account of Array.isArray(accounts) ? accounts : []) if (account?.id && account.companyId) byAccount.set(String(account.id), account.companyId);
  return (activity) => (activity?.leadId && byLead.get(String(activity.leadId)))
    || (activity?.dealId && byDeal.get(String(activity.dealId)))
    || (activity?.accountId && byAccount.get(String(activity.accountId)))
    || null;
}

function isClosed(record) {
  if (record.kind === "deal") return record.stage === "lost";
  if (record.kind === "lead") return record.stage === "Lost";
  return false;
}

function isAfterContract(record) {
  if (record.kind === "account") return true;
  if (record.kind === "deal") return record.stage === "closing";
  if (record.kind === "lead") return record.stage === "Customer";
  return false;
}

// customer-list.js customerLastContact와 같은 판정 — 반응도 없고 마지막 시각이 생성 시각이면
// 연락이 없었던 것이다.
function neverTouched(record) {
  if (record.lastReaction) return false;
  return !record.lastContactAt || (Boolean(record.createdAt) && record.lastContactAt === record.createdAt);
}

function afterContractFacts(record) {
  if (record.kind === "account") return ["계약 고객으로 등록된 계정"];
  if (record.kind === "deal") return [`${dealStageLabel("closing")} 단계로 기록된 거래`];
  return ["계약 고객(Customer)으로 전환된 리드"];
}

function candidatesFor(record, { contacts, activitiesKnown, activitiesSinceKey, todayKey }) {
  const out = [];
  const afterContract = isAfterContract(record);
  if (afterContract) {
    out.push({ ruleId: "after-contract", facts: afterContractFacts(record), weight: 0 });
    return out;
  }

  // 연락 기록을 읽지 못했으면 "그 뒤 기록 없음"·"마지막 반응"을 판정할 수 없다 — 추측하지 않는다.
  if (!activitiesKnown) return out;

  const reacted = contacts.filter((activity) => activity.reaction);
  const last = contacts[0] || null;
  const noResponseRun = reacted.length >= 2
    && reacted[0].reaction === "no_response" && reacted[1].reaction === "no_response";
  const lastReactedDays = reacted[0] ? diffKstDays(kstDayKey(reacted[0].occurredAt), todayKey) : null;
  const recentRejected = reacted[0]?.reaction === "rejected"
    && lastReactedDays != null && lastReactedDays <= RECOMMENDATION_REACTION_DAYS;
  if (noResponseRun || recentRejected) return out;

  const promiseKey = record.nextActionAt ? kstDayKey(record.nextActionAt) : "";

  // ① 견적·최종미팅 단계에서 내가 정한 날짜가 지났는데 그 뒤 연락 기록이 없다.
  //    읽어 온 활동 창보다 오래된 날짜면 "그 뒤 기록 없음"을 증명할 수 없으니 고르지 않는다.
  if (record.kind === "deal" && (record.stage === "quote" || record.stage === "final")
    && promiseKey && promiseKey < todayKey && (!activitiesSinceKey || promiseKey >= activitiesSinceKey)) {
    const promisedMs = timeOf(record.nextActionAt);
    const recordedAfter = last && promisedMs != null && timeOf(last.occurredAt) >= promisedMs;
    if (!recordedAfter) {
      const late = diffKstDays(promiseKey, todayKey);
      out.push({
        ruleId: "quote-date-passed",
        facts: [`${dealStageLabel(record.stage)} 단계`, `내가 정한 ${shortDate(promiseKey)}에서 ${late}일 지남`, "그 뒤 연락 기록 없음"],
        weight: late,
      });
    }
  }

  // ② 오늘로 정한 다음 연락 — 대화 전에 확인하려는 것을 한 문장으로.
  if (promiseKey && promiseKey === todayKey) {
    const what = clip(record.nextAction, 28);
    out.push({
      ruleId: "contact-due-today",
      facts: ["오늘로 정한 다음 연락", ...(what ? [`“${what}”`] : [])],
      weight: 0,
    });
  }

  // ③·④ 마지막 연락의 반응이 긍정·우려인데 날짜 정한 다음 단계가 없다.
  if (last?.reaction && !promiseKey) {
    const lastKey = kstDayKey(last.occurredAt);
    const days = diffKstDays(lastKey, todayKey);
    if (days >= 0 && days <= RECOMMENDATION_REACTION_DAYS) {
      const when = [shortDate(lastKey), channelLabel(last.kind)].filter(Boolean).join(" ");
      if (last.reaction === "positive") {
        out.push({ ruleId: "positive-no-date", facts: [`${when} · 긍정 반응`, "날짜 정한 다음 단계 없음"], weight: -days });
      } else if (last.reaction === "concern") {
        out.push({ ruleId: "concern-open", facts: [`${when} · 우려 반응`, "다음 연락 미정"], weight: -days });
      }
    }
  }

  // ⑤ 추적 시작 뒤 들어온 신규 리드에 아직 연락 기록이 없다.
  if (record.kind === "lead" && record.stage === "New" && record.trackingEligible !== false
    && !contacts.length && neverTouched(record)) {
    const createdKey = kstDayKey(record.createdAt);
    const age = createdKey ? diffKstDays(createdKey, todayKey) : null;
    if (age != null && age >= 0 && age <= NEW_LEAD_DAYS) {
      out.push({ ruleId: "new-uncontacted", facts: [`${shortDate(createdKey)} 등록`, "아직 연락 기록 없음"], weight: -age });
    }
  }

  return out;
}

function compareCandidates(a, b) {
  const rank = RULE_RANK.get(a.ruleId) - RULE_RANK.get(b.ruleId);
  if (rank) return rank;
  return (b.weight || 0) - (a.weight || 0);
}

// 레코드 하나의 추천 — 없으면 null. record.kind는 'lead' | 'deal' | 'account'.
// activitiesSince: 활동을 읽어 온 창의 시작(ISO). 그 전의 사실은 판정하지 않는다.
// companyOf: 활동 → 회사 id(원장에서). 없으면 활동에 적힌 company_id만 쓴다.
export function recommendForRecord(record, { activities = [], activitiesKnown = true, activitiesSince = null, companyOf = null, now = Date.now() } = {}) {
  if (!record?.id || !["lead", "deal", "account"].includes(record.kind)) return null;
  if (record.hidden || record.dormant || isClosed(record)) return null;

  const todayKey = kstDayKey(new Date(toMs(now)));
  const activitiesSinceKey = activitiesSince ? kstDayKey(activitiesSince) : "";
  const contacts = activitiesKnown ? operatorContacts(activities, record, companyOf) : [];
  const candidates = candidatesFor(record, { contacts, activitiesKnown, activitiesSinceKey, todayKey }).sort(compareCandidates);
  const top = candidates[0];
  if (!top) return null;

  const rule = RULE_BY_ID.get(top.ruleId);
  const lane = adviceScopeForRecord(record);
  return {
    id: `${top.ruleId}:${record.kind}:${record.id}`,
    ruleId: top.ruleId,
    cardId: rule.cardId,
    severity: rule.severity,
    basis: "record",
    subject: {
      type: record.kind,
      id: record.id,
      name: record.name || "",
      companyId: record.companyId || null,
      companyName: record.companyName || null,
      lane: lane.scope,
      laneBlocked: lane.blocked,
    },
    facts: top.facts,
    reason: top.facts.join(" · "),
    weight: top.weight || 0,
  };
}

// 운영자 소유 리드·딜·계정 전체의 추천. 목록 표면(오늘·홈)은 severity로 지금 할 것만 고른다.
export function buildGuruRecommendations({
  leads = [],
  deals = [],
  accounts = [],
  activities = [],
  activitiesKnown = true,
  activitiesSince = null,
  now = Date.now(),
  severity = null,
} = {}) {
  const records = [
    ...(Array.isArray(leads) ? leads : []).map((lead) => ({ ...lead, kind: "lead" })),
    ...(Array.isArray(deals) ? deals : []).map((deal) => ({ ...deal, kind: "deal" })),
    ...(Array.isArray(accounts) ? accounts : []).map((account) => ({ ...account, kind: "account" })),
  ];
  const companyOf = ledgerCompanyResolver({ leads, deals, accounts });
  const out = [];
  for (const record of records) {
    const recommendation = recommendForRecord(record, { activities, activitiesKnown, activitiesSince, companyOf, now });
    if (!recommendation) continue;
    if (severity && recommendation.severity !== severity) continue;
    out.push(recommendation);
  }
  return out.sort((a, b) => {
    const rank = RULE_RANK.get(a.ruleId) - RULE_RANK.get(b.ruleId);
    if (rank) return rank;
    const weight = (b.weight || 0) - (a.weight || 0);
    if (weight) return weight;
    return String(a.subject.name).localeCompare(String(b.subject.name), "ko");
  });
}

export function guruRecommendationRule(ruleId) {
  return RULE_BY_ID.get(ruleId) || null;
}
