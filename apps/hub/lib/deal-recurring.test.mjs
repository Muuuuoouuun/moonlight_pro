import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addMonthsToKey,
  daysInMonthKey,
  isRecurringActive,
  normalizeRecurring,
  recurringDueDay,
  recurringDueIso,
  recurringInstances,
  recurringMethodLabel,
} from "./deal-recurring.js";
import { effectivePayments, markRecurringPaid, normalizePayments, scheduleLumpSum } from "./deal-payments.js";

test("정기 계획은 금액·날(1–31)·시작 달이 모두 있어야 하고, 시작보다 앞선 끝 달은 버린다", () => {
  assert.deepEqual(normalizeRecurring({ amount: "600000", day: 3, startMonth: "2026-09" }), { amount: 600000, day: 3, startMonth: "2026-09", endMonth: null });
  assert.equal(normalizeRecurring({ amount: 0, day: 3, startMonth: "2026-09" }), null, "₩0 정기는 계획이 아니다");
  assert.equal(normalizeRecurring({ amount: 1, day: 32, startMonth: "2026-09" }), null);
  assert.equal(normalizeRecurring({ amount: 1, day: 0, startMonth: "2026-09" }), null);
  assert.equal(normalizeRecurring({ amount: 1, day: 3 }), null);
  assert.equal(normalizeRecurring({ amount: 1, day: 3, startMonth: "2026-13" }), null);
  assert.equal(normalizeRecurring(null), null);
  assert.equal(normalizeRecurring({ amount: 1, day: 3, startMonth: "2026-09", endMonth: "2026-08" }).endMonth, null);
  assert.equal(normalizeRecurring({ amount: 1, day: 3, startMonth: "2026-09", endMonth: "2026-12" }).endMonth, "2026-12");
});

test("말일을 넘는 날은 그 달의 말일로 당긴다 — 윤년 2월 포함, 저장 시각은 KST 정오", () => {
  const rec = normalizeRecurring({ amount: 100, day: 31, startMonth: "2026-01" });
  assert.equal(daysInMonthKey("2026-02"), 28);
  assert.equal(daysInMonthKey("2028-02"), 29);
  assert.equal(recurringDueDay(rec, "2026-02"), 28);
  assert.equal(recurringDueDay(rec, "2028-02"), 29);
  assert.equal(recurringDueDay(rec, "2026-09"), 30);
  assert.equal(recurringDueDay(rec, "2026-10"), 31);
  assert.equal(recurringDueIso(rec, "2026-09"), "2026-09-30T03:00:00.000Z");
  assert.equal(addMonthsToKey("2026-11", 3), "2027-02");
  assert.equal(recurringMethodLabel(rec), "↻ 매달 31일");
});

test("회차는 시작·끝 달 안에서만, 창의 달마다 한 건 — id는 rec:YYYY-MM", () => {
  const rec = normalizeRecurring({ amount: 300000, day: 26, startMonth: "2026-10", endMonth: "2026-11" });
  assert.equal(isRecurringActive(rec, "2026-09"), false);
  assert.equal(isRecurringActive(rec, "2026-11"), true);
  assert.equal(isRecurringActive(rec, "2026-12"), false);
  const list = recurringInstances(rec, [], { fromMonth: "2026-09", toMonth: "2026-12" });
  assert.deepEqual(list.map((i) => i.id), ["rec:2026-10", "rec:2026-11"]);
  assert.equal(list[0].expectedAmount, 300000);
  assert.equal(list[0].expectedAt, "2026-10-26T03:00:00.000Z");
  assert.equal(list[0].status, "expected");
  assert.equal(list[0].label, "10월 정기");
  assert.deepEqual(recurringInstances(rec, [], { fromMonth: "2026-12", toMonth: "2026-09" }), []);
  assert.deepEqual(recurringInstances(null, [], { fromMonth: "2026-09", toMonth: "2026-12" }), []);
});

test("한 달 치 입금 확인은 recurringMonth가 붙은 명시 결제 한 건 — 그 달 회차가 입금됨이 되고 중복되지 않는다", () => {
  const deal = { id: "d", stage: "closing", value: 600000, closeAt: "2026-09-03T03:00:00.000Z",
    recurring: { amount: 600000, day: 3, startMonth: "2026-09" } };
  assert.deepEqual(effectivePayments(deal), [], "정기 계획이 있으면 금액·예상일로 암묵 결제를 만들지 않는다");
  const payments = markRecurringPaid(deal, "2026-10", { paidAmount: 550000, paidAt: "2026-10-04T03:00:00.000Z", paidNote: "첫 달 할인" });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].recurringMonth, "2026-10");
  assert.equal(payments[0].status, "paid");
  assert.equal(payments[0].expectedAmount, 600000);
  assert.equal(payments[0].plannedAt, "2026-10-03T03:00:00.000Z");
  assert.equal(payments[0].paidNote, "첫 달 할인");
  // 저장 경로(normalizePayments)를 한 번 더 거쳐도 표시는 남는다.
  const stored = normalizePayments(payments);
  assert.equal(stored[0].recurringMonth, "2026-10");
  const rec = normalizeRecurring(deal.recurring);
  const instances = recurringInstances(rec, stored, { fromMonth: "2026-09", toMonth: "2026-11" });
  assert.deepEqual(instances.map((i) => [i.id, i.status]), [["rec:2026-09", "expected"], ["rec:2026-10", "paid"], ["rec:2026-11", "expected"]]);
  // 같은 달을 다시 확인하면 그 기록을 바꾼다(두 건이 되지 않는다).
  const again = markRecurringPaid({ ...deal, payments: stored }, "2026-10", { paidAmount: 600000, paidAt: "2026-10-05T03:00:00.000Z" });
  assert.equal(again.length, 1);
  assert.equal(again[0].paidAmount, 600000);
  assert.equal(again[0].paidNote, null, "금액이 같으면 차이 이유를 남기지 않는다");
  // 계획이 없거나 달 키가 틀리면 아무것도 바꾸지 않는다.
  assert.deepEqual(markRecurringPaid({ id: "x", payments: [] }, "2026-10"), []);
  assert.deepEqual(markRecurringPaid(deal, "10월"), []);
});

test("일정 없는 계약에 일시불 — 날짜 없는 미입금만 한 건으로 바꾸고, 처음 계획도 같은 값", () => {
  const implicit = { id: "d", stage: "closing", value: 1200000 };
  const [lump] = scheduleLumpSum(implicit, { amount: 1200000, at: "2026-10-10T03:00:00.000Z" });
  assert.equal(lump.expectedAmount, 1200000);
  assert.equal(lump.expectedAt, "2026-10-10T03:00:00.000Z");
  assert.equal(lump.plannedAt, "2026-10-10T03:00:00.000Z");
  const mixed = { id: "m", stage: "closing", value: 0, payments: [
    { id: "paid", expectedAmount: 500000, expectedAt: "2026-09-01T03:00:00.000Z", status: "paid", paidAmount: 500000, paidAt: "2026-09-02T03:00:00.000Z" },
    { id: "undated", expectedAmount: 700000 },
  ] };
  const next = scheduleLumpSum(mixed, { amount: 700000, at: "2026-10-01T03:00:00.000Z" });
  assert.deepEqual(next.map((p) => p.id).slice(0, 1), ["paid"]);
  assert.equal(next.length, 2);
  assert.equal(next.some((p) => p.id === "undated"), false);
  assert.deepEqual(scheduleLumpSum(mixed, { amount: 0 }).map((p) => p.id), ["paid", "undated"], "금액이 없으면 바꾸지 않는다");
});
