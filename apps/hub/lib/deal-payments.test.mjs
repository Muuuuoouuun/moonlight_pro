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
  normalizePlanBaseline,
  planBaselineFor,
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

// ── 처음 계획(planned*) · 차이 이유(paidNote) · 암묵 결제 기준선 — 2026-09-25 A안 ──────────

test("새 결제는 만들 때의 금액·날짜가 곧 처음 계획이다", () => {
  const rows = addInstallment({ payments: [], value: 0 }, { label: "잔금", expectedAmount: 900000, expectedAt: "2026-10-02" });
  const row = rows[rows.length - 1];
  assert.equal(row.plannedAmount, 900000);
  assert.equal(row.plannedAt, row.expectedAt);
  assert.equal(normalizePayment(row).plannedAt, new Date("2026-10-02").toISOString());
});

test("planned 필드가 없는 옛 항목은 expected*로 읽고, 한 번 적힌 계획은 날짜 없음(null)까지 그대로 읽는다", () => {
  const legacy = normalizePayment({ id: "a", expectedAmount: 500000, expectedAt: "2026-09-15" });
  assert.equal(legacy.plannedAmount, 500000);
  assert.equal(legacy.plannedAt, legacy.expectedAt);
  const undatedPlan = normalizePayment({ id: "b", expectedAmount: 500000, expectedAt: "2026-10-02", plannedAmount: 400000, plannedAt: null });
  assert.equal(undatedPlan.plannedAmount, 400000);
  assert.equal(undatedPlan.plannedAt, null, "날짜 없이 세운 계획이 나중의 예상일로 바뀌지 않는다");
});

test("편집·날짜 이동은 예상치만 바꾸고 처음 계획은 절대 바꾸지 않는다", () => {
  const deal = { payments: [{ id: "a", expectedAmount: 1800000, expectedAt: "2026-09-15T03:00:00.000Z" }] };
  const moved = updatePayment(deal, "a", { expectedAt: "2026-10-02T03:00:00.000Z" });
  assert.equal(moved[0].expectedAt, "2026-10-02T03:00:00.000Z");
  assert.equal(moved[0].plannedAt, "2026-09-15T03:00:00.000Z");
  const edited = updatePayment({ payments: moved }, "a", {
    expectedAmount: 1600000, plannedAmount: 1, plannedAt: "2030-01-01T00:00:00.000Z",
  });
  assert.equal(edited[0].expectedAmount, 1600000);
  assert.equal(edited[0].plannedAmount, 1800000, "patch에 planned*가 있어도 무시한다");
  assert.equal(edited[0].plannedAt, "2026-09-15T03:00:00.000Z");
  // 저장 경로(normalize)를 다시 거쳐도 계획은 그대로
  const saved = normalizePayments(edited);
  assert.equal(saved[0].plannedAmount, 1800000);
  assert.equal(saved[0].plannedAt, "2026-09-15T03:00:00.000Z");
  const reMoved = updatePayment({ payments: saved }, "a", { expectedAt: null });
  assert.equal(reMoved[0].plannedAt, "2026-09-15T03:00:00.000Z", "날짜를 미정으로 옮겨도 계획일은 남는다");
});

test("차이 이유는 입금액이 예상과 다를 때만 저장하고, 40자로 자르며, 입금 되돌리기에 지운다", () => {
  const deal = { payments: [{ id: "a", expectedAmount: 1800000, expectedAt: "2026-09-02" }] };
  const same = markPaid(deal, "a", { paidAmount: 1800000, paidAt: "2026-09-03", paidNote: "할인" });
  assert.equal(same[0].paidNote, null, "금액이 같으면 이유를 받아도 버린다");
  const differs = markPaid(deal, "a", { paidAmount: 1600000, paidAt: "2026-09-03", paidNote: "  첫 달   할인  " });
  assert.equal(differs[0].paidNote, "첫 달 할인");
  assert.equal(normalizePayment(differs[0]).paidNote, "첫 달 할인");
  const long = markPaid(deal, "a", { paidAmount: 1000, paidNote: "가".repeat(60) });
  assert.equal(long[0].paidNote.length, 40);
  const blank = markPaid(deal, "a", { paidAmount: 1000, paidNote: "   " });
  assert.equal(blank[0].paidNote, null);
  const undone = unmarkPaid({ payments: differs }, "a");
  assert.equal(undone[0].paidNote, null);
  assert.equal(normalizePayment({ ...differs[0], status: "expected" }).paidNote, null, "미입금 항목엔 이유가 남지 않는다");
  assert.equal(normalizePayment({ ...differs[0], paidAmount: 1800000 }).paidNote, null, "금액이 같아지면 이유도 없다");
});

