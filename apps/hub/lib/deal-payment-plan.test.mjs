import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PAYMENT_RECORDS_SINCE,
  buildPaymentsBoard,
  buildPlanSeries,
  collectPaymentFacts,
  monthLabelOfKey,
  paymentMonthKey,
  paymentRowsForMonth,
  recordsStartKey,
  shiftMonthKey,
  summarizePlanMonth,
} from "./deal-payment-plan.js";
import { MAX_DANGER_RAILS } from "./deal-timeline.js";
import { markPaid, updatePayment } from "./deal-payments.js";

// 2026-09-25(금) 10:00 KST.
const NOW = new Date("2026-09-25T01:00:00Z");
const kst = (ymd) => `${ymd}T03:00:00.000Z`; // KST 정오

// 한 달 안에 모든 경우가 들어 있는 거래 묶음(테스트 입력 — 실제 기록 아님).
function september() {
  return [
    {
      id: "d1", companyName: "유진수학", stage: "closing", value: 3600000,
      payments: [
        { id: "p1", label: "계약금", expectedAmount: 1800000, expectedAt: kst("2026-09-02"), plannedAmount: 1800000, plannedAt: kst("2026-09-02"),
          status: "paid", paidAmount: 1600000, paidAt: kst("2026-09-03"), paidNote: "첫 달 할인" },
        { id: "p2", label: "잔금", expectedAmount: 1800000, expectedAt: kst("2026-10-02"), plannedAmount: 1800000, plannedAt: kst("2026-10-02"), status: "expected" },
      ],
    },
    // 암묵 결제 — 처음엔 9/20로 계획했다가 10/5로 옮겨졌다(plan_baseline).
    { id: "d2", companyName: "리드인", stage: "quote", value: 2400000, closeAt: kst("2026-10-05"),
      planBaseline: { amount: 2400000, closeAt: kst("2026-09-20"), at: kst("2026-09-18") } },
    // 성사된 거래의 입금이 늦었다 — 빨강.
    { id: "d3", companyName: "한빛수학", stage: "closing", value: 2400000, closeAt: kst("2026-09-22") },
    { id: "d4", companyName: "하늘과학", stage: "final", value: 2400000,
      payments: [{ id: "q1", expectedAmount: 2400000, expectedAt: kst("2026-09-30"), status: "paid", paidAmount: 2000000, paidAt: kst("2026-09-24") }] },
    // 성사 전 거래의 예상일이 지났다 — 밀린 것(중립).
    { id: "d5", companyName: "채원영어", stage: "quote", value: 1000000, closeAt: kst("2026-09-20") },
    { id: "d6", companyName: "잃은 곳", stage: "lost", value: 500000, closeAt: kst("2026-09-10") },
    { id: "d7", companyName: "숨긴 곳", stage: "closing", value: 9000000, closeAt: kst("2026-09-10"), hidden: true },
    // 9/30로 계획, 9/30 15:30 UTC(= 10/1 00:30 KST)에 입금 — 확정은 10월, "계획한 것 중 확정"은 9월.
    { id: "d8", companyName: "새벽국어", stage: "closing", value: 700000,
      payments: [{ id: "r1", expectedAmount: 700000, expectedAt: kst("2026-09-30"), status: "paid", paidAmount: 700000, paidAt: "2026-09-30T15:30:00.000Z" }] },
    { id: "d9", companyName: "취소", stage: "final", value: 300000,
      payments: [{ id: "c1", expectedAmount: 300000, expectedAt: kst("2026-09-12"), status: "cancelled" }] },
  ];
}

test("달 키는 KST 달력 기준이고 연말을 넘어간다", () => {
  assert.equal(paymentMonthKey("2026-09-30T15:30:00.000Z"), "2026-10", "UTC 9/30 15:30 = KST 10/1");
  assert.equal(paymentMonthKey("2026-09-30T14:59:00.000Z"), "2026-09");
  assert.equal(paymentMonthKey("2026-09-01"), "2026-09");
  assert.equal(paymentMonthKey(null), null);
  assert.equal(paymentMonthKey("nope"), null);
  assert.equal(shiftMonthKey("2026-11", 3), "2027-02");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(monthLabelOfKey("2026-09", 2026), "9월");
  assert.equal(monthLabelOfKey("2027-01", 2026), "2027년 1월");
});

