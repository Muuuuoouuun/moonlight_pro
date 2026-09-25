import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IMPLICIT_PAYMENT_ID,
  addInstallment,
  cancelPayment,
  dealExpectedTotal,
  dealPaidTotal,
  effectivePayments,
  hasPaymentSchedule,
  isDealFullyPaid,
  markPaid,
  normalizePayment,
  normalizePayments,
  removeInstallment,
  unmarkPaid,
  unpaidPayments,
  updatePayment,
} from "./deal-payments.js";

test("payments가 없으면 딜의 amount·closeAt으로 암묵적 결제 1건을 파생한다(중복 저장 없음)", () => {
  const deal = { value: 1_800_000, closeAt: "2026-09-25T03:00:00.000Z" };
  assert.equal(hasPaymentSchedule(deal), false);
  const payments = effectivePayments(deal);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].id, IMPLICIT_PAYMENT_ID);
  assert.equal(payments[0].expectedAmount, 1_800_000);
  assert.equal(payments[0].expectedAt, "2026-09-25T03:00:00.000Z");
  assert.equal(payments[0].status, "expected");
  assert.equal(dealExpectedTotal(deal), 1_800_000);
  assert.equal(dealPaidTotal(deal), 0);
});

test("금액이 없는 딜은 암묵적 결제도 없다 — ₩0을 사실처럼 만들지 않는다", () => {
  assert.deepEqual(effectivePayments({ value: 0 }), []);
  assert.deepEqual(effectivePayments({}), []);
});

test("normalizePayment은 expectedAmount가 없는 항목을 버린다", () => {
  assert.equal(normalizePayment({ expectedAmount: 0 }), null);
  assert.equal(normalizePayment({}), null);
  assert.equal(normalizePayment(null), null);
  const p = normalizePayment({ id: "x", label: "계약금", expectedAmount: "900000", expectedAt: "2026-10-01" });
  assert.equal(p.id, "x");
  assert.equal(p.label, "계약금");
  assert.equal(p.expectedAmount, 900000);
  assert.equal(p.status, "expected");
  assert.equal(p.paidAmount, 0);
});

test("status='paid'인 원시 항목은 paidAmount·paidAt을 채워 정규화한다", () => {
  const p = normalizePayment({ expectedAmount: 500000, status: "paid" });
  assert.equal(p.status, "paid");
  assert.equal(p.paidAmount, 500000, "지불액 미기재 시 예상액 전액으로 채운다");
  assert.ok(p.paidAt, "지불일 미기재 시 지금 시각으로 채운다");
});

test("명시 일정은 여러 예상 입금을 담고 예상치·확정치를 분리한다", () => {
  const deal = {
    value: 1_800_000,
    closeAt: "2026-09-25",
    payments: [
      { id: "a", label: "계약금", expectedAmount: 900000, expectedAt: "2026-09-25", status: "paid", paidAmount: 900000, paidAt: "2026-09-20" },
      { id: "b", label: "잔금", expectedAmount: 900000, expectedAt: "2026-10-25", status: "expected" },
    ],
  };
  assert.equal(hasPaymentSchedule(deal), true);
  assert.equal(dealExpectedTotal(deal), 1_800_000);
  assert.equal(dealPaidTotal(deal), 900_000);
  assert.deepEqual(unpaidPayments(deal).map((p) => p.id), ["b"]);
  assert.equal(isDealFullyPaid(deal), false);
});

test("전부 결제·취소로 끝난 명시 일정만 완결로 본다(취소만 있으면 완결 아님)", () => {
  const allPaid = { payments: [{ id: "a", expectedAmount: 100, status: "paid" }, { id: "b", expectedAmount: 100, status: "cancelled" }] };
  assert.equal(isDealFullyPaid(allPaid), true);
  const onlyCancelled = { payments: [{ id: "a", expectedAmount: 100, status: "cancelled" }] };
  assert.equal(isDealFullyPaid(onlyCancelled), false, "결제 이력이 전혀 없으면 완결이 아니다");
  const implicit = { value: 100 };
  assert.equal(isDealFullyPaid(implicit), false, "암묵적 결제 1건은 아직 완결이 아니다(입금 전)");
});

test("addInstallment은 암묵적 결제를 명시 배열로 옮겨 적고 빈 행을 하나 붙인다", () => {
  const deal = { value: 1_800_000, closeAt: "2026-09-25" };
  const next = addInstallment(deal);
  assert.equal(next.length, 2);
  // materialize()는 정규화된 effectivePayments를 그대로 쓰므로 첫 행은 원래 금액을 유지한다.
  assert.equal(next[0].expectedAmount, 1_800_000);
  assert.equal(next[1].expectedAmount, 0, "새 행은 저장 전 편집을 전제로 비어 있다");
});

test("updatePayment·markPaid·cancelPayment·unmarkPaid·removeInstallment은 새 배열을 반환하고 원본을 바꾸지 않는다", () => {
  const deal = {
    payments: [
      { id: "a", expectedAmount: 900000, expectedAt: "2026-09-25", status: "expected" },
      { id: "b", expectedAmount: 900000, expectedAt: "2026-10-25", status: "expected" },
    ],
  };
  const original = deal.payments;

  const edited = updatePayment(deal, "a", { label: "계약금", expectedAmount: 1000000 });
  assert.equal(edited.find((p) => p.id === "a").label, "계약금");
  assert.equal(edited.find((p) => p.id === "a").expectedAmount, 1000000);
  assert.deepEqual(deal.payments, original, "원본 불변");

  const paid = markPaid(deal, "a", { paidAmount: 900000, paidAt: "2026-09-24" });
  assert.equal(paid.find((p) => p.id === "a").status, "paid");
  assert.equal(paid.find((p) => p.id === "a").paidAmount, 900000);

  const dealWithPaid = { payments: paid };
  const undone = unmarkPaid(dealWithPaid, "a");
  assert.equal(undone.find((p) => p.id === "a").status, "expected");
  assert.equal(undone.find((p) => p.id === "a").paidAmount, 0);

  const cancelled = cancelPayment(deal, "b");
  assert.equal(cancelled.find((p) => p.id === "b").status, "cancelled");

  const removed = removeInstallment(deal, "b");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, "a");
});

test("normalizePayments는 배열이 아닌 값·부적합 항목을 안전히 버린다", () => {
  assert.deepEqual(normalizePayments(null), []);
  assert.deepEqual(normalizePayments("nope"), []);
  assert.deepEqual(normalizePayments([{ expectedAmount: 0 }, null, { expectedAmount: -5 }]), []);
});