test("암묵 결제의 처음 계획은 plan_baseline이 있으면 그것, 없으면 지금 값", () => {
  const plain = effectivePayments({ value: 1800000, closeAt: "2026-10-02T03:00:00.000Z" });
  assert.equal(plain[0].plannedAmount, 1800000);
  assert.equal(plain[0].plannedAt, "2026-10-02T03:00:00.000Z");
  const withBaseline = effectivePayments({
    value: 2000000,
    closeAt: "2026-10-02T03:00:00.000Z",
    planBaseline: { amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z", at: "2026-09-10T00:00:00.000Z" },
  });
  assert.equal(withBaseline[0].expectedAmount, 2000000);
  assert.equal(withBaseline[0].plannedAmount, 1800000);
  assert.equal(withBaseline[0].plannedAt, "2026-09-15T03:00:00.000Z");
  // 잘못된 기준선(금액 없음)은 무시한다
  assert.equal(effectivePayments({ value: 5, closeAt: "2026-10-02", planBaseline: { amount: 0 } })[0].plannedAmount, 5);
});

test("암묵 결제를 명시 일정으로 옮겨 적으면 처음 계획도 같이 옮겨 간다", () => {
  const deal = {
    value: 2000000,
    closeAt: "2026-10-02T03:00:00.000Z",
    planBaseline: { amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z" },
  };
  const paid = markPaid(deal, IMPLICIT_PAYMENT_ID, { paidAmount: 2000000, paidAt: "2026-10-01" });
  assert.equal(paid[0].plannedAmount, 1800000);
  assert.equal(paid[0].plannedAt, "2026-09-15T03:00:00.000Z");
  const split = addInstallment(deal, { expectedAmount: 500000, expectedAt: "2026-11-01" });
  assert.equal(split[0].plannedAt, "2026-09-15T03:00:00.000Z");
  assert.equal(normalizePayments(split)[0].plannedAmount, 1800000, "저장 뒤에도 유지");
});

test("plan_baseline은 완성된 계획을 처음 바꿀 때 한 번만 — 이미 있으면·채우는 중이면·명시 일정이면·안 바뀌면 null", () => {
  const now = new Date("2026-09-25T01:00:00Z");
  const deal = { id: "d", value: 1800000, closeAt: "2026-09-15T03:00:00.000Z" };
  assert.deepEqual(planBaselineFor(deal, { closeAt: "2026-10-02T03:00:00.000Z" }, now), {
    amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z", at: "2026-09-25T01:00:00.000Z",
  });
  assert.equal(planBaselineFor(deal, { value: "2000000" }, now).amount, 1800000, "금액 변경도 기준선을 남긴다");
  assert.equal(planBaselineFor({ ...deal, planBaseline: { amount: 1800000, closeAt: "2026-09-15" } }, { closeAt: "2026-10-02" }, now), null, "한 번 쓰면 끝");
  assert.equal(planBaselineFor({ ...deal, closeAt: "" }, { closeAt: "2026-10-02" }, now), null, "날짜를 처음 채우는 건 계획을 세우는 것");
  assert.equal(planBaselineFor({ ...deal, value: 0 }, { value: 1000 }, now), null, "금액을 처음 채우는 것도 마찬가지");
  assert.equal(planBaselineFor({ ...deal, payments: [{ id: "a", expectedAmount: 10 }] }, { closeAt: "2026-10-02" }, now), null, "명시 일정은 결제마다 계획을 가진다");
  assert.equal(planBaselineFor(deal, { closeAt: "2026-09-15" }, now), null, "같은 KST 날짜는 변경이 아니다");
  assert.equal(planBaselineFor(deal, { closeAt: "2026-09-14T20:00:00Z" }, now), null, "UTC 전날 20시 = KST 9/15 05시 — 같은 날");
  assert.equal(planBaselineFor(deal, { value: 1800000, closeAt: "2026-09-15T03:00:00.000Z" }, now), null);
  assert.equal(planBaselineFor(deal, { value: "₩1.8M" }, now), null, "숫자로 못 읽는 금액은 바뀐 것으로 보지 않는다");
  assert.ok(planBaselineFor(deal, { closeAt: "" }, now), "날짜를 미정으로 지우는 것도 계획 변경");
  assert.equal(planBaselineFor(null, { closeAt: "2026-10-02" }, now), null);
});

test("normalizePlanBaseline은 금액 없는 값·객체 아닌 값을 버린다", () => {
  assert.equal(normalizePlanBaseline(null), null);
  assert.equal(normalizePlanBaseline("x"), null);
  assert.equal(normalizePlanBaseline({ amount: 0, closeAt: "2026-09-15" }), null);
  assert.deepEqual(normalizePlanBaseline({ amount: "1800000", closeAt: "2026-09-15T03:00:00.000Z", at: "nope" }), {
    amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z", at: null,
  });
});
