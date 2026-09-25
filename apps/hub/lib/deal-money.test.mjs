import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MONEY_GROUP_PREVIEW,
  MONEY_MONTHS_AHEAD,
  MONEY_WEEKS,
  WEEKS_PER_MONTH,
  buildMoneyModel,
  formatShortWon,
  isContractedDeal,
  moneyContext,
  paidBetween,
} from "./deal-money.js";
import { MAX_DANGER_RAILS, kstDayNumber } from "./deal-timeline.js";

// 2026-09-26(토) 10:00 KST — 이번 주 9/21(월)–9/27(일), 다음 주 9/28–10/4, 그 뒤 10/5부터.
const NOW = new Date("2026-09-26T01:00:00Z");
const kst = (ymd) => `${ymd}T03:00:00.000Z`; // KST 정오

// 테스트 입력 — 실제 기록 아님. 한 화면의 모든 경우가 들어 있다.
function fixture() {
  return [
    { id: "late", companyName: "한빛", stage: "closing", value: 2400000, closeAt: kst("2026-09-19") },
    { id: "maybe", companyName: "정우", stage: "quote", value: 4800000, closeAt: kst("2026-09-30") },
    { id: "today", companyName: "오늘", stage: "closing", value: 300000, closeAt: kst("2026-09-26") },
    { id: "rec-sure", companyName: "유진", stage: "closing", value: 600000,
      recurring: { amount: 600000, day: 3, startMonth: "2026-09" },
      payments: [{ id: "rec-2026-09", recurringMonth: "2026-09", expectedAmount: 600000, expectedAt: kst("2026-09-03"),
        status: "paid", paidAmount: 600000, paidAt: kst("2026-09-03") }] },
    { id: "rec-maybe", companyName: "새봄", stage: "consult", value: 500000, recurring: { amount: 500000, day: 15, startMonth: "2026-10" } },
    { id: "rec-later", companyName: "하늘", stage: "closing", value: 300000, recurring: { amount: 300000, day: 26, startMonth: "2026-10" } },
    { id: "no-schedule", companyName: "도윤", stage: "closing", value: 1200000 },
    { id: "slipped", companyName: "리드인", stage: "final", value: 2400000, closeAt: kst("2026-09-22") },
    { id: "old", companyName: "기록 이전", stage: "closing", value: 1000000, closeAt: kst("2026-08-10") },
    { id: "lost", companyName: "잃음", stage: "lost", value: 9000000, closeAt: kst("2026-09-28") },
    { id: "hidden", companyName: "숨김", stage: "closing", value: 9000000, closeAt: kst("2026-09-28"), hidden: true },
    { id: "paid-full", companyName: "다 받음", stage: "closing", value: 900000,
      payments: [{ id: "p", expectedAmount: 900000, expectedAt: kst("2026-09-24"), status: "paid", paidAmount: 900000, paidAt: kst("2026-09-24") }] },
    { id: "no-amount", companyName: "금액 없음", stage: "potential", value: 0 },
  ];
}

const model = () => buildMoneyModel(fixture(), { now: NOW, target: 6000000 });
const keysOf = (rows) => rows.map((row) => `${row.dealId}:${row.dateLabel || "-"}`);

test("확실은 계약된 돈(클로징 또는 한 번이라도 입금), 가능은 계약 전 — 단계→확실성 하나로", () => {
  assert.equal(isContractedDeal({ stage: "closing" }), true);
  assert.equal(isContractedDeal({ stage: "final" }), false);
  assert.equal(isContractedDeal({ stage: "quote", payments: [{ id: "a", expectedAmount: 10, status: "paid", paidAmount: 10, paidAt: kst("2026-09-01") }] }), true);
  const m = model();
  const certaintyOf = (id) => m.rows.find((row) => row.dealId === id).certainty;
  assert.equal(certaintyOf("late"), "sure");
  assert.equal(certaintyOf("maybe"), "maybe");
  assert.equal(certaintyOf("rec-maybe"), "maybe");
  assert.equal(certaintyOf("rec-later"), "sure");
});

