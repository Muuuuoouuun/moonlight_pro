import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANDIDATE_MAX_AGE_MS,
  buildCalendarCandidates,
  buildPhoneCandidates,
  calendarCustomersFrom,
  candidateWhen,
  describeCandidate,
  extractPromiseHint,
  meetingTriggerKey,
  mergeCandidates,
  parseCandidateId,
  phoneEventRecorded,
  withJosa,
} from "./record-candidates.js";
import { findUnrecordedMeetings } from "./calendar-touchpoints.js";

const NOW = Date.parse("2026-09-24T08:05:00Z"); // KST 목 17:05
const kst = (local) => new Date(`${local}+09:00`).toISOString();
const ROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROW_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("promise hints read Korean dates and times relative to the message (KST)", () => {
  const at = kst("2026-09-24T17:05:00"); // 목요일
  assert.deepEqual(extractPromiseHint("다음 주 화요일 4시에 체험 수업 가능할까요?", at), {
    title: "다음 주 화요일 4시에 체험 수업 가능할까요", dueAt: "2026-09-29T16:00:00+09:00", label: "9/29(화) 16:00",
  });
  assert.equal(extractPromiseHint("내일 오전 10시 반 방문드릴게요", at).dueAt, "2026-09-25T10:30:00+09:00");
  assert.equal(extractPromiseHint("모레 뵙겠습니다", at).dueAt, "2026-09-26");
  assert.equal(extractPromiseHint("10월 2일에 견적 주세요", at).label, "10/2(금)");
  assert.equal(extractPromiseHint("9/30 14:00 가능", at).dueAt, "2026-09-30T14:00:00+09:00");
  assert.equal(extractPromiseHint("이번 주 금요일 저녁 7시", at).dueAt, "2026-09-25T19:00:00+09:00");
  assert.equal(extractPromiseHint("화요일 어때요", at).dueAt, "2026-09-29"); // 다음에 오는 화요일
  // 시각만 있으면: 아직 안 지난 시각은 오늘, 지난 시각은 내일.
  assert.equal(extractPromiseHint("8시에 통화 가능해요", at).dueAt, "2026-09-24T20:00:00+09:00");
  assert.equal(extractPromiseHint("오후 3시 괜찮으세요", at).dueAt, "2026-09-25T15:00:00+09:00");
  // 지난 날짜·날짜 없는 말·빈 값은 약속이 아니다.
  assert.equal(extractPromiseHint("9/20 미팅 감사했습니다", at), null);
  assert.equal(extractPromiseHint("자료 잘 받았습니다", at), null);
  assert.equal(extractPromiseHint("", at), null);
  assert.equal(extractPromiseHint("내일 뵐게요", "not-a-date"), null);
});

test("candidate ids round-trip and refuse anything else", () => {
  assert.deepEqual(parseCandidateId(`phone:${ROW_A}`), { source: "phone", rowId: ROW_A });
  assert.deepEqual(parseCandidateId(`calendar:deal:${ROW_B}:evt:with:colons@google.com`), {
    source: "calendar", subjectType: "deal", subjectId: ROW_B, eventKey: "evt:with:colons@google.com",
  });
  for (const bad of ["", "phone:123", "calendar:task:x:y", "calendar:lead:x", null, 42, `phone:${ROW_A}x`]) {
    assert.equal(parseCandidateId(bad), null, String(bad));
  }
});

const revenue = {
  leads: [
    { id: "lead-1", name: "정우학원", companyName: "정우학원", companyId: "co-1", nudgeSuppression: null },
    { id: "lead-2", name: "새봄국어", companyName: null, companyId: "co-2",
      nudgeSuppression: { dismissed: { [meetingTriggerKey("evt-dismissed")]: true } } },
  ],
  deals: [{ id: "deal-1", name: "리드인 도입", leadId: null, companyId: "co-3", companyName: "리드인 독서논술", nextMeeting: { eventId: "evt-deal" } }],
  accounts: [{ id: "acc-1", name: "리드인 독서논술", companyId: "co-3" }],
};
const event = (id, summary, startLocal, endLocal) => ({ id, summary, start: { dateTime: kst(startLocal) }, end: { dateTime: kst(endLocal) } });

