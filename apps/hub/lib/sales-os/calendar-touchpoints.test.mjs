import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_MATCH_NAME_LENGTH,
  channelForCalendarClass,
  classifyCalendarTitle,
  findUnrecordedMeetings,
  hasRecordFor,
  matchEventToCustomers,
} from "./calendar-touchpoints.js";

const NOW = Date.parse("2026-09-22T06:00:00Z"); // KST 15:00
const at = (iso) => new Date(iso).toISOString();
const event = (over = {}) => ({
  id: "ev-1",
  summary: "한빛학원 미팅",
  location: "",
  start: { dateTime: at("2026-09-21T01:00:00Z") },
  end: { dateTime: at("2026-09-21T02:00:00Z") },
  ...over,
});
const 한빛 = { id: "lead-1", kind: "lead", name: "한빛학원", companyId: "co-1" };

test("title classification reads the touchpoint kind and maps to a record channel", () => {
  assert.equal(classifyCalendarTitle("한빛학원 설명회"), "infoSession");
  assert.equal(classifyCalendarTitle("김원장 미팅"), "meeting");
  assert.equal(classifyCalendarTitle("Meeting with 한빛"), "meeting");
  assert.equal(classifyCalendarTitle("한빛 전화"), "call");
  assert.equal(classifyCalendarTitle("점심"), "other");
  assert.equal(channelForCalendarClass("call"), "call");
  // 분류가 애매하면 미팅으로 — 기록창에서 바꾸면 된다.
  assert.equal(channelForCalendarClass("other"), "meeting");
});

test("names shorter than the floor never match — they collide with ordinary words", () => {
  assert.equal(MIN_MATCH_NAME_LENGTH, 3);
  // 한글은 음절 블록이 곧 길이다 — "아띠"는 2자라 하한에 걸린다(실제 고객명 중 하나).
  const longEnough = { id: "lead-x", name: "이룸국어", companyId: null }; // 4자 → 매칭
  const tooShort = { id: "lead-y", name: "아띠", companyId: null };       // 2자 → 제외
  const matched = matchEventToCustomers(event({ summary: "이룸국어 아띠 상담" }), [longEnough, tooShort]);
  assert.deepEqual(matched.map((m) => m.id), ["lead-x"]);
});

test("a deal's linked event id beats any name guess", () => {
  const linked = { id: "deal-9", kind: "deal", name: "관계없는이름", eventId: "ev-1" };
  const guessed = { id: "lead-1", kind: "lead", name: "한빛학원" };
  const matched = matchEventToCustomers(event(), [guessed, linked]);
  assert.equal(matched[0].id, "deal-9");
  assert.equal(matched[0].confidence, "confirmed");
  assert.equal(matched[1].confidence, "guess");
});

test("longer name wins among guesses — the more specific match is likelier right", () => {
  // 둘 다 하한(3자)을 넘고 둘 다 제목에 들어 있을 때, 더 구체적인 쪽이 앞선다.
  const broad = { id: "a", name: "한빛학" };
  const specific = { id: "b", name: "한빛학원" };
  const matched = matchEventToCustomers(event({ summary: "한빛학원 미팅" }), [broad, specific]);
  assert.deepEqual(matched.map((m) => m.id), ["b", "a"]);
});

test("location counts as part of the haystack, and punctuation/spacing is normalized away", () => {
  const e = event({ summary: "원장님 미팅", location: "한 빛 학원 3층" });
  assert.equal(matchEventToCustomers(e, [한빛]).length, 1);
});

test("the record window spans two hours before the start to a day after the end", () => {
  const e = event(); // 09-21 01:00Z ~ 02:00Z
  const act = (iso, over = {}) => ({ occurredAt: at(iso), companyId: "co-1", ...over });

  // 시작 2시간 전 경계 안
  assert.equal(hasRecordFor(e, 한빛, [act("2026-09-20T23:00:00Z")]), true);
  // 그보다 앞이면 다른 사건이다
  assert.equal(hasRecordFor(e, 한빛, [act("2026-09-20T22:30:00Z")]), false);
  // 종료 24시간 뒤 경계 안 (다음 날 아침 정리)
  assert.equal(hasRecordFor(e, 한빛, [act("2026-09-22T02:00:00Z")]), true);
  // 그보다 뒤면 아니다
  assert.equal(hasRecordFor(e, 한빛, [act("2026-09-22T02:30:00Z")]), false);
});

