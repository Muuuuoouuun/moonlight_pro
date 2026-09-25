import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_SEGMENTS,
  DEFAULT_CUSTOMER_SEGMENT,
  addDaysKey,
  channelFromPromise,
  countOpenWithoutPromise,
  customerDisplayName,
  customerLastContact,
  customerPhase,
  customerPromise,
  customerSegmentCounts,
  inCustomerSegment,
  localDateKey,
  matchesCustomerFocus,
  matchesCustomerSearch,
  sortCaption,
  sortCustomers,
} from "./customer-list.js";
import { promiseColumns, promiseMetaPatch } from "./customer-promise.js";
import { buildAccountWrite, buildLeadWrite } from "./revenue-write.js";

const TODAY = "2026-09-24";
const lead = (patch = {}) => ({ kind: "lead", stage: "Contact", name: "한빛수학", ...patch });

test("segments are the four action segments plus 전체, defaulting to 진행 중", () => {
  assert.deepEqual(CUSTOMER_SEGMENTS.map((s) => s.label), ["진행 중", "계약 고객", "새로 들어옴", "기약 없음", "전체"]);
  assert.equal(DEFAULT_CUSTOMER_SEGMENT, "active");
});

test("phase reads stage from the real lead status and treats accounts as 계약", () => {
  assert.equal(customerPhase({ kind: "account" }), "won");
  assert.equal(customerPhase(lead({ stage: "Customer" })), "won");
  assert.equal(customerPhase(lead({ stage: "Lost", dormant: true })), "lost");
  assert.equal(customerPhase(lead({ stage: "Qualified", dormant: true })), "dormant");
  assert.equal(customerPhase(lead({ stage: "New" })), "new");
  assert.equal(customerPhase(lead({ stage: "Qualified" })), "qualified");
});

test("진행 중 holds open stages only; 기약 없음 can include a contract customer", () => {
  assert.equal(inCustomerSegment(lead({ stage: "New" }), "active"), true);
  assert.equal(inCustomerSegment(lead({ stage: "Contact", dormant: true }), "active"), false);
  assert.equal(inCustomerSegment({ kind: "account", dormant: true }, "dormant"), true);
  assert.equal(inCustomerSegment(lead({ stage: "Lost", dormant: true }), "dormant"), false);
  const counts = customerSegmentCounts([lead({ stage: "New" }), lead(), { kind: "account" }]);
  assert.deepEqual(counts, { active: 2, won: 1, new: 1, dormant: 0, all: 3 });
});

test("the old 중요·확인 필요 segments survive as focus filters", () => {
  assert.equal(matchesCustomerFocus({ focusOverride: "raise" }, "important"), true);
  assert.equal(matchesCustomerFocus({ focusOverride: "default" }, "important"), false);
  assert.equal(matchesCustomerFocus({ health: "risk", dormant: true }, "risk"), false);
  assert.equal(matchesCustomerFocus({ health: "risk" }, "risk"), true);
});

test("date-only promise strings are read as-is, never shifted through UTC", () => {
  assert.equal(localDateKey("2026-09-22"), "2026-09-22");
  assert.equal(localDateKey("not a date"), null);
  assert.equal(addDaysKey(TODAY, 1), "2026-09-25");
  assert.equal(addDaysKey("2026-09-29", 7), "2026-10-06");
});

test("promise labels: 오늘 · 내일 · M/D, and overdue says N일 지남", () => {
  assert.deepEqual(
    [customerPromise(lead({ nextAction: "견적서", nextActionAt: "2026-09-22" }), TODAY)].map((p) => [p.state, p.late, p.whenLabel]),
    [["dated", 2, "2일 지남"]],
  );
  assert.equal(customerPromise(lead({ nextActionAt: TODAY }), TODAY).whenLabel, "오늘");
  assert.equal(customerPromise(lead({ nextActionAt: "2026-09-25" }), TODAY).whenLabel, "내일");
  assert.equal(customerPromise(lead({ nextActionAt: "2026-10-02" }), TODAY).whenLabel, "10/2");
  assert.equal(customerPromise(lead({ nextAction: "소개서" }), TODAY).state, "undated");
  assert.equal(customerPromise(lead(), TODAY).state, "none");
  const dormant = customerPromise(lead({ dormant: true, dormantSince: "2026-09-14T00:00:00Z" }), TODAY);
  assert.equal(dormant.state, "dormant");
  assert.equal(customerPromise(lead({ stage: "Lost", nextActionAt: "2026-09-01" }), TODAY).state, "closed");
  assert.equal(countOpenWithoutPromise([lead(), lead({ nextActionAt: TODAY }), { kind: "account" }], TODAY), 1);
});

