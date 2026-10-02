import assert from "node:assert/strict";
import { test } from "node:test";

import { GURU_CARDS } from "@com-moon/guru-guidance";
import {
  GURU_RECOMMENDATION_RULES,
  buildGuruRecommendations,
  recommendForRecord,
} from "./guru-recommendations.js";
import { adviceScopeForRecord } from "./advice-scope.js";

const NOW = Date.parse("2026-09-25T03:00:00Z"); // KST 12:00, todayKey 2026-09-25
const day = (offset) => new Date(NOW + offset * 86400000).toISOString();
const deal = (over = {}) => ({ id: "deal-1", kind: "deal", name: "한빛학원 도입", companyId: "co-1", stage: "quote", type: "company", ...over });
const lead = (over = {}) => ({ id: "lead-1", kind: "lead", name: "새봄학원", companyId: "co-2", stage: "Contact", type: "company", ...over });
const contact = (over = {}) => ({ id: "a1", kind: "call", occurredAt: day(-3), companyId: "co-1", reaction: null, body: "", ...over });

test("every rule points at a card that exists in the Guru catalogue", () => {
  const ids = new Set(GURU_CARDS.map((card) => card.id));
  for (const rule of GURU_RECOMMENDATION_RULES) assert.ok(ids.has(rule.cardId), `${rule.id} → ${rule.cardId}`);
});

test("a quote-stage deal whose own date passed with no record after it points to MEDDIC, in the operator's words", () => {
  const rec = recommendForRecord(deal({ nextActionAt: "2026-09-20" }), { activities: [], now: NOW });
  assert.equal(rec.ruleId, "quote-date-passed");
  assert.equal(rec.cardId, "sales-meddic");
  assert.equal(rec.severity, "act");
  assert.deepEqual(rec.facts, ["견적 단계", "내가 정한 9/20에서 5일 지남", "그 뒤 연락 기록 없음"]);
  // 운영자가 정한 날짜일 뿐이다 — 고객이 답하지 않았다고 쓰지 않는다.
  assert.doesNotMatch(rec.reason, /무응답|답이 없|회신 없/);
});

test("a contact recorded after the date closes the quote trigger", () => {
  const rec = recommendForRecord(deal({ nextActionAt: "2026-09-20" }), {
    activities: [contact({ occurredAt: day(-2), reaction: "neutral" })],
    now: NOW,
  });
  assert.equal(rec, null);
});

test("a date older than the activity window cannot prove that nothing was recorded after it", () => {
  const rec = recommendForRecord(deal({ nextActionAt: "2026-08-01" }), {
    activities: [],
    activitiesSince: day(-45),
    now: NOW,
  });
  assert.equal(rec, null);
});

test("a contact saved on the company's lead without company_id still closes the deal's quote trigger", () => {
  // 0042 연락 기록 저장이 company_id를 비워 두는 행 — 리드 id만 있다.
  const leadContact = { id: "a9", kind: "call", occurredAt: day(-2), leadId: "lead-han", companyId: null, reaction: "neutral" };
  const recs = buildGuruRecommendations({
    leads: [lead({ id: "lead-han", companyId: "co-1", stage: "Contact" })],
    deals: [deal({ nextActionAt: "2026-09-20" })],
    activities: [leadContact],
    now: NOW,
  });
  assert.equal(recs.find((rec) => rec.subject.id === "deal-1"), undefined);
  // 원장 대응표 없이 한 레코드만 보면 그 연락을 볼 수 없다 — 목록 경로가 대응표를 넘기는 이유.
  assert.equal(recommendForRecord(deal({ nextActionAt: "2026-09-20" }), { activities: [leadContact], now: NOW }).ruleId, "quote-date-passed");
});

test("an automatic stage-move row is not a contact", () => {
  const rec = recommendForRecord(deal({ nextActionAt: "2026-09-20" }), {
    activities: [contact({ kind: "deal", occurredAt: day(-1), dealId: "deal-1" })],
    now: NOW,
  });
  assert.equal(rec?.ruleId, "quote-date-passed");
});

test("an unknown stage that fell back to potential is never used as a stage fact", () => {
  const rec = recommendForRecord(deal({ stage: "potential", nextActionAt: "2026-09-20" }), { activities: [], now: NOW });
  assert.equal(rec, null);
});

test("today's own contact date points to the purpose check, quoting the operator's next action", () => {
  const rec = recommendForRecord(lead({ nextActionAt: "2026-09-25", nextAction: "도입 일정 확인 통화" }), { activities: [], now: NOW });
  assert.equal(rec.ruleId, "contact-due-today");
  assert.equal(rec.cardId, "sales-hill-purpose");
  assert.deepEqual(rec.facts, ["오늘로 정한 다음 연락", "“도입 일정 확인 통화”"]);
});

test("a positive last reaction without a dated next step points to Voss execution conditions", () => {
  const rec = recommendForRecord(lead(), {
    activities: [contact({ companyId: "co-2", occurredAt: day(-3), reaction: "positive" })],
    now: NOW,
  });
  assert.equal(rec.ruleId, "positive-no-date");
  assert.equal(rec.cardId, "sales-voss-feasibility");
  assert.deepEqual(rec.facts, ["9/22 통화 · 긍정 반응", "날짜 정한 다음 단계 없음"]);
});