test("a record made now closes a meeting that ended days ago", () => {
  // 넛지 목록은 3일치를 훑는데 인정 창은 종료+24h였다 — 이틀 전 미팅은 "기록 남기기"를 눌러도
  // (RPC가 occurred_at=now()로 쓴다) 넛지가 꺼지지 않았다.
  const twoDaysAgo = event({
    id: "ev-old",
    start: { dateTime: at("2026-09-20T01:00:00Z") },
    end: { dateTime: at("2026-09-20T02:00:00Z") },
  });
  const justNow = [{ occurredAt: new Date(NOW).toISOString(), companyId: "co-1" }];

  // now를 안 넘기면 기존 창 그대로 — 인정되지 않는다.
  assert.equal(hasRecordFor(twoDaysAgo, 한빛, justNow), false);
  assert.equal(hasRecordFor(twoDaysAgo, 한빛, justNow, NOW), true);
  // 그래도 일정 시작 앞쪽 경계는 그대로다.
  assert.equal(hasRecordFor(twoDaysAgo, 한빛, [{ occurredAt: at("2026-09-19T22:30:00Z"), companyId: "co-1" }], NOW), false);

  assert.deepEqual(
    findUnrecordedMeetings({ events: [twoDaysAgo], candidates: [한빛], activities: justNow, now: NOW }),
    [],
  );
  // 기록이 없으면 여전히 넛지로 올라온다.
  assert.equal(
    findUnrecordedMeetings({ events: [twoDaysAgo], candidates: [한빛], activities: [], now: NOW }).length,
    1,
  );
});

test("records join by company as well — live rows carry company_id, not lead_id", () => {
  const e = event();
  const inWindow = at("2026-09-21T03:00:00Z");
  // 회사로만 연결된 기록도 그 고객의 기록이다.
  assert.equal(hasRecordFor(e, 한빛, [{ occurredAt: inWindow, companyId: "co-1", leadId: null }]), true);
  // 다른 회사면 아니다.
  assert.equal(hasRecordFor(e, 한빛, [{ occurredAt: inWindow, companyId: "co-2" }]), false);
  // 고객 id로 직접 걸린 기록도 인정한다.
  assert.equal(hasRecordFor(e, { id: "lead-1" }, [{ occurredAt: inWindow, leadId: "lead-1" }]), true);
});

test("an automatic deal stage move does not count as a meeting record", () => {
  const deal = { id: "deal-1", kind: "deal", name: "한빛학원", companyId: "co-1" };
  const stageMove = { kind: "deal", dealId: "deal-1", occurredAt: at("2026-09-21T03:00:00Z") };
  assert.equal(hasRecordFor(event(), deal, [stageMove]), false);
  assert.equal(findUnrecordedMeetings({ events: [event()], candidates: [deal], activities: [stageMove], now: NOW }).length, 1);
});

test("unrecorded meetings surface only for finished, matched, unrecorded events", () => {
  const found = findUnrecordedMeetings({
    events: [event()],
    candidates: [한빛],
    activities: [],
    now: NOW,
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].customer.name, "한빛학원");
  assert.equal(found[0].channel, "meeting");
  assert.equal(found[0].confidence, "guess");

  // 기록이 있으면 안 뜬다.
  assert.equal(
    findUnrecordedMeetings({
      events: [event()],
      candidates: [한빛],
      activities: [{ occurredAt: at("2026-09-21T03:00:00Z"), companyId: "co-1" }],
      now: NOW,
    }).length,
    0,
  );
});

test("events that have not finished yet are not nagged about", () => {
  const future = event({
    start: { dateTime: at("2026-09-22T08:00:00Z") },
    end: { dateTime: at("2026-09-22T09:00:00Z") },
  });
  assert.deepEqual(findUnrecordedMeetings({ events: [future], candidates: [한빛], now: NOW }), []);
});

test("all-day events and unmatched events never become nudges", () => {
  const allDay = event({ start: { date: "2026-09-21" }, end: { date: "2026-09-22" } });
  assert.deepEqual(findUnrecordedMeetings({ events: [allDay], candidates: [한빛], now: NOW }), []);
  // 고객을 못 찾으면 올리지 않는다 — 추측으로 넛지를 만들지 않는다.
  const unrelated = event({ summary: "치과 예약", location: "" });
  assert.deepEqual(findUnrecordedMeetings({ events: [unrelated], candidates: [한빛], now: NOW }), []);
});

test("events the operator marked as not-a-customer stay dismissed", () => {
  const found = findUnrecordedMeetings({
    events: [event()],
    candidates: [한빛],
    ignoredEventIds: ["ev-1"],
    now: NOW,
  });
  assert.deepEqual(found, []);
});

test("most recent meeting comes first", () => {
  const older = event({ id: "ev-old", start: { dateTime: at("2026-09-19T01:00:00Z") }, end: { dateTime: at("2026-09-19T02:00:00Z") } });
  const found = findUnrecordedMeetings({ events: [older, event()], candidates: [한빛], now: NOW });
  assert.deepEqual(found.map((f) => f.eventId), ["ev-1", "ev-old"]);
});