test("달 합계 — 계획·확정·계획한 것 중 확정·옮겨진 것·늦은 것을 따로 센다", () => {
  const sept = summarizePlanMonth(september(), "2026-09", { now: NOW });
  // 계획: d1 계약금 1.8 + d2(기준선 9/20) 2.4 + d3 2.4 + d4 2.4 + d5 1.0 + d6(잃음도 계획이었다) 0.5 + d8 0.7
  assert.equal(sept.planned, 11200000);
  // 확정: 9월(KST)에 들어온 돈만 — d1 1.6 + d4 2.0. d8은 KST 10/1 입금이라 10월.
  assert.equal(sept.confirmed, 3600000);
  // 계획한 것 중 확정: 입금일과 무관 — d1 1.6 + d4 2.0 + d8 0.7
  assert.equal(sept.plannedConfirmed, 4300000);
  assert.equal(sept.plannedDelta, 4300000 - 11200000);
  assert.deepEqual(sept.moved, { amount: 2400000, count: 1 }, "9월로 계획한 d2가 10월로 옮겨졌다");
  assert.deepEqual(sept.overdue, { amount: 2400000, count: 1 }, "성사된 d3만 늦은 입금");
  assert.deepEqual(sept.slipped, { amount: 1000000, count: 1 }, "성사 전 d5는 밀린 것");
  assert.deepEqual(sept.pending, { amount: 0, count: 0 });
  assert.equal(sept.remainingExpected, 3400000, "잃은 거래·숨긴 거래·취소는 남은 예상에서 빠진다");

  const oct = summarizePlanMonth(september(), "2026-10", { now: NOW });
  assert.equal(oct.planned, 1800000, "d2는 10월 예상이지만 계획은 9월 — 10월 계획에 넣지 않는다");
  assert.equal(oct.confirmed, 700000);
  assert.equal(oct.remainingExpected, 4200000);
  assert.deepEqual(oct.pending, { amount: 4200000, count: 2 });
});

test("일정을 옮겨도 계획한 달은 그대로 — 옮긴 결제는 계획 달의 moved, 새 달의 예상", () => {
  const deal = { id: "m", companyName: "이동", stage: "final", value: 0,
    payments: [{ id: "a", expectedAmount: 1000000, expectedAt: kst("2026-09-28") }] };
  const before = summarizePlanMonth([deal], "2026-09", { now: NOW });
  assert.equal(before.planned, 1000000);
  assert.equal(before.moved.count, 0);
  // 저장된 뒤(계획 박제) 다음 달로 옮긴다.
  const saved = { ...deal, payments: updatePayment(deal, "a", {}) };
  const moved = { ...saved, payments: updatePayment(saved, "a", { expectedAt: kst("2026-10-12") }) };
  const sept = summarizePlanMonth([moved], "2026-09", { now: NOW });
  assert.equal(sept.planned, 1000000, "예상했던 이번 달 입금은 움직이지 않는다");
  assert.deepEqual(sept.moved, { amount: 1000000, count: 1 });
  assert.equal(sept.remainingExpected, 0);
  const oct = summarizePlanMonth([moved], "2026-10", { now: NOW });
  assert.equal(oct.planned, 0);
  assert.equal(oct.remainingExpected, 1000000);
  // 날짜를 미정으로 빼도 계획 달의 moved
  const undated = { ...saved, payments: updatePayment(saved, "a", { expectedAt: null }) };
  assert.equal(summarizePlanMonth([undated], "2026-09", { now: NOW }).moved.count, 1);
});

test("늦음 판정은 KST 오늘 기준 — 오늘 예상은 대기, 어제(KST)는 1일 지남", () => {
  const facts = collectPaymentFacts([
    { id: "today", stage: "closing", value: 10, closeAt: "2026-09-24T16:00:00.000Z" }, // KST 9/25 01:00
    { id: "yesterday", stage: "closing", value: 10, closeAt: "2026-09-24T14:59:00.000Z" }, // KST 9/24 23:59
  ], { now: NOW });
  const byDeal = Object.fromEntries(facts.map((f) => [f.dealId, f]));
  assert.equal(byDeal.today.state, "pending");
  assert.equal(byDeal.yesterday.state, "overdue");
  assert.equal(byDeal.yesterday.daysLate, 1);
});

