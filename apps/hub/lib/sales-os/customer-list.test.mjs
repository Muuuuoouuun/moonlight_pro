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
  promisePeek,
  promiseReadout,
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

// 드로어의 [다음 약속] 카드와 넓은 기록창의 읽기 칸이 같은 문장을 쓴다(2026-09-30).
test("the promise readout is one sentence set for the card and the record window's context column", () => {
  const read = (patch) => promiseReadout(customerPromise(lead(patch), TODAY));
  // 놓친 약속 — 위급 글자는 lateLabel 한 곳, 나머지는 날짜 줄.
  assert.deepEqual(read({ nextAction: "견적서 보내기", nextActionAt: "2026-09-22" }), { what: "견적서 보내기", muted: false, late: true, lateLabel: "2일 지남", when: "9/22 약속" });
  // 오늘 · 내일은 상대 라벨 + 날짜, 그 밖은 날짜만.
  assert.deepEqual(read({ nextAction: "데모", nextActionAt: TODAY }), { what: "데모", muted: false, late: false, lateLabel: "", when: "오늘 · 9/24" });
  assert.equal(read({ nextAction: "데모", nextActionAt: "2026-09-25" }).when, "내일 · 9/25");
  assert.equal(read({ nextAction: "데모", nextActionAt: "2026-10-02" }).when, "10/2 약속");
  // 날짜만 있는 약속은 이름이 비어도 약속이다.
  assert.equal(read({ nextActionAt: "2026-10-02" }).what, "다음 약속");
  assert.deepEqual(read({ nextAction: "소개서 보내기" }), { what: "소개서 보내기", muted: false, late: false, lateLabel: "", when: "날짜를 아직 안 정했어요" });
  // 약속이 아닌 말 — 흐리게, 날짜 줄 없이.
  assert.deepEqual(read({}), { what: "아직 정하지 않았어요", muted: true, late: false, lateLabel: "", when: "" });
  assert.equal(read({ dormant: true, dormantSince: "2026-09-14" }).what, "기약 없음 · 10일째");
  assert.equal(read({ dormant: true }).what, "기약 없음");
  assert.equal(read({ stage: "Lost", nextAction: "재접촉", nextActionAt: "2026-09-01" }).what, "종료된 고객");
  // 템플릿 문구는 약속으로 읽지 않는다 — 문구는 제안 팁의 몫이다.
  const template = read({ nextAction: "리드 출처 확인 후 다음 접촉 채널 정하기", nextActionIsTemplate: true });
  assert.deepEqual([template.what, template.muted, template.when], ["다음 약속 없음", true, ""]);
  assert.deepEqual(promiseReadout(), { what: "아직 정하지 않았어요", muted: true, late: false, lateLabel: "", when: "" });
});

