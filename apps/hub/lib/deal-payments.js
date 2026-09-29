// 딜별 결제 일정 — 운영자 2026-09-24 결정("입금·매출 목표 기록…처음에는 러프하게 잡고,
// 그 다음 딜별로 상세하게…결제가 됐을 때는 예상치와 결제된 확정치를 나눠서 표기")의 세 계층
// 중 2·3층. 1층(딜 하나 = 금액 + 예상일)은 이미 deals.amount/expected_close_at가 담당한다.
//
// 저장은 deals.meta.payments(마이그레이션 없음) — `apps/hub/lib/sales-os/revenue-write.js`의
// buildDealWrite가 이 배열 전체를 metaPatch.payments로 실어 기존 meta 병합 경로(persistRevenueRecord)
// 를 그대로 탄다. 스키마가 없는 필드라 읽는 쪽은 항상 이 파일의 normalize*를 거쳐야 한다.
//
// 세 계층:
// 1. 러프 — payments가 비어 있으면 딜의 amount·closeAt을 "암묵적 결제 1건"으로 취급한다.
//    중복 저장하지 않는다: effectivePayments()가 매번 파생한다.
// 2. 상세 — 계약금·잔금처럼 여러 예상 입금을 payments 배열에 건다(label 선택, expectedAmount·
//    expectedAt 필수).
// 3. 확정 — 각 항목에 paidAmount·paidAt·status를 채워 예상치(expected)와 확정치(paid)를
//    분리한다. 두 금액은 어디서도 하나로 합치지 않는다(§8.2 truth 분리와 같은 원칙).
//
// 처음 계획(운영자 2026-09-25 A안 "예상했던 돈 → 실제 들어온 돈"): 예상치(expected*)는 일정이
// 바뀌면 따라 움직이지만, "예상했던" 값은 움직이면 안 된다. 그래서 결제마다 처음 계획을
// plannedAmount·plannedAt으로 따로 박제한다.
// - 항목이 처음 생길 때 planned* = expected*. 이후 updatePayment·날짜 이동은 expected*만 바꾼다.
// - planned 필드가 없는 옛 항목은 expected*로 읽는다(마이그레이션 없음). 한 번이라도 다시
//   저장되면 normalizePayment가 그 값을 planned*로 적어 이후로는 고정된다.
// - 암묵 결제(명시 일정 없음)의 처음 계획은 deals.meta.plan_baseline = { amount, closeAt, at }이
//   담는다. 거래 화면이 금액·예상일을 처음 바꿀 때 한 번만 쓴다(planBaselineFor, 서버도 덮어쓰지
//   않는다 — sales-os/revenue-write.js mergeRecordMeta). 없으면 지금 값이 곧 계획이다.
// - 입금액이 예상과 다르면 이유 한 줄(paidNote, 40자)을 선택으로 남긴다. 같으면 저장하지 않는다.
//
// 매달 정기(운영자 2026-09-26, deal-recurring.js): deals.meta.recurring이 있으면 딜의 금액·예상일을
// 암묵 결제로 파생하지 않는다 — 돈은 달마다의 가상 회차로 들어온다. 한 달 치를 입금 확인하면
// recurringMonth: 'YYYY-MM'가 붙은 명시 결제가 생긴다(markRecurringPaid). normalizePayment은 그
// 표시를 보존한다(없는 결제에는 키를 붙이지 않는다).

import { kstDayKey } from "./kst-day.js";
import { isRecurringMonthKey, normalizeRecurring, recurringDueIso, recurringMonthLabel } from "./deal-recurring.js";

export const PAYMENT_STATUSES = ["expected", "paid", "cancelled"];
export const IMPLICIT_PAYMENT_ID = "implicit";
export const PAID_NOTE_MAX = 40;

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function toNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toLabelOrNull(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s.slice(0, 60) : null;
}

export function toPaidNoteOrNull(value) {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, PAID_NOTE_MAX) : null;
}

let seq = 0;
// 새 항목 id — 저장 전 클라이언트에서만 쓰인다(서버는 그대로 문자열을 보존).
export function newPaymentId() {
  seq += 1;
  return `pay-${Date.now().toString(36)}-${seq}`;
}