test("같은 거래의 다른 결제가 이미 들어왔으면 성사 전 단계여도 늦은 입금이다(계약이 살아 있다)", () => {
  const facts = collectPaymentFacts([{
    id: "d", stage: "final", value: 0,
    payments: [
      { id: "a", expectedAmount: 100, expectedAt: kst("2026-09-01"), status: "paid", paidAmount: 100, paidAt: kst("2026-09-01") },
      { id: "b", expectedAmount: 100, expectedAt: kst("2026-09-10") },
    ],
  }], { now: NOW });
  assert.equal(facts.find((f) => f.paymentId === "b").state, "overdue");
});

test("결제 기록 이전 달은 확정을 모른다 — 성사 거래의 미입금은 빨강이 아니라 입금 기록 없음", () => {
  assert.equal(PAYMENT_RECORDS_SINCE, "2026-09");
  const old = { id: "old", stage: "closing", value: 1000000, closeAt: kst("2026-08-10") };
  assert.equal(collectPaymentFacts([old], { now: NOW })[0].state, "unrecorded");
  // 8월 입금을 하나라도 소급해 적으면 8월부터 기록이 있는 달이다.
  const retro = { id: "retro", stage: "closing", value: 0,
    payments: [{ id: "x", expectedAmount: 500000, expectedAt: kst("2026-08-05"), status: "paid", paidAmount: 500000, paidAt: kst("2026-08-06") }] };
  assert.equal(recordsStartKey([old, retro]), "2026-08");
  assert.equal(collectPaymentFacts([old, retro], { now: NOW }).find((f) => f.dealId === "old").state, "overdue");
});

test("월별 막대는 지난 3달·이번 달·앞 3달 — 지난달만 차이, 기록 이전 달은 확정을 그리지 않는다", () => {
  const { currentKey, months, max } = buildPlanSeries(september(), { now: NOW });
  assert.equal(currentKey, "2026-09");
  assert.deepEqual(months.map((m) => m.label), ["6월", "7월", "8월", "9월", "10월", "11월", "12월"]);
  assert.deepEqual(months.map((m) => m.isCurrent), [false, false, false, true, false, false, false]);
  const [jun, , aug, sep, oct] = months;
  assert.equal(jun.recorded, false);
  assert.equal(aug.confirmed, null, "기록 이전 — 0이 아니라 모름");
  assert.equal(aug.delta, null);
  assert.equal(sep.confirmed, 3600000);
  assert.equal(sep.planned, 11200000);
  assert.equal(sep.remainingExpected, 3400000);
  assert.equal(sep.delta, null, "이번 달은 아직 차이를 말하지 않는다");
  assert.equal(oct.remainingExpected, 4200000);
  assert.equal(oct.confirmed, 700000);
  assert.equal(max, 11200000);

  // 8월 입금을 소급하면 8월은 기록이 있는 지난달 — 확정 − 계획을 말한다.
  const withAugust = [...september(), { id: "aug", stage: "closing", value: 0,
    payments: [{ id: "x", expectedAmount: 600000, expectedAt: kst("2026-08-20"), status: "paid", paidAmount: 500000, paidAt: kst("2026-08-21") }] }];
  const augRecorded = buildPlanSeries(withAugust, { now: NOW }).months[2];
  assert.equal(augRecorded.recorded, true);
  assert.equal(augRecorded.confirmed, 500000);
  assert.equal(augRecorded.planned, 600000);
  assert.equal(augRecorded.delta, -100000);
  assert.equal(augRecorded.remainingExpected, 0, "지난달의 미입금은 막대에 쌓지 않는다");

  const december = buildPlanSeries([], { now: new Date("2026-12-15T01:00:00Z") }).months;
  assert.deepEqual(december.map((m) => m.label).slice(-3), ["2027년 1월", "2027년 2월", "2027년 3월"]);
});

