import assert from "node:assert/strict";
import { test } from "node:test";

import { DORMANT_RECHECK_DAYS, buildCrmNudges, buildMemoNudges } from "./crm-nudges.js";

const NOW = Date.parse("2026-09-22T03:00:00Z"); // KST 12:00, todayKey 2026-09-22
const day = (offset) => new Date(NOW + offset * 86400000).toISOString();
const customer = (over = {}) => ({ id: "lead-1", kind: "lead", name: "한빛학원", companyId: "co-1", ...over });
const activity = (over = {}) => ({ id: "a1", occurredAt: day(-1), companyId: "co-1", reaction: null, body: "", ...over });

test("a customer gets at most one nudge, and the most urgent rule wins", () => {
  // 약속도 지났고 다음 행동도 비어 있고 미기록 미팅도 있다 — 셋 다 후보지만 하나만 뜬다.
  const nudges = buildCrmNudges({
    customers: [customer({ nextActionAt: day(-3), nextAction: "견적서 발송" })],
    activities: [],
    unrecordedMeetings: [{ eventId: "ev-1", title: "한빛학원 미팅", startAt: day(-1), channel: "meeting", customer: { id: "lead-1" } }],
    now: NOW,
  });
  assert.equal(nudges.length, 1);
  assert.equal(nudges[0].ruleId, "meeting_unrecorded");
  assert.equal(nudges[0].severity, "act");
  assert.equal(nudges[0].subject.id, "lead-1");
  assert.equal(nudges[0].action.prefill.kind, "meeting");
});

test("a missed promise stops nagging once a record lands after it", () => {
  const promised = day(-3);
  const base = { customers: [customer({ nextActionAt: promised, nextAction: "견적서 발송" })], now: NOW };

  const before = buildCrmNudges({ ...base, activities: [] });
  assert.equal(before[0].ruleId, "promise_missed");
  assert.match(before[0].reason, /3일 지남/);

  // 약속한 날 이후에 기록이 생기면 그 계기는 사라진다(다른 계기는 떠도 된다).
  const after = buildCrmNudges({ ...base, activities: [activity({ occurredAt: day(-2) })] });
  assert.ok(!after.some((n) => n.ruleId === "promise_missed"));
});

test("today's promise reads as today, not as overdue", () => {
  const nudges = buildCrmNudges({
    customers: [customer({ nextActionAt: day(0), nextAction: "원장님 통화" })],
    now: NOW,
  });
  assert.equal(nudges[0].ruleId, "promise_due");
  assert.equal(nudges[0].title, "원장님 통화");
});

test("concern or rejection with nothing planned becomes an act nudge, quoting the record", () => {
  const nudges = buildCrmNudges({
    customers: [customer({ nextAction: "", nextActionAt: null })],
    activities: [activity({ reaction: "concern", body: "가격이 부담된다고 하심", occurredAt: day(-2) })],
    now: NOW,
  });
  assert.equal(nudges[0].ruleId, "reaction_open");
  assert.match(nudges[0].reason, /가격이 부담된다고/);

  // 이미 다음 약속이 잡혀 있으면 정리된 것이다.
  const planned = buildCrmNudges({
    customers: [customer({ nextAction: "재통화", nextActionAt: day(2) })],
    activities: [activity({ reaction: "concern", occurredAt: day(-2) })],
    now: NOW,
  });
  assert.ok(!planned.some((n) => n.ruleId === "reaction_open"));
});

test("an empty next action is organize-level, not act-level", () => {
  const nudges = buildCrmNudges({ customers: [customer({ nextAction: "" })], activities: [], now: NOW });
  assert.equal(nudges[0].ruleId, "no_next_action");
  assert.equal(nudges[0].severity, "organize");
});

test("dormant customers resurface only after the recheck interval", () => {
  const fresh = buildCrmNudges({
    customers: [customer({ dormant: true, dormantSince: day(-(DORMANT_RECHECK_DAYS - 1)), nextAction: "" })],
    now: NOW,
  });
  assert.deepEqual(fresh, []);

  const due = buildCrmNudges({
    customers: [customer({ dormant: true, dormantSince: day(-DORMANT_RECHECK_DAYS), nextAction: "" })],
    now: NOW,
  });
  assert.equal(due[0].ruleId, "dormant_recheck");
});