test("calendar candidates: matched past meetings without a record, newest first, dismissals honored", () => {
  const customers = calendarCustomersFrom(revenue);
  const events = [
    event("evt-1", "정우학원 상담", "2026-09-23T14:00:00", "2026-09-23T15:00:00"),
    event("evt-dismissed", "새봄국어 미팅", "2026-09-24T10:00:00", "2026-09-24T11:00:00"),
    event("evt-deal", "도입 논의", "2026-09-24T11:00:00", "2026-09-24T12:00:00"),
    event("evt-old", "정우학원 방문", "2026-09-21T10:00:00", "2026-09-21T11:00:00"),
    event("evt-later", "정우학원 콜", "2026-09-24T18:00:00", "2026-09-24T18:30:00"),
  ];
  const meetings = findUnrecordedMeetings({ events, candidates: customers, activities: [], now: NOW });
  const candidates = buildCalendarCandidates({ meetings, customers, now: NOW });
  assert.deepEqual(candidates.map((c) => c.id), [
    `calendar:deal:deal-1:evt-deal`,
    `calendar:lead:lead-1:evt-1`,
  ]);
  const [deal, lead] = candidates;
  assert.equal(deal.customer.key, "account:acc-1", "a deal without lead resolves to its account for the record sheet");
  assert.equal(deal.confidence, "confirmed");
  assert.equal(lead.customer.key, "lead:lead-1");
  assert.equal(lead.channel, "meeting");
  assert.equal(lead.source, "calendar");
  assert.equal(lead.promiseHint, null);
  assert.equal(describeCandidate(lead, NOW).when, "어제 14:00");
  assert.deepEqual(describeCandidate(lead, NOW), {
    when: "어제 14:00", name: "정우학원", tail: " 미팅 — 기록이 없어요",
    meta: "캘린더 '정우학원 상담' · 고객 이름으로 연결", quote: null,
  });
  // 기록이 생기면 사라진다.
  const recorded = findUnrecordedMeetings({
    events, candidates: customers, now: NOW,
    activities: [{ kind: "meeting", companyId: "co-1", occurredAt: kst("2026-09-23T16:00:00") }],
  });
  assert.equal(buildCalendarCandidates({ meetings: recorded, customers, now: NOW }).some((c) => c.id.includes("evt-1")), false);
});

const phoneRow = (id, channel, occurredLocal, patch = {}) => ({
  id,
  event_type: `phone.${channel}`,
  status: "received",
  received_at: kst(occurredLocal),
  payload: {
    v: 1, channel, direction: "in", occurredAt: kst(occurredLocal), durationSec: channel === "call" ? 252 : null,
    text: channel === "call" ? null : "다음 주 화요일 4시에 체험 수업 가능할까요?", matchedOn: "phone",
    customer: { kind: "lead", id: "lead-9", key: "lead:lead-9", name: "서연영어", org: "서연영어", person: "박서연 실장",
      companyId: "co-9", leadId: "lead-9", accountId: null, contactId: "ct-9" },
    ...patch,
  },
});