// 2026-09-24: 이관·시트 동기화 문구는 운영자의 약속이 아니다(CRM 스펙 §4.1 결정 C, DESIGN.md
// §5.3 certainty). `nextActionIsTemplate`는 mapLead(lead-enrichment.isTemplateNextAction)가
// 계산해 넘기는 신호이고, customerPromise는 그 신호만 읽는다(문구 재판정 없음).
test("a template next action reads as no promise, but keeps the suggested text", () => {
  const templated = lead({ nextAction: "리드 출처 확인 후 다음 접촉 채널 정하기", nextActionIsTemplate: true });
  const p = customerPromise(templated, TODAY);
  assert.equal(p.state, "template");
  assert.equal(p.what, "", "다음 약속 칸에는 템플릿 문구를 진짜 약속처럼 보여주지 않는다");
  assert.equal(p.suggestion, "리드 출처 확인 후 다음 접촉 채널 정하기");

  // 날짜가 붙으면(운영자가 날짜를 직접 골랐으면) 문구가 템플릿이어도 실제 약속으로 본다.
  const dated = lead({ nextAction: "리드 출처 확인 후 다음 접촉 채널 정하기", nextActionIsTemplate: true, nextActionAt: "2026-09-25" });
  assert.equal(customerPromise(dated, TODAY).state, "dated");

  // 운영자가 직접 쓴 문구는 그대로 undated 약속이다.
  const written = lead({ nextAction: "견적서 보내기" });
  assert.equal(customerPromise(written, TODAY).state, "undated");
});

test("template rows count as 약속 없는 진행 중 and sort behind a real undated promise", () => {
  const templated = lead({ name: "템플릿만", nextAction: "리드 출처 확인 후 다음 접촉 채널 정하기", nextActionIsTemplate: true });
  const written = lead({ name: "직접씀", nextAction: "견적서 보내기" });
  assert.equal(countOpenWithoutPromise([templated], TODAY), 1, "템플릿 문구뿐이어도 '약속 없는 진행 중'에 들어간다");
  assert.deepEqual(
    sortCustomers([templated, written], { key: "promise", dir: "asc" }, TODAY).map((r) => r.name),
    ["직접씀", "템플릿만"],
  );
});

test("default sort is next promise ascending with no-promise rows last in both directions", () => {
  const rows = [
    lead({ name: "없음" }),
    lead({ name: "내일", nextActionAt: "2026-09-25" }),
    lead({ name: "지남", nextActionAt: "2026-09-20" }),
    lead({ name: "날짜없음", nextAction: "소개서" }),
  ];
  assert.deepEqual(sortCustomers(rows, { key: "promise", dir: "asc" }, TODAY).map((r) => r.name), ["지남", "내일", "날짜없음", "없음"]);
  assert.deepEqual(sortCustomers(rows, { key: "promise", dir: "desc" }, TODAY).map((r) => r.name), ["내일", "지남", "날짜없음", "없음"]);
  assert.deepEqual(sortCustomers(rows, { key: null, dir: "asc" }, TODAY).map((r) => r.name), rows.map((r) => r.name));
  assert.equal(sortCaption({ key: "promise", dir: "asc" }), "다음 약속이 급한 순");
});

test("last contact uses the recorded reaction and never invents a touch for an untouched lead", () => {
  assert.deepEqual(
    customerLastContact(lead({ lastReaction: "positive", lastContactAt: "2026-09-19T03:00:00Z" }), "2026-09-24"),
    { known: true, reaction: "긍정", days: 5, label: "긍정 · 5일 전" },
  );
  const created = "2026-09-20T01:00:00Z";
  assert.equal(customerLastContact(lead({ lastContactAt: created, createdAt: created }), TODAY).label, "아직 없음");
  assert.equal(customerLastContact({ kind: "account", last: "3일 전" }, TODAY).label, "3일 전");
});

test("search spans name, person and phone digits", () => {
  const row = lead({ person: "김지현", personTitle: "원장", phone: "010-1234-5678", subjects: ["math"] });
  assert.equal(matchesCustomerSearch(row, "지현"), true);
  assert.equal(matchesCustomerSearch(row, "5678"), true);
  assert.equal(matchesCustomerSearch(row, "수학"), true);
  assert.equal(matchesCustomerSearch(row, "영어"), false);
  assert.equal(customerDisplayName(row), "김지현 원장");
});

test("the 기록 sheet only preselects a channel the promise names", () => {
  assert.equal(channelFromPromise("카톡으로 견적 보내기"), "kakao");
  assert.equal(channelFromPromise("도입 여부 회신 받기"), null);
});

test("moving a promise date writes meta only through explicit snake keys", () => {
  assert.deepEqual(promiseMetaPatch({ next_action_at: "2026-09-27" }), { next_action_at: "2026-09-27", dormant: false, dormant_since: null });
  assert.deepEqual(promiseMetaPatch({ next_action_at: "" }), { next_action_at: null });
  assert.deepEqual(promiseMetaPatch({ next_action_at: "9/27" }), {});
  // 표시 모델의 camel 키는 무시한다 — Leads 편집 저장이 오래된 날짜로 되돌리지 않게.
  assert.deepEqual(promiseMetaPatch({ nextActionAt: "2026-09-27" }), {});
  assert.deepEqual(promiseColumns({ next_action: "  견적서 " }), { next_action: "견적서" });

  const leadWrite = buildLeadWrite({ id: "x", next_action: "견적서", next_action_at: "2026-09-27" });
  assert.equal(leadWrite.columns.next_action, "견적서");
  assert.equal(leadWrite.metaPatch.next_action_at, "2026-09-27");
  assert.equal(buildLeadWrite({ nextActionAt: "2026-09-27", dormant: true }).metaPatch.next_action_at, undefined);

  const accountWrite = buildAccountWrite({ id: "a", next_action: "재계약 안내", next_action_at: "2026-10-01" });
  assert.equal(accountWrite.columns.next_action, "재계약 안내");
  assert.equal(accountWrite.metaPatch.next_action_at, "2026-10-01");
  assert.equal(accountWrite.metaPatch.dormant, false);
});
