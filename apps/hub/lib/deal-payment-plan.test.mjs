import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PAYMENT_RECORDS_SINCE,
  isMonthKey,
  monthKeyOfDay,
  monthLabelOfKey,
  paymentMonthKey,
  recordsStartKey,
  shiftMonthKey,
} from "./deal-payment-plan.js";
import { kstDayNumber } from "./deal-timeline.js";

const kst = (ymd) => `${ymd}T03:00:00.000Z`; // KST 정오

test("달 키는 KST 달력 기준이고 연말을 넘어간다", () => {
  assert.equal(paymentMonthKey("2026-09-30T15:30:00.000Z"), "2026-10", "UTC 9/30 15:30 = KST 10/1");
  assert.equal(paymentMonthKey("2026-09-30T14:59:00.000Z"), "2026-09");
  assert.equal(paymentMonthKey("2026-09-01"), "2026-09");
  assert.equal(paymentMonthKey(null), null);
  assert.equal(paymentMonthKey("nope"), null);
  assert.equal(monthKeyOfDay(kstDayNumber("2026-12-31")), "2026-12");
  assert.equal(monthKeyOfDay(null), null);
  assert.equal(shiftMonthKey("2026-11", 3), "2027-02");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(monthLabelOfKey("2026-09", 2026), "9월");
  assert.equal(monthLabelOfKey("2027-01", 2026), "2027년 1월");
  assert.equal(isMonthKey("2026-13"), false);
  assert.equal(isMonthKey("2026-09"), true);
});

test("기록이 있는 첫 달 — 2026-09 또는 소급해 적은 가장 이른 입금 달, 숨긴 거래는 세지 않는다", () => {
  assert.equal(PAYMENT_RECORDS_SINCE, "2026-09");
  const old = { id: "old", stage: "closing", value: 1000000, closeAt: kst("2026-08-10") };
  assert.equal(recordsStartKey([old]), "2026-09");
  const retro = { id: "retro", stage: "closing", value: 0,
    payments: [{ id: "x", expectedAmount: 500000, expectedAt: kst("2026-08-05"), status: "paid", paidAmount: 500000, paidAt: kst("2026-08-06") }] };
  assert.equal(recordsStartKey([old, retro]), "2026-08");
  assert.equal(recordsStartKey([old, { ...retro, hidden: true }]), "2026-09");
});