test("묶음 — 밀린 돈 → 이번 주·다음 주 → 그 뒤 → 날짜·일정 없음, Lost·숨김·기록 이전·전액 입금은 없다", () => {
  const m = model();
  const [late, soon, later, undated] = m.groups;
  assert.deepEqual(m.groups.map((g) => g.label), ["밀린 돈", "이번 주 · 다음 주", "그 뒤", "날짜 · 일정 없음"]);
  assert.deepEqual(keysOf(late.items), ["late:9/19"]);
  assert.equal(late.items[0].daysLate, 7);
  assert.equal(late.items[0].action, "confirm");
  assert.deepEqual(keysOf(soon.items), ["today:9/26", "maybe:9/30", "rec-sure:10/3"]);
  assert.deepEqual(soon.items.map((r) => r.action), ["confirm", "dates", "confirm"]);
  assert.deepEqual(keysOf(later.items), [
    "rec-maybe:10/15", "rec-later:10/26", "rec-sure:11/3", "rec-maybe:11/15", "rec-later:11/26",
    "rec-sure:12/3", "rec-maybe:12/15", "rec-later:12/26",
  ], "매달 정기 회차는 이번 달부터 3달 뒤(12월)까지만");
  assert.equal(later.preview, MONEY_GROUP_PREVIEW);
  assert.deepEqual(undated.items.map((r) => [r.dealId, r.action]), [["no-schedule", "schedule"], ["slipped", "redate"], ["no-amount", "dates"]]);
  assert.equal(undated.items[1].note, "최종미팅 · 9/22 지남");
  assert.equal(undated.items[2].hasAmount, false);
  const ids = new Set(m.rows.map((r) => r.dealId));
  for (const gone of ["old", "lost", "hidden", "paid-full"]) assert.equal(ids.has(gone), false, gone);
  assert.equal(soon.sure, 900000);
  assert.equal(soon.maybe, 4800000);
});

test("방법 힌트 — 일시불 · ↻ 매달 N일 · 여러 회차는 N회 중 M회", () => {
  const m = model();
  assert.equal(m.rows.find((r) => r.dealId === "late").method, "일시불");
  assert.equal(m.rows.find((r) => r.dealId === "rec-sure").method, "↻ 매달 3일");
  const split = buildMoneyModel([{ id: "s", stage: "closing", value: 2000000, payments: [
    { id: "a", expectedAmount: 1000000, expectedAt: kst("2026-09-29") },
    { id: "b", label: "잔금", expectedAmount: 1000000, expectedAt: kst("2026-10-29") },
  ] }], { now: NOW });
  assert.deepEqual(split.rows.map((r) => r.method), ["2회 중 1회", "잔금"]);
  assert.equal(split.rows[0].kind, "installment");
});

test("머리 KPI — 들어옴 · 늦은 입금 · 월말 확실 = 들어옴+늦음+이번 달 남은 확실 · 가능까지 = 월말 확실+이번 달 가능 · 매달 정기", () => {
  const { header } = model();
  assert.equal(header.paid, 1500000, "이번 달 입금 기록(정기 9월분 + 전액 입금 거래)");
  assert.equal(header.late, 2400000);
  assert.equal(header.sureRest, 300000);
  assert.equal(header.maybeMonth, 4800000, "지난 가능(리드인)은 이번 달 가능에 넣지 않는다");
  assert.equal(header.monthEndSure, 1500000 + 2400000 + 300000);
  assert.equal(header.withMaybe, header.monthEndSure + 4800000);
  assert.equal(header.recurringMonthly, 600000, "계약된 거래 중 이번 달에 살아 있는 정기만");
  assert.equal(header.target, 6000000);
});

test("리본은 들어옴·계약늦음·확실 예정·가능 넷, 목표가 합보다 크면 남는 칸과 목표 눈금", () => {
  const { ribbon } = model();
  assert.deepEqual(ribbon.segments.map((s) => [s.key, s.amount]), [["paid", 1500000], ["late", 2400000], ["sure", 300000], ["maybe", 4800000]]);
  assert.equal(ribbon.total, 9000000);
  assert.equal(ribbon.gap, 0);
  assert.equal(Math.round(ribbon.targetPct), 67);
  const big = buildMoneyModel(fixture(), { now: NOW, target: 18000000 }).ribbon;
  assert.equal(big.gap, 9000000);
  assert.equal(big.targetPct, 100);
  assert.equal(buildMoneyModel(fixture(), { now: NOW }).ribbon.targetPct, null, "목표가 없으면 눈금도 없다");
});

test("주 차트 — 밀린 돈 칸 + 이번 주부터 10주(월요일 시작), 들어옴은 이번 주만, 지난 주는 없다", () => {
  const m = model();
  assert.equal(m.weeks.length, MONEY_WEEKS + 1);
  assert.equal(m.weeks[0].carry, true);
  assert.equal(m.weeks[0].late, 2400000);
  assert.equal(m.weeks[1].current, true);
  assert.equal(m.weeks[1].label, "이번 주");
  assert.equal(m.weeks[1].rangeLabel, "9/21–9/27");
  assert.equal(m.weeks[1].paid, 900000, "이번 주에 들어온 돈만(9/3 입금은 이번 주가 아니다)");
  assert.equal(m.weeks[1].sure, 300000);
  assert.deepEqual([m.weeks[2].label, m.weeks[2].sure, m.weeks[2].maybe], ["9/28", 600000, 4800000]);
  assert.equal(m.weeks.slice(2).every((w) => w.paid === 0), true);
  assert.equal(m.weeks[4].maybe, 500000, "10/12 주 = 새봄 10/15 정기(가능)");
  assert.equal(m.weeks[10].label, "11/23");
  assert.equal(m.weeklyFloor, 600000 / WEEKS_PER_MONTH);
  assert.equal(m.weekMax, 4800000 + 600000);
});