// 하나의 원시 항목을 정규화한다. expectedAmount가 없는(0 이하) 항목은 기록으로서 의미가
// 없어 버린다 — 빈 "결제 일정 나누기" 행을 그대로 저장하면 다음 로드에서 ₩0 예상치가
// 사실처럼 보인다.
//
// 처음 계획: plannedAmount가 있으면(>0) 그 항목은 이미 계획이 박제된 것이라 plannedAt도 그대로
// 읽는다(날짜 없이 계획한 경우 null 유지). 없으면 옛 항목 — expected*로 채운다.
// paidNote는 입금됐고 입금액이 예상과 다를 때만 남는다.
export function normalizePayment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const expectedAmount = toPositiveNumber(raw.expectedAmount);
  if (!expectedAmount) return null;
  const status = PAYMENT_STATUSES.includes(raw.status) ? raw.status : "expected";
  const expectedAt = toIsoOrNull(raw.expectedAt);
  const rawPaid = toNonNegativeNumber(raw.paidAmount);
  const paidAmount = status === "paid" ? (rawPaid || expectedAmount) : rawPaid;
  const plannedAmount = toPositiveNumber(raw.plannedAmount);
  const paidNote = status === "paid" && paidAmount !== expectedAmount ? toPaidNoteOrNull(raw.paidNote) : null;
  const recurringMonth = isRecurringMonthKey(raw.recurringMonth) ? raw.recurringMonth : null;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newPaymentId(),
    label: toLabelOrNull(raw.label),
    expectedAmount,
    expectedAt,
    plannedAmount: plannedAmount || expectedAmount,
    plannedAt: plannedAmount ? toIsoOrNull(raw.plannedAt) : expectedAt,
    paidAmount,
    paidAt: status === "paid" ? (toIsoOrNull(raw.paidAt) || new Date().toISOString()) : toIsoOrNull(raw.paidAt),
    paidNote,
    status,
    ...(recurringMonth ? { recurringMonth } : {}),
  };
}

export function normalizePayments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePayment).filter(Boolean);
}

export function hasPaymentSchedule(deal) {
  return normalizePayments(deal?.payments).length > 0;
}

// ── 암묵 결제의 처음 계획(deals.meta.plan_baseline) ───────────────────────────

// 원시 meta.plan_baseline → { amount, closeAt, at } | null. 금액이 없는 기준선은 계획이 아니다.
export function normalizePlanBaseline(raw) {
  if (!raw || typeof raw !== "object") return null;
  const amount = toPositiveNumber(raw.amount);
  if (!amount) return null;
  return { amount, closeAt: toIsoOrNull(raw.closeAt), at: toIsoOrNull(raw.at) };
}

// 거래 화면이 딜의 금액·예상일을 바꾸기 직전에 부른다 — 이번 저장에 실어 보낼 기준선, 또는 null.
// 쓰는 조건(전부 참일 때 한 번만):
// - 아직 기준선이 없다(한 번 쓰면 끝 — 서버도 기존 값을 덮어쓰지 않는다).
// - 명시 결제 일정이 없다(명시 일정은 결제마다 planned*를 따로 가진다).
// - 바꾸기 전 계획이 완성돼 있었다(금액 > 0이고 예상일 있음). 비어 있던 값을 처음 채우는 것은
//   계획을 바꾸는 게 아니라 계획을 세우는 것이라 기준선을 남기지 않는다.
// - 이번 변경이 금액 또는 예상일(KST 날짜)을 실제로 바꾼다.
// nextFields = { value?, closeAt? } — undefined인 필드는 바뀌지 않는 것으로 본다. 금액을 숫자로
// 읽을 수 없으면(표시 문자열 등) 바뀌지 않은 것으로 본다(기준선을 잘못 쓰는 쪽보다 덜 위험).
export function planBaselineFor(prevDeal, nextFields = {}, now = new Date()) {
  if (!prevDeal || normalizePlanBaseline(prevDeal.planBaseline)) return null;
  if (hasPaymentSchedule(prevDeal)) return null;
  const amount = toPositiveNumber(prevDeal.value);
  const closeAt = toIsoOrNull(prevDeal.closeAt);
  if (!amount || !closeAt) return null;
  let changed = false;
  if (nextFields.value !== undefined) {
    const next = Number(nextFields.value);
    if (Number.isFinite(next) && Math.round(next) !== amount) changed = true;
  }
  if (nextFields.closeAt !== undefined && kstDayKey(nextFields.closeAt || "") !== kstDayKey(closeAt)) changed = true;
  if (!changed) return null;
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString();
  return { amount, closeAt, at };
}

