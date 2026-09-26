// 결제 기록의 달(KST "YYYY-MM") 도우미 — 거래 "돈" 보기(lib/deal-money.js)가 쓴다.
//
// 2026-09-25 A안의 "결제" 보기(월별 예상했던 돈 → 들어온 돈 막대·딜별 결제 표)는 운영자
// 2026-09-26 결정으로 거래 탭에서 빠졌다(보기는 돈 · 단계 둘). 결제마다의 처음 계획(planned*)·
// 확정(paid*)은 여전히 deal-payments.js가 기록하고 하단 독이 보여 준다 — 여기엔 달 경계와
// "기록 이전" 판정만 남는다.
//
// 결제 기록은 2026-09(라운드 2)부터 생겼다. 그 전 달은 입금 사실이 기록에 없어서, 그 달에 예상된
// 성사 거래의 미입금을 "늦은 입금"(빨강)으로 말하지 않는다. 운영자가 더 이른 입금을 소급해 적으면
// 그 달부터 기록이 있는 것으로 본다(recordsStartKey).

import { effectivePayments } from "./deal-payments.js";
import { kstDayNumber } from "./deal-timeline.js";

const DAY_MS = 86_400_000;
const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// 결제 기록(deals.meta.payments의 paid)이 처음 생긴 달 — 이보다 이른 달은 기록 이전이다.
export const PAYMENT_RECORDS_SINCE = "2026-09";

function parseMonthKey(key) {
  const match = MONTH_KEY_RE.exec(String(key || ""));
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1 } : null;
}

export function isMonthKey(key) {
  return parseMonthKey(key) != null;
}

export function monthKeyOfDay(day) {
  if (day == null || !Number.isFinite(day)) return null;
  const date = new Date(day * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ISO·Date·"YYYY-MM-DD" → KST 달 키. 날짜가 없거나 틀리면 null.
export function paymentMonthKey(value) {
  return monthKeyOfDay(kstDayNumber(value));
}

export function shiftMonthKey(key, delta) {
  const parsed = parseMonthKey(key);
  if (!parsed) return null;
  const date = new Date(Date.UTC(parsed.y, parsed.m + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelOfKey(key, currentYear) {
  const parsed = parseMonthKey(key);
  if (!parsed) return "";
  return parsed.y === currentYear ? `${parsed.m + 1}월` : `${parsed.y}년 ${parsed.m + 1}월`;
}

// 기록이 있는 첫 달 — PAYMENT_RECORDS_SINCE와 가장 이른 입금 달 중 이른 쪽.
export function recordsStartKey(deals) {
  let start = PAYMENT_RECORDS_SINCE;
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal || deal.hidden) continue;
    for (const payment of effectivePayments(deal)) {
      if (payment.status !== "paid") continue;
      const key = paymentMonthKey(payment.paidAt);
      if (key && key < start) start = key;
    }
  }
  return start;
}
