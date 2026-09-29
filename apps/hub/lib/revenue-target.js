// 월별 매출 목표 — 운영자 2026-09-24 결정의 1층(러프)을 담는다. 거래 화면 하나에서
// 빠르게 정하는 월 숫자 하나이지, 목표·성과(operating_metrics/OKR·KPI)의 정식 지표가
// 아니다. 나중에 연결할 수 있도록 값은 "YYYY-MM" 키의 평평한 맵으로만 둔다(§9 Q-RR7).
//
// 저장은 workspaces.meta.revenue_targets(마이그레이션 없음 — workspaces.meta는
// 20260420_0001에서 이미 jsonb로 존재). 쓰기는 lib/sales-os/revenue-target-write.js.

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonthKey(value) {
  return typeof value === "string" && MONTH_KEY_RE.test(value);
}

// timelineContext(deal-timeline.js)가 반환하는 { year, month(0-based) }에서 같은 키를 뽑는다.
export function monthKeyOf({ year, month } = {}) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function normalizeTargetAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// 원시 meta.revenue_targets(신뢰할 수 없는 저장값) → 유효한 { "YYYY-MM": amount } 맵만.
export function normalizeRevenueTargets(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isValidMonthKey(key)) continue;
    const amount = normalizeTargetAmount(value);
    if (amount != null) out[key] = amount;
  }
  return out;
}

// targets가 null이면 "읽지 못함"(read 실패) — 0이나 미정과 구분해 호출부가 목표선을
// 그리지 않고 "목표 정하기" CTA도 숨기게 한다(정직성 규칙: 모르는 값을 미정으로 위장하지 않음).
export function targetForMonth(targets, ctx) {
  if (!targets || typeof targets !== "object") return null;
  const key = monthKeyOf(ctx);
  if (!key) return null;
  return Object.hasOwn(targets, key) ? targets[key] : null;
}

// 목표 대비 진행 — 남은 목표는 확정(입금됨)만 뺀다. 예상(아직 미입금)이 남은 목표를
// 채우는지는 별도 불리언으로 알린다("예상만으로 충분한가").
export function targetProgress({ target, paid, expected }) {
  if (target == null) return null;
  const paidAmount = Number.isFinite(Number(paid)) ? Number(paid) : 0;
  const expectedAmount = Number.isFinite(Number(expected)) ? Number(expected) : 0;
  const remaining = Math.max(0, target - paidAmount);
  return {
    target,
    paid: paidAmount,
    remaining,
    reached: paidAmount >= target,
    coveredByExpected: remaining > 0 && expectedAmount >= remaining,
  };
}