// 명시 일정이 없으면 딜의 금액·예상일 그대로 암묵적 결제 1건 — 중복 저장 없이 매번 파생한다.
// 처음 계획은 plan_baseline이 있으면 그것, 없으면 지금 값. 매달 정기 계획이 있는 딜은 암묵
// 결제를 만들지 않는다(돈은 달마다의 회차로 들어온다 — deal-recurring.js).
export function effectivePayments(deal) {
  const explicit = normalizePayments(deal?.payments);
  if (explicit.length > 0) return explicit;
  if (normalizeRecurring(deal?.recurring)) return [];
  const expectedAmount = toPositiveNumber(deal?.value);
  if (!expectedAmount) return [];
  const expectedAt = toIsoOrNull(deal?.closeAt) || null;
  const baseline = normalizePlanBaseline(deal?.planBaseline);
  return [{
    id: IMPLICIT_PAYMENT_ID,
    label: null,
    expectedAmount,
    expectedAt,
    plannedAmount: baseline ? baseline.amount : expectedAmount,
    plannedAt: baseline ? baseline.closeAt : expectedAt,
    paidAmount: 0,
    paidAt: null,
    paidNote: null,
    status: "expected",
  }];
}

export function unpaidPayments(deal) {
  return effectivePayments(deal).filter((p) => p.status === "expected");
}

export function dealExpectedTotal(deal) {
  return effectivePayments(deal).reduce((sum, p) => sum + p.expectedAmount, 0);
}

export function dealPaidTotal(deal) {
  return effectivePayments(deal).reduce((sum, p) => (p.status === "paid" ? sum + p.paidAmount : sum), 0);
}

// 명시 일정이 있고 전부 결제·취소로 끝났으면(적어도 하나는 결제) 완결 — 레인에서 빠진다.
// 취소만 있고 결제가 하나도 없는 딜은 "결제된 적 없음"이라 완결이 아니다.
export function isDealFullyPaid(deal) {
  const payments = effectivePayments(deal);
  if (!payments.length) return false;
  if (payments.some((p) => p.status === "expected")) return false;
  return payments.some((p) => p.status === "paid");
}

// ── 낙관적 갱신용 순수 뮤테이터 — 전부 새 payments 배열을 반환한다(원본 불변) ──────────

// 처음으로 일정을 나눌 때, 암묵적 결제를 명시 배열로 옮겨 적는다 — 이미 명시 배열이 있으면
// 그대로 둔다. 기존 지불액을 잃지 않기 위한 유일한 변환 지점. 암묵 결제의 처음 계획
// (plan_baseline 또는 지금 값)도 planned*로 그대로 옮겨 간다.
function materialize(deal) {
  const explicit = normalizePayments(deal?.payments);
  if (explicit.length > 0) return explicit;
  return effectivePayments(deal); // 암묵 1건(있으면) 그대로 명시 배열로
}

// "결제 일정 나누기" — 새 행 하나를 덧붙인다. fields를 주면 그 값으로(처음 계획도 같은 값),
// 없으면 빈 행 — 빈 행은 정규화에서 버려지므로 호출자가 금액을 채운 뒤에만 저장한다.
export function addInstallment(deal, { label = null, expectedAmount = 0, expectedAt = null } = {}) {
  const base = materialize(deal);
  const amount = toPositiveNumber(expectedAmount);
  const at = toIsoOrNull(expectedAt);
  return [...base, {
    id: newPaymentId(),
    label: toLabelOrNull(label),
    expectedAmount: amount,
    expectedAt: at,
    plannedAmount: amount,
    plannedAt: at,
    paidAmount: 0,
    paidAt: null,
    paidNote: null,
    status: "expected",
  }];
}

// 편집·날짜 이동은 예상치(expected*)만 바꾼다 — 처음 계획(planned*)은 patch에 있어도 무시한다.
export function updatePayment(deal, paymentId, patch = {}) {
  const base = materialize(deal);
  const rest = { ...(patch || {}) };
  delete rest.plannedAmount;
  delete rest.plannedAt;
  return base.map((p) => (p.id === paymentId ? { ...p, ...rest, id: p.id } : p));
}

export function cancelPayment(deal, paymentId) {
  return updatePayment(deal, paymentId, { status: "cancelled" });
}