test("triggerKey is a fingerprint of the fact, stable across unrelated edits", () => {
  const a = buildCrmNudges({ customers: [customer({ nextActionAt: day(-3), nextAction: "견적서 발송" })], now: NOW });
  // 이름·다음 행동 문구가 바뀌어도 같은 약속이면 같은 키 — 숨긴 것이 다시 뜨지 않는다.
  const b = buildCrmNudges({ customers: [customer({ name: "한빛학원 본점", nextActionAt: day(-3), nextAction: "견적서 재발송" })], now: NOW });
  assert.equal(a[0].triggerKey, b[0].triggerKey);
  // 약속 날짜가 바뀌면 새 사실이므로 새 키다.
  const c = buildCrmNudges({ customers: [customer({ nextActionAt: day(-4), nextAction: "견적서 발송" })], now: NOW });
  assert.notEqual(a[0].triggerKey, c[0].triggerKey);
});

test("dismissing the top nudge does not let a lesser one pop up in its place", () => {
  // 미기록 미팅(1순위)과 빈 다음 행동(5순위)이 동시에 있는 고객.
  const input = {
    customers: [customer({ nextAction: "" })],
    activities: [],
    unrecordedMeetings: [{ eventId: "ev-1", title: "한빛학원 미팅", startAt: day(-1), channel: "meeting", customer: { id: "lead-1" } }],
    now: NOW,
  };
  const shown = buildCrmNudges(input);
  assert.equal(shown[0].ruleId, "meeting_unrecorded");

  const after = buildCrmNudges({
    ...input,
    suppressions: { "lead-1": { dismissed: { [shown[0].triggerKey]: true } } },
  });
  // 숨긴 직후 no_next_action이 대신 튀어나오면 "숨겼는데 또 뜬다"가 된다.
  assert.deepEqual(after, []);
});

test("snooze silences the whole customer until the chosen date", () => {
  const input = { customers: [customer({ nextActionAt: day(-3), nextAction: "견적서" })], now: NOW };
  assert.equal(buildCrmNudges({ ...input, suppressions: { "lead-1": { snoozedUntil: "2026-09-25" } } }).length, 0);
  // 날짜가 지나면 다시 보인다.
  assert.equal(buildCrmNudges({ ...input, suppressions: { "lead-1": { snoozedUntil: "2026-09-21" } } }).length, 1);
});

test("memo nudges match by customer name and skip already-linked memos", () => {
  const customers = [customer(), customer({ id: "lead-2", name: "아띠", companyId: "co-2" })];
  const nudges = buildMemoNudges({
    memos: [
      { id: "m1", title: "", body: "한빛학원 원장님이 단가 문의", occurredAt: day(-1) },
      { id: "m2", body: "한빛학원 얘기", linked: true },   // 이미 연결됨
      { id: "m3", body: "아띠 상담" },                     // 2자 이름 → 매칭 안 함
      { id: "m4", body: "점심 메뉴" },                      // 고객 없음
    ],
    customers,
    now: NOW,
  });
  assert.deepEqual(nudges.map((n) => n.subject.id), ["m1"]);
  assert.equal(nudges[0].ruleId, "memo_unlinked");
  assert.equal(nudges[0].severity, "organize");
  assert.match(nudges[0].title, /한빛학원/);
});

test("every nudge carries a subject, a reason, one action and an escape", () => {
  const nudges = buildCrmNudges({
    customers: [customer({ nextActionAt: day(-1), nextAction: "견적" }), customer({ id: "lead-2", name: "다른학원", companyId: "co-2", nextAction: "" })],
    activities: [],
    now: NOW,
  });
  assert.ok(nudges.length >= 2);
  for (const n of nudges) {
    assert.ok(n.subject?.id && n.subject?.name, "subject");
    assert.ok(n.title && n.reason, "why");
    assert.ok(n.action?.kind && n.action?.label, "one action");
    assert.ok(Array.isArray(n.escape) && n.escape.length > 0, "escape");
    assert.ok(["act", "organize", "recap"].includes(n.severity), "severity");
  }
});
