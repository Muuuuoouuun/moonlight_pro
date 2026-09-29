// 매달 정기 결제 — 운영자 2026-09-26 "돈" 보기 결정(결제 방법은 일시불 · 매달 정기 둘뿐).
//
// 저장은 deals.meta.recurring = { amount, day, startMonth, endMonth }(마이그레이션 없음).
//   amount     — 한 달에 들어올 금액(원, 양수)
//   day        — 매달 며칠(1–31). 그 달에 그 날이 없으면 말일로 당긴다(31일 → 2월 28/29일).
//   startMonth — 첫 달 'YYYY-MM'
//   endMonth   — 마지막 달 'YYYY-MM' 또는 null(끝 없음). 시작보다 앞이면 버린다(null).
//
// 달마다의 입금은 저장하지 않고 매번 파생한다(가상 회차, id `rec:YYYY-MM`). 한 달 치를 입금
// 확인하면 그때 처음으로 deals.meta.payments에 recurringMonth: 'YYYY-MM'가 붙은 결제가 한 건
// 생기고(deal-payments.js markRecurringPaid), 그 달의 가상 회차는 그 기록과 짝지어 "입금됨"이 된다.
// 그래서 같은 달이 명시 결제와 가상 회차로 두 번 세지지 않는다.
//
// 이 파일은 순수 함수만 — import 없음(deal-payments.js가 이 파일을 읽는다, 순환 금지).
// 날짜는 운영자 달력(Asia/Seoul)이고, 저장 시각은 KST 정오(03:00Z)라 어느 시간대에서 읽어도
// 같은 날짜로 떨어진다(deal-timeline.js dayNumberToIso와 같은 규칙).

const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const KST_NOON_UTC_MS = 3 * 3_600_000;

export const RECURRING_ID_PREFIX = "rec:";

function parseMonthKey(key) {
  const match = MONTH_KEY_RE.exec(String(key || ""));
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1 } : null;
}

export function isRecurringMonthKey(key) {
  return parseMonthKey(key) != null;
}

export function addMonthsToKey(key, delta) {
  const parsed = parseMonthKey(key);
  if (!parsed) return null;
  const date = new Date(Date.UTC(parsed.y, parsed.m + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonthKey(key) {
  const parsed = parseMonthKey(key);
  if (!parsed) return 0;
  return new Date(Date.UTC(parsed.y, parsed.m + 1, 0)).getUTCDate();
}

// 원시 meta.recurring(신뢰할 수 없는 저장값) → 정규화된 계획 | null.
// 금액·날·시작 달 중 하나라도 없으면 계획이 아니다 — ₩0 정기를 사실처럼 만들지 않는다.
export function normalizeRecurring(raw) {
  if (!raw || typeof raw !== "object") return null;
  const amount = Math.round(Number(raw.amount));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const day = Math.round(Number(raw.day));
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const startMonth = isRecurringMonthKey(raw.startMonth) ? raw.startMonth : null;
  if (!startMonth) return null;
  const endMonth = isRecurringMonthKey(raw.endMonth) && raw.endMonth >= startMonth ? raw.endMonth : null;
  return { amount, day, startMonth, endMonth };
}

export function isRecurringActive(rec, monthKey) {
  if (!rec || !isRecurringMonthKey(monthKey)) return false;
  if (monthKey < rec.startMonth) return false;
  return !rec.endMonth || monthKey <= rec.endMonth;
}

// 그 달의 입금일(일) — 말일을 넘으면 말일로.
export function recurringDueDay(rec, monthKey) {
  const last = daysInMonthKey(monthKey);
  if (!rec || !last) return null;
  return Math.min(rec.day, last);
}

// 그 달 회차의 예상 입금 시각(ISO, KST 정오).
export function recurringDueIso(rec, monthKey) {
  const parsed = parseMonthKey(monthKey);
  const day = recurringDueDay(rec, monthKey);
  if (!parsed || !day) return null;
  return new Date(Date.UTC(parsed.y, parsed.m, day) + KST_NOON_UTC_MS).toISOString();
}

export function recurringInstanceId(monthKey) {
  return `${RECURRING_ID_PREFIX}${monthKey}`;
}

export function recurringMonthLabel(monthKey) {
  const parsed = parseMonthKey(monthKey);
  return parsed ? `${parsed.m + 1}월 정기` : "정기";
}

// 방법 힌트 — "↻ 매달 3일".
export function recurringMethodLabel(rec) {
  return rec ? `↻ 매달 ${rec.day}일` : "";
}

// fromMonth..toMonth(둘 다 포함) 중 계획이 살아 있는 달의 회차. recorded는 정규화된 명시 결제
// 목록(deal-payments normalizePayments) — recurringMonth가 같은 기록이 있으면 그 기록의 상태·
// 금액을 입는다(입금됨·취소됨, 또는 옮겨 적힌 예상치). 기록이 없으면 계획 그대로 "예상".
// 상태 필터는 호출처가 한다(입금된 회차도 돌려준다 — 이 달 입금 합계에 필요할 수 있다).
export function recurringInstances(rec, recorded = [], { fromMonth, toMonth } = {}) {
  if (!rec || !isRecurringMonthKey(fromMonth) || !isRecurringMonthKey(toMonth) || fromMonth > toMonth) return [];
  const byMonth = new Map();
  for (const payment of Array.isArray(recorded) ? recorded : []) {
    if (payment?.recurringMonth && !byMonth.has(payment.recurringMonth)) byMonth.set(payment.recurringMonth, payment);
  }
  const out = [];
  for (let key = fromMonth; key && key <= toMonth; key = addMonthsToKey(key, 1)) {
    if (!isRecurringActive(rec, key)) continue;
    const dueAt = recurringDueIso(rec, key);
    const match = byMonth.get(key) || null;
    out.push({
      id: recurringInstanceId(key),
      recordId: match ? match.id : null,
      recurringMonth: key,
      label: match?.label || recurringMonthLabel(key),
      expectedAmount: match ? match.expectedAmount : rec.amount,
      expectedAt: match ? (match.expectedAt || dueAt) : dueAt,
      plannedAmount: match ? match.plannedAmount : rec.amount,
      plannedAt: match ? match.plannedAt : dueAt,
      paidAmount: match ? match.paidAmount : 0,
      paidAt: match ? match.paidAt : null,
      paidNote: match ? match.paidNote : null,
      status: match ? match.status : "expected",
    });
  }
  return out;
}