// "입금 확인" — 기본값은 예상 금액 전액·오늘 날짜지만 호출자가 다르게 채워 보낼 수 있다.
// 차이 이유(paidNote)는 입금액이 예상과 다를 때만 남는다 — 같으면 받아도 버린다.
export function markPaid(deal, paymentId, { paidAmount, paidAt, paidNote } = {}) {
  const base = materialize(deal);
  return base.map((p) => {
    if (p.id !== paymentId) return p;
    const amount = toPositiveNumber(paidAmount) || p.expectedAmount;
    return {
      ...p,
      status: "paid",
      paidAmount: amount,
      paidAt: toIsoOrNull(paidAt) || new Date().toISOString(),
      paidNote: amount !== p.expectedAmount ? toPaidNoteOrNull(paidNote) : null,
    };
  });
}

// 입금 확인을 되돌린다(되돌리기 토스트) — 다시 예상 상태로, 지불 기록·차이 이유는 지운다.
export function unmarkPaid(deal, paymentId) {
  return updatePayment(deal, paymentId, { status: "expected", paidAmount: 0, paidAt: null, paidNote: null });
}

export function removeInstallment(deal, paymentId) {
  const base = materialize(deal);
  return base.filter((p) => p.id !== paymentId);
}

// ── 돈 보기(운영자 2026-09-26)의 빠른 일정 ────────────────────────────────────────

// "일시불" — 계약됐는데 일정이 없는 거래에 금액·날짜 한 건을 건다. 이미 들어온(또는 취소된)
// 결제와 날짜가 있는 결제·정기 기록은 그대로 두고, 날짜 없는 미입금 결제(암묵 결제 포함)만 이
// 한 건으로 바꾼다. 날짜가 없던 것을 처음 채우는 것은 계획을 세우는 것이라 처음 계획도 같은 값.
export function scheduleLumpSum(deal, { amount, at } = {}) {
  const value = toPositiveNumber(amount);
  const base = normalizePayments(deal?.payments);
  if (!value) return base;
  const kept = base.filter((p) => p.status !== "expected" || p.expectedAt || p.recurringMonth);
  const expectedAt = toIsoOrNull(at);
  return [...kept, {
    id: newPaymentId(),
    label: null,
    expectedAmount: value,
    expectedAt,
    plannedAmount: value,
    plannedAt: expectedAt,
    paidAmount: 0,
    paidAt: null,
    paidNote: null,
    status: "expected",
  }];
}

// 매달 정기의 한 달 치 "입금 확인" — 그 달의 가상 회차를 명시 결제 한 건으로 적는다
// (recurringMonth로 짝지어져 다음 로드부터 그 달 회차가 입금됨이 된다). 이미 그 달 기록이 있으면
// 그 기록을 바꾼다(중복 없음). 기본값은 계획 금액 전액·오늘. 계획이 없거나 달 키가 틀리면
// 명시 결제를 그대로 돌려준다(아무것도 바꾸지 않음).
export function markRecurringPaid(deal, monthKey, { paidAmount, paidAt, paidNote } = {}) {
  const base = normalizePayments(deal?.payments);
  const rec = normalizeRecurring(deal?.recurring);
  if (!rec || !isRecurringMonthKey(monthKey)) return base;
  const existing = base.find((p) => p.recurringMonth === monthKey) || null;
  const dueAt = recurringDueIso(rec, monthKey);
  const expectedAmount = existing ? existing.expectedAmount : rec.amount;
  const expectedAt = existing ? (existing.expectedAt || dueAt) : dueAt;
  const amount = toPositiveNumber(paidAmount) || expectedAmount;
  const record = {
    id: existing ? existing.id : `rec-${monthKey}`,
    label: existing?.label || recurringMonthLabel(monthKey),
    expectedAmount,
    expectedAt,
    plannedAmount: existing ? existing.plannedAmount : expectedAmount,
    plannedAt: existing ? existing.plannedAt : expectedAt,
    paidAmount: amount,
    paidAt: toIsoOrNull(paidAt) || new Date().toISOString(),
    paidNote: amount !== expectedAmount ? toPaidNoteOrNull(paidNote) : null,
    status: "paid",
    recurringMonth: monthKey,
  };
  return existing ? base.map((p) => (p.id === existing.id ? record : p)) : [...base, record];
}