// 좁은 기록창의 약속 한 줄(2026-09-30 넓은 기록창 ③) — 말줄임 한 줄이라 '언제'가 앞에 선다.
test("the promise peek puts the date before the text — the ellipsis eats the tail, never the when", () => {
  const peek = (patch) => promisePeek(customerPromise(lead(patch), TODAY));
  // 날짜 있는 약속 — 날짜(M/D)가 따로 나오고 뒤에 붙는 말이 없다(화면: 약속 · 10/2 · 무엇을…).
  assert.deepEqual(peek({ nextAction: "채점 기능 써 보시게 전달하고 원장님 일정 확인", nextActionAt: "2026-10-02" }),
    { what: "채점 기능 써 보시게 전달하고 원장님 일정 확인", late: false, lateLabel: "", date: "10/2", tail: "" });
  // 오늘 · 내일도 날짜로 말한다 — 칩 줄의 새 약속 날짜(M/D)와 같은 자로 견준다.
  assert.equal(peek({ nextAction: "데모", nextActionAt: TODAY }).date, "9/24");
  assert.equal(peek({ nextAction: "데모", nextActionAt: "2026-09-25" }).date, "9/25");
  // 놓친 약속 — 위급 글자(N일 지남)가 맨 앞, 그다음 날짜. 둘 다 무엇보다 앞이다.
  assert.deepEqual(peek({ nextAction: "견적서 보내기", nextActionAt: "2026-09-22" }),
    { what: "견적서 보내기", late: true, lateLabel: "2일 지남", date: "9/22", tail: "" });
  // 날짜 없는 약속 — 앞세울 날짜가 없으니 그 사실이 뒤에 붙는다.
  assert.deepEqual(peek({ nextAction: "소개서 보내기" }), { what: "소개서 보내기", late: false, lateLabel: "", date: "", tail: "날짜를 아직 안 정했어요" });
  // 약속이 아닌 말(없음 · 기약 없음 · 종료 · 템플릿)은 날짜도 꼬리도 없다 — 읽는 말은 카드와 같다.
  for (const patch of [{}, { dormant: true, dormantSince: "2026-09-14" }, { stage: "Lost", nextAction: "재접촉", nextActionAt: "2026-09-01" }, { nextAction: "리드 출처 확인 후 다음 접촉 채널 정하기", nextActionIsTemplate: true }]) {
    const row = customerPromise(lead(patch), TODAY);
    assert.deepEqual(promisePeek(row), { what: promiseReadout(row).what, late: false, lateLabel: "", date: "", tail: "" }, JSON.stringify(patch));
  }
  assert.deepEqual(promisePeek(), { what: "아직 정하지 않았어요", late: false, lateLabel: "", date: "", tail: "" });
});

// 2026-09-30 넓은 기록창 ④ — 오늘 연락에서 목록 밖의 고객을 골라 연 창은 그 고객의 약속을 모른다.
test("an unknown promise (null) is said as unknown — never as 'not decided yet'", () => {
  const unknown = promiseReadout(null);
  assert.deepEqual(unknown, { what: "여기서는 약속을 알 수 없어요", muted: true, late: false, lateLabel: "", when: "목록에 없는 고객이에요 · 고객 탭에서 확인해요" });
  // 약속이 없는 것(읽었고 비어 있다)과는 다른 말이다.
  assert.notEqual(unknown.what, promiseReadout({}).what);
  assert.notEqual(unknown.what, promiseReadout(customerPromise(lead({}), TODAY)).what);
  // 좁은 화면의 한 줄도 던지지 않는다(날짜 없음).
  assert.deepEqual(promisePeek(null), { what: unknown.what, late: false, lateLabel: "", date: "", tail: unknown.when });
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

test("explicit promise sort is ascending with no-promise rows last in both directions", () => {
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

test("default order puts recorded contacts first, new contacts/inquiries next, then buyers", () => {
  const rows = [
    lead({ name: "가 구매", stage: "Customer" }),
    lead({ name: "나 신규", createdAt: "2026-09-22", lastContactAt: "2026-09-22" }),
    lead({ name: "다 연락", createdAt: "2026-09-01", lastContactAt: "2026-09-20" }),
    lead({ name: "라 문의", createdAt: "2026-09-24", lastContactAt: "2026-09-24" }),
    lead({ name: "마 연락", lastContactAt: "2026-09-23" }),
    { kind: "account", name: "바 구매" },
    lead({ name: "사 날짜없음", createdAt: "invalid", lastContactAt: "invalid" }),
    lead({ name: "아 종료", stage: "Lost" }),
  ];
  const original = [...rows];
  assert.deepEqual(sortCustomers(rows).map(row => row.name), [
    "마 연락", "다 연락", "라 문의", "나 신규", "사 날짜없음", "가 구매", "바 구매", "아 종료",
  ]);
  assert.deepEqual(rows, original);
  assert.equal(sortCaption({ key: "recent", dir: "desc" }), "최근 연락 · 최근 컨택·문의 · 구매 고객 순");
});

test("same-time and missing-time customers retain record order instead of name order", () => {
  const rows = [lead({ name: "하", lastContactAt: "2026-09-23" }), lead({ name: "가", lastContactAt: "2026-09-23" })];
  assert.deepEqual(sortCustomers(rows), rows);
  assert.deepEqual(sortCustomers([lead({ name: "하" }), lead({ name: "가" })]).map(row => row.name), ["하", "가"]);
});