test("딜별 결제 표 — 이 달에 계획·예상·입금된 결제, 원래 날짜 → 지금 날짜, 차이와 이유", () => {
  const rows = paymentRowsForMonth(september(), "2026-09", { now: NOW });
  // 이 달 안의 날짜 순 — d2는 10/5로 옮겨졌어도 9월 표에서는 계획일(9/20) 자리, d8은 입금(10/1)이 아니라 예상일(9/30) 자리.
  assert.deepEqual(rows.map((r) => r.dealId), ["d1", "d6", "d2", "d5", "d3", "d4", "d8"]);
  const byDeal = Object.fromEntries(rows.map((r) => [r.dealId, r]));
  assert.equal(byDeal.d1.installment.text, "1회 계약금");
  assert.equal(byDeal.d1.difference, -200000);
  assert.equal(byDeal.d1.paidNote, "첫 달 할인");
  assert.equal(byDeal.d1.timing, 1, "예상 9/2 → 입금 9/3 = 하루 늦음");
  assert.equal(byDeal.d1.paid.dayLabel, "9/3");
  assert.equal(byDeal.d2.state, "pending");
  assert.equal(byDeal.d2.expected.movedLabel, "원래 9/20 → 10/5");
  assert.equal(byDeal.d2.installment.text, "전액");
  assert.equal(byDeal.d3.state, "overdue");
  assert.equal(byDeal.d3.daysLate, 3);
  assert.equal(byDeal.d4.difference, -400000);
  assert.equal(byDeal.d4.paidNote, null);
  assert.equal(byDeal.d5.state, "slipped");
  assert.equal(byDeal.d6.state, "lost");
  assert.equal(byDeal.d8.paid.dayLabel, "10/1", "입금 날짜도 KST");
  assert.ok(!rows.some((r) => r.dealId === "d7" || r.dealId === "d9"), "숨긴 거래·취소된 결제는 표에 없다");

  const oct = paymentRowsForMonth(september(), "2026-10", { now: NOW });
  assert.deepEqual(oct.map((r) => r.key), ["d8::r1", "d1::p2", "d2::implicit"]);
});

test("입금 확인에서 받은 이유 한 줄이 표의 차이 칸으로 이어진다", () => {
  const deal = { id: "n", companyName: "노트", stage: "closing", value: 1800000, closeAt: kst("2026-09-26") };
  const paid = { ...deal, payments: markPaid(deal, "implicit", { paidAmount: 1500000, paidAt: kst("2026-09-25"), paidNote: "반 1개 축소" }) };
  const [row] = paymentRowsForMonth([paid], "2026-09", { now: NOW });
  assert.equal(row.difference, -300000);
  assert.equal(row.paidNote, "반 1개 축소");
  assert.equal(row.timing, -1, "하루 빠름");
  const same = { ...deal, payments: markPaid(deal, "implicit", { paidAmount: 1800000, paidAt: kst("2026-09-25"), paidNote: "무시" }) };
  assert.equal(paymentRowsForMonth([same], "2026-09", { now: NOW })[0].paidNote, null);
});

test("결제 보기 모델 — 달은 막대 범위 안에서만, 늦은 입금 레일은 예산만큼, 이번 달 합계는 히어로용", () => {
  const board = buildPaymentsBoard(september(), { now: NOW });
  assert.equal(board.monthKey, "2026-09");
  assert.equal(board.monthLabel, "9월");
  assert.equal(board.isCurrentMonth, true);
  assert.equal(board.prevKey, "2026-08");
  assert.equal(board.nextKey, "2026-10");
  assert.equal(board.series.length, 7);
  assert.equal(board.current.planned, 11200000);
  assert.equal(board.current.plannedConfirmed, 4300000);
  assert.equal(board.hasAny, true);

  assert.equal(buildPaymentsBoard(september(), { now: NOW, monthKey: "2026-06" }).prevKey, null);
  assert.equal(buildPaymentsBoard(september(), { now: NOW, monthKey: "2026-12" }).nextKey, null);
  assert.equal(buildPaymentsBoard(september(), { now: NOW, monthKey: "2026-01" }).monthKey, "2026-09", "범위 밖은 이번 달");
  assert.equal(buildPaymentsBoard(september(), { now: NOW, monthKey: "junk" }).monthKey, "2026-09");
  const aug = buildPaymentsBoard(september(), { now: NOW, monthKey: "2026-08" });
  assert.equal(aug.recorded, false);
  assert.equal(aug.isCurrentMonth, false);

  const late = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, companyName: `곳${i}`, stage: "closing", value: 10, closeAt: kst(`2026-09-1${i}`) }));
  const lateBoard = buildPaymentsBoard(late, { now: NOW });
  assert.equal(lateBoard.overdueCount, 5);
  assert.equal(lateBoard.railKeys.size, MAX_DANGER_RAILS);
  assert.deepEqual([...lateBoard.railKeys], lateBoard.rows.slice(0, MAX_DANGER_RAILS).map((r) => r.key));

  const empty = buildPaymentsBoard([{ id: "z", stage: "quote", value: 0 }], { now: NOW });
  assert.equal(empty.hasAny, false, "금액 없는 거래는 결제가 아니다");
  assert.equal(empty.current.planned, 0);
});