test("phone candidates collapse per customer and channel, drop after two days and once recorded", () => {
  const rows = [
    phoneRow(ROW_A, "kakao", "2026-09-24T17:05:00"),
    phoneRow(ROW_B, "kakao", "2026-09-24T09:00:00", { text: "자료 잘 받았습니다" }),
    phoneRow(ROW_C, "call", "2026-09-24T14:32:00"),
    phoneRow("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "sms", "2026-09-21T09:00:00"), // 이틀 넘음
    { ...phoneRow("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "sms", "2026-09-24T12:00:00"), status: "ignored" },
    { ...phoneRow("ffffffff-ffff-4fff-8fff-ffffffffffff", "sms", "2026-09-24T12:00:00"), payload: { v: 0, redacted: true } },
  ];
  const candidates = mergeCandidates(buildPhoneCandidates({ rows, now: NOW }));
  assert.deepEqual(candidates.map((c) => c.id), [`phone:${ROW_A}`, `phone:${ROW_C}`]);
  const [kakao, call] = candidates;
  assert.equal(kakao.count, 2);
  assert.equal(kakao.channel, "kakao");
  assert.equal(kakao.promiseHint.label, "9/29(화) 16:00");
  assert.deepEqual(kakao.customer, { key: "lead:lead-9", kind: "lead", id: "lead-9", name: "서연영어", org: null, person: "박서연 실장", companyId: "co-9" });
  assert.deepEqual(describeCandidate(kakao, NOW), {
    when: "오늘 17:05", name: "박서연 실장", tail: " 카톡",
    meta: "서연영어 · 카톡 알림 · 카톡 2건 · 약속 후보 9/29(화) 16:00",
    quote: "다음 주 화요일 4시에 체험 수업 가능할까요?",
  });
  assert.equal(call.durationSec, 252);
  assert.equal(describeCandidate(call, NOW).tail, "과 4분 통화");

  // 통화 뒤 기록이 생기면 그 통화 후보는 빠진다(카톡은 기록보다 늦게 왔으므로 남는다).
  const activities = [{ kind: "call", leadId: "lead-9", occurredAt: kst("2026-09-24T14:40:00") }];
  const afterRecord = buildPhoneCandidates({ rows, activities, now: NOW });
  assert.deepEqual(afterRecord.map((c) => c.id), [`phone:${ROW_A}`]);
  // 자동 기록(딜 단계 이동)은 연락 기록이 아니다.
  assert.equal(phoneEventRecorded(kst("2026-09-24T14:32:00"), rows[2].payload.customer, [{ kind: "deal", leadId: "lead-9", occurredAt: kst("2026-09-24T15:00:00") }]), false);
  // 이틀 창의 경계.
  assert.equal(buildPhoneCandidates({ rows: [phoneRow(ROW_A, "call", "2026-09-24T17:05:00")], now: NOW + CANDIDATE_MAX_AGE_MS + 60000 }).length, 0);
});

test("copy helpers speak in operator voice", () => {
  assert.equal(withJosa("이수진 대표"), "와");
  assert.equal(withJosa("정우학원"), "과");
  assert.equal(withJosa("ABC"), "와");
  assert.equal(candidateWhen(kst("2026-09-22T09:03:00"), NOW), "9/22(화) 09:03");
  const loner = { source: "phone", channel: "sms", occurredAt: kst("2026-09-24T11:20:00"), durationSec: null, count: 1,
    customer: { key: null, kind: null, id: null, name: "문가영", org: "새봄국어", person: "문가영" }, text: "자료 잘 받았습니다" };
  assert.deepEqual(describeCandidate(loner, NOW), {
    when: "오늘 11:20", name: "문가영", tail: " 문자", meta: "새봄국어 · 갤럭시 문자", quote: "자료 잘 받았습니다",
  });
});

test("unregistered phone candidate describes as 미등록 연락처 with phone and isUnregistered flag", () => {
  const row = {
    id: "unreg-row-1",
    status: "received",
    event_type: "phone.call",
    payload: {
      v: 1,
      occurredAt: kst("2026-09-24T15:30:00"),
      durationSec: 130,
      customer: {
        key: "unregistered:010-9999-8888",
        name: "010-9999-8888",
        phone: "010-9999-8888",
        isUnregistered: true,
      },
    },
  };
  const [candidate] = buildPhoneCandidates({ rows: [row], now: NOW });
  assert.ok(candidate);
  assert.equal(candidate.customer.isUnregistered, true);
  assert.equal(candidate.customer.phone, "010-9999-8888");
  const desc = describeCandidate(candidate, NOW);
  assert.equal(desc.name, "010-9999-8888");
  assert.equal(desc.meta, "미등록 연락처 · 갤럭시 통화 기록");
});
