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

export const PAYMENT_STATUSES = ["expected", "paid", "cancelled"];
export const IMPLICIT_PAYMENT_ID = "implicit";

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

let seq = 0;
// 새 항목 id — 저장 전 클라이언트에서만 쓰인다(서버는 그대로 문자열을 보존).
export function newPaymentId() {
  seq += 1;
  return `pay-${Date.now().toString(36)}-${seq}`;
}

// 하나의 원시 항목을 정규화한다. expectedAmount가 없는(0 이하) 항목은 기록으로서 의미가
// 없어 버린다 — 빈 "결제 일정 나누기" 행을 그대로 저장하면 다음 로드에서 ₩0 예상치가
// 사실처럼 보인다.
export function normalizePayment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const expectedAmount = toPositiveNumber(raw.expectedAmount);
  if (!expectedAmount) return null;
  const status = PAYMENT_STATUSES.includes(raw.status) ? raw.status : "expected";
  const paidAmount = toNonNegativeNumber(raw.paidAmount);
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newPaymentId(),
    label: toLabelOrNull(raw.label),
    expectedAmount,
    expectedAt: toIsoOrNull(raw.expectedAt),
    paidAmount: status === "paid" ? (paidAmount || expectedAmount) : paidAmount,
    paidAt: status === "paid" ? (toIsoOrNull(raw.paidAt) || new Date().toISOString()) : toIsoOrNull(raw.paidAt),
    status,
  };
}

export function normalizePayments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePayment).filter(Boolean);
}

export function hasPaymentSchedule(deal) {
  return normalizePayments(deal?.payments).length > 0;
}

// 명시 일정이 없으면 딜의 금액·예상일 그대로 암묵적 결제 1건 — 중복 저장 없이 매번 파생한다.
export function effectivePayments(deal) {
  const explicit = normalizePayments(deal?.payments);
  if (explicit.length > 0) return explicit;
  const expectedAmount = toPositiveNumber(deal?.value);
  if (!expectedAmount) return [];
  return [{
    id: IMPLICIT_PAYMENT_ID,
    label: null,
    expectedAmount,
    expectedAt: toIsoOrNull(deal?.closeAt) || null,
    paidAmount: 0,
    paidAt: null,
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
// 그대로 둔다. 기존 지불액을 잃지 않기 위한 유일한 변환 지점.
function materialize(deal) {
  const explicit = normalizePayments(deal?.payments);
  if (explicit.length > 0) return explicit;
  return effectivePayments(deal); // 암묵 1건(있으면) 그대로 명시 배열로
}

// "결제 일정 나누기" — 빈 새 행 하나를 덧붙인다. 호출자가 금액·날짜를 채운 뒤 저장한다.
export function addInstallment(deal) {
  const base = materialize(deal);
  return [...base, {
    id: newPaymentId(),
    label: null,
    expectedAmount: 0,
    expectedAt: null,
    paidAmount: 0,
    paidAt: null,
    status: "expected",
  }];
}

export function updatePayment(deal, paymentId, patch) {
  const base = materialize(deal);
  return base.map((p) => (p.id === paymentId ? { ...p, ...patch, id: p.id } : p));
}

export function cancelPayment(deal, paymentId) {
  return updatePayment(deal, paymentId, { status: "cancelled" });
}

// "입금 확인" — 기본값은 예상 금액 전액·오늘 날짜지만 호출자가 다르게 채워 보낼 수 있다.
export function markPaid(deal, paymentId, { paidAmount, paidAt } = {}) {
  const base = materialize(deal);
  return base.map((p) => {
    if (p.id !== paymentId) return p;
    const amount = toPositiveNumber(paidAmount) || p.expectedAmount;
    return { ...p, status: "paid", paidAmount: amount, paidAt: toIsoOrNull(paidAt) || new Date().toISOString() };
  });
}

// 입금 확인을 되돌린다(되돌리기 토스트) — 다시 예상 상태로, 지불 기록은 지운다.
export function unmarkPaid(deal, paymentId) {
  return updatePayment(deal, paymentId, { status: "expected", paidAmount: 0, paidAt: null });
}

export function removeInstallment(deal, paymentId) {
  const base = materialize(deal);
  return base.filter((p) => p.id !== paymentId);
}