test("a concern points to listening without guessing what the concern was", () => {
  const rec = recommendForRecord(lead(), {
    activities: [contact({ companyId: "co-2", occurredAt: day(-2), reaction: "concern", body: "가격이 부담된다고 함" })],
    now: NOW,
  });
  assert.equal(rec.ruleId, "concern-open");
  assert.equal(rec.cardId, "sales-carnegie-listen");
  assert.doesNotMatch(rec.reason, /가격/);
  assert.deepEqual(rec.facts, ["9/23 통화 · 우려 반응", "다음 연락 미정"]);
});

test("a reaction older than the window is not a current reason", () => {
  const rec = recommendForRecord(lead(), {
    activities: [contact({ companyId: "co-2", occurredAt: day(-31), reaction: "positive" })],
    now: NOW,
  });
  assert.equal(rec, null);
});

test("two no-responses in a row or a recent rejection suppress every act recommendation", () => {
  const noResponses = [
    contact({ id: "a1", companyId: "co-2", occurredAt: day(-1), reaction: "no_response" }),
    contact({ id: "a2", companyId: "co-2", occurredAt: day(-4), reaction: "no_response" }),
  ];
  assert.equal(recommendForRecord(lead({ nextActionAt: "2026-09-25" }), { activities: noResponses, now: NOW }), null);
  const rejected = [contact({ companyId: "co-2", occurredAt: day(-5), reaction: "rejected" })];
  assert.equal(recommendForRecord(lead({ nextActionAt: "2026-09-25" }), { activities: rejected, now: NOW }), null);
});

test("closed, dormant and hidden records get nothing", () => {
  assert.equal(recommendForRecord(deal({ stage: "lost", nextActionAt: "2026-09-20" }), { now: NOW }), null);
  assert.equal(recommendForRecord(lead({ stage: "Lost", nextActionAt: "2026-09-25" }), { now: NOW }), null);
  assert.equal(recommendForRecord(lead({ dormant: true, nextActionAt: "2026-09-25" }), { now: NOW }), null);
  assert.equal(recommendForRecord(deal({ hidden: true, nextActionAt: "2026-09-20" }), { now: NOW }), null);
});

test("a contracted customer points to after-sale follow-through as an organize-level item", () => {
  const rec = recommendForRecord(deal({ stage: "closing" }), { now: NOW });
  assert.equal(rec.ruleId, "after-contract");
  assert.equal(rec.cardId, "sales-girard-after-sale");
  assert.equal(rec.severity, "organize");
  assert.equal(recommendForRecord({ id: "acc-1", kind: "account", name: "푸른학원", type: "company" }, { now: NOW }).ruleId, "after-contract");
});

test("a new tracked lead with no contact yet points to the fit check; an old import does not", () => {
  const fresh = lead({ stage: "New", createdAt: day(-7), lastContactAt: day(-7) });
  const rec = recommendForRecord(fresh, { activities: [], now: NOW });
  assert.equal(rec.ruleId, "new-uncontacted");
  assert.equal(rec.cardId, "sales-ross-fit");
  assert.deepEqual(rec.facts, ["9/18 등록", "아직 연락 기록 없음"]);
  assert.equal(recommendForRecord({ ...fresh, trackingEligible: false }, { activities: [], now: NOW }), null);
  assert.equal(recommendForRecord({ ...fresh, lastReaction: "neutral" }, { activities: [], now: NOW }), null);
});

test("an unreadable activity feed never produces a claim about contacts", () => {
  const rec = recommendForRecord(deal({ nextActionAt: "2026-09-20" }), { activities: null, activitiesKnown: false, now: NOW });
  assert.equal(rec, null);
  // 단계만으로 확인되는 계약 후 관계는 연락 기록 없이도 사실이다.
  assert.equal(recommendForRecord(deal({ stage: "closing" }), { activitiesKnown: false, now: NOW }).ruleId, "after-contract");
});

test("list surfaces take act-level items in rule order, most overdue first", () => {
  const recs = buildGuruRecommendations({
    leads: [lead({ id: "lead-today", nextActionAt: "2026-09-25" })],
    deals: [
      deal({ id: "deal-late-2", nextActionAt: "2026-09-23" }),
      deal({ id: "deal-late-5", nextActionAt: "2026-09-20" }),
      deal({ id: "deal-won", stage: "closing" }),
    ],
    activities: [],
    now: NOW,
    severity: "act",
  });
  assert.deepEqual(recs.map((rec) => rec.subject.id), ["deal-late-5", "deal-late-2", "lead-today"]);
});

test("the lane follows the shared advice scope and blocks conflicting labels", () => {
  assert.equal(recommendForRecord(deal({ workspace: "classin", nextActionAt: "2026-09-20" }), { now: NOW }).subject.lane, "classin");
  assert.equal(recommendForRecord(deal({ type: "personal", nextActionAt: "2026-09-20" }), { now: NOW }).subject.lane, "personal");
  const conflicted = recommendForRecord(deal({ workspace: "classin", type: "personal", nextActionAt: "2026-09-20" }), { now: NOW });
  assert.equal(conflicted.subject.lane, null);
  assert.equal(conflicted.subject.laneBlocked, true);
  assert.deepEqual(adviceScopeForRecord({ workspace: "unknown-lane", type: "company" }), { scope: null, blocked: true });
  assert.deepEqual(adviceScopeForRecord({ type: "company" }), { scope: "classin", blocked: false });
});