test("월 차트 — 이번 달부터 3달 뒤까지, 이번 달만 들어옴·늦음·목표, 이전 달은 없다", () => {
  const m = model();
  assert.deepEqual(m.months.map((mo) => mo.label), ["9월", "10월", "11월", "12월"]);
  assert.equal(m.months.length, MONEY_MONTHS_AHEAD + 1);
  assert.deepEqual([m.months[0].paid, m.months[0].late, m.months[0].sure, m.months[0].maybe, m.months[0].target], [1500000, 2400000, 300000, 4800000, 6000000]);
  assert.deepEqual([m.months[1].paid, m.months[1].late, m.months[1].sure, m.months[1].maybe, m.months[1].target], [0, 0, 900000, 500000, null]);
  assert.equal(m.monthMax, 9000000);
});

test("KST 경계 — 9/30 15:30 UTC 입금은 10월, 오늘(KST) 예상은 늦음이 아니다", () => {
  const deals = [
    { id: "edge", stage: "closing", value: 10, payments: [{ id: "p", expectedAmount: 10, expectedAt: kst("2026-09-30"), status: "paid", paidAmount: 10, paidAt: "2026-09-30T15:30:00.000Z" }] },
    // 9/25 15:30 UTC = 9/26 00:30 KST(오늘) — 늦음 아님
    { id: "tonight", stage: "closing", value: 20, closeAt: "2026-09-25T15:30:00.000Z" },
    // 9/25 14:30 UTC = 9/25 23:30 KST(어제) — 1일 늦음
    { id: "yesterday", stage: "closing", value: 30, closeAt: "2026-09-25T14:30:00.000Z" },
  ];
  const m = buildMoneyModel(deals, { now: NOW });
  assert.equal(m.header.paid, 0);
  const ctx = moneyContext(NOW);
  assert.equal(paidBetween(deals, ctx.nextMonthStart, ctx.nextMonthStart + 31), 10);
  assert.equal(m.rows.find((r) => r.dealId === "tonight").group, "soon");
  const late = m.rows.find((r) => r.dealId === "yesterday");
  assert.equal(late.group, "late");
  assert.equal(late.daysLate, 1);
  assert.equal(ctx.thisWeekStart, kstDayNumber("2026-09-21"));
});

test("정기 회차와 명시 결제가 겹치지 않는다 — 입금한 달은 목록에서 빠지고 다른 달은 남는다", () => {
  const deal = { id: "r", stage: "closing", value: 0, recurring: { amount: 400000, day: 10, startMonth: "2026-10", endMonth: "2026-11" },
    payments: [{ id: "rec-2026-10", recurringMonth: "2026-10", expectedAmount: 400000, expectedAt: kst("2026-10-10"), status: "paid", paidAmount: 400000, paidAt: kst("2026-09-26") }] };
  const m = buildMoneyModel([deal], { now: NOW });
  assert.deepEqual(m.rows.map((r) => r.paymentId), ["rec:2026-11"], "10월은 입금됨, 12월은 끝 달 뒤");
  assert.equal(m.rows[0].recurringMonth, "2026-11");
  assert.equal(m.header.paid, 400000);
  assert.equal(m.header.recurringMonthly, 0, "이번 달(9월)엔 아직 시작 전");
});

test("계약 전 거래의 지난 정기 회차는 받을 돈도 다시 잡을 날짜도 아니다", () => {
  const m = buildMoneyModel([{ id: "r", stage: "quote", value: 0, recurring: { amount: 100000, day: 3, startMonth: "2026-09" } }], { now: NOW });
  assert.deepEqual(m.rows.map((r) => r.recurringMonth), ["2026-10", "2026-11", "2026-12"]);
});

test("늦은 입금 레일은 예산만큼, j/k 순서는 목록에 보이는 거래 순서", () => {
  const deals = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, stage: "closing", value: 100, closeAt: kst(`2026-09-1${i}`) }));
  const m = buildMoneyModel(deals, { now: NOW });
  assert.equal(m.lateCount, 5);
  assert.equal(m.railKeys.size, MAX_DANGER_RAILS);
  assert.deepEqual([...m.railKeys], m.groups[0].items.slice(0, MAX_DANGER_RAILS).map((r) => r.key));
  assert.deepEqual(model().dealOrder.slice(0, 4), ["late", "today", "maybe", "rec-sure"]);
});

test("거래가 없으면 hasAny가 거짓 — 화면은 빈 상태를 말한다", () => {
  assert.equal(buildMoneyModel([], { now: NOW }).hasAny, false);
  assert.equal(model().hasAny, true);
});

test("차트 칸 밑 짧은 값", () => {
  assert.equal(formatShortWon(2400000), "2.4M");
  assert.equal(formatShortWon(600000), "600K");
  assert.equal(formatShortWon(500), "500");
});
