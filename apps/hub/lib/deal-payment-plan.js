// 거래 "결제" 보기 — 딜별 "예상했던 돈 → 실제 들어온 돈" (운영자 2026-09-25 A안, 목업 05 #a).
//
// 결제 한 건에는 세 가지 값이 따로 산다(deal-payments.js):
//   처음 계획(planned*) — 처음 잡은 금액·날짜. 일정이 바뀌어도 움직이지 않는다.
//   지금 예상(expected*) — 일정 변경을 따라가는 현재 예상.
//   확정(paid*) — 실제로 들어온 금액·날짜(+ 차이 이유 paidNote).
// 이 파일은 그 셋을 달(KST "YYYY-MM") 단위로 모으는 순수 로직이다. 렌더는 모른다 —
// pages/deals-timeline.jsx의 결제 보기가 그리고, pages/revenue.jsx의 Deals가 히어로 한 줄에 쓴다.
//
// 달 합계(summarizePlanMonth):
//   planned          — 처음 계획일이 이 달인 결제(취소 제외)의 처음 계획 금액 합
//   confirmed        — 입금일이 이 달인 결제의 입금액 합(= 히어로 "이번 달 들어온 돈"과 같은 수)
//   plannedConfirmed — 이 달로 계획했던 결제 중 입금된 것의 입금액 합(입금일은 무관)
//   moved            — 이 달로 계획했는데 아직 미입금이고 지금은 뒤 달(또는 날짜 미정)로 옮겨진 것
//   pending/overdue/slipped — 이 달에 예상된 미입금 결제(오늘 KST 기준)
//
// 정직성 규칙:
// - 숨긴(정리한) 딜은 뺀다(paidThisMonth와 같다). Lost 딜의 미입금 결제는 "거래 잃음"으로
//   계획(planned)에는 남기고(예상이 빗나간 사실) 남은 예상·지남에서는 뺀다.
// - 빨강(overdue)은 실제로 받을 돈이 늦은 것뿐이다 — 거래가 클로징(성사)이거나 같은 거래의 다른
//   결제가 이미 들어온(계약이 살아 있는) 경우. 아직 성사 전인 거래의 예상일이 지난 것은
//   파이프라인이 밀린 것(slipped)이라 중립으로 말한다(언제 보기의 "예상일 지남"과 같다).
// - 결제 기록은 2026-09(라운드 2)부터 생겼다. 그 전 달은 입금 사실이 기록에 없어서, 확정·차이를
//   0이나 적자로 그리지 않고 "기록 이전"으로 말한다. 운영자가 더 이른 입금을 소급해 적으면 그
//   달부터 기록이 있는 것으로 본다(recordsStartKey). 기록 이전 달에 예상된 성사 거래의 미입금도
//   빨강이 아니라 "입금 기록 없음"이다.

import { effectivePayments } from "./deal-payments.js";
import { MAX_DANGER_RAILS, kstDayNumber } from "./deal-timeline.js";

const DAY_MS = 86_400_000;
const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// 결제 기록(deals.meta.payments의 paid)이 처음 생긴 달 — 이보다 이른 달은 기록 이전이다.
export const PAYMENT_RECORDS_SINCE = "2026-09";
// 월별 막대의 범위 — 지난 3개월 · 이번 달 · 앞으로 3개월. 표의 달 이동도 이 범위 안에서만.
export const PLAN_SERIES_BACK = 3;
export const PLAN_SERIES_AHEAD = 3;

// ── 달 키 ────────────────────────────────────────────────────────────────

function dayParts(day) {
  const date = new Date(day * DAY_MS);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

function parseMonthKey(key) {
  const match = MONTH_KEY_RE.exec(String(key || ""));
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1 } : null;
}

export function isMonthKey(key) {
  return parseMonthKey(key) != null;
}

export function monthKeyOfDay(day) {
  if (day == null || !Number.isFinite(day)) return null;
  const { y, m } = dayParts(day);
  return `${y}-${String(m + 1).padStart(2, "0")}`;
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

function shortDay(day) {
  if (day == null) return null;
  const { m, d } = dayParts(day);
  return `${m + 1}/${d}`;
}

// ── 결제 사실 수집 ──────────────────────────────────────────────────────────

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

function orgOf(deal) {
  return deal.companyName || deal.name || "이름 없는 거래";
}

// 결제 한 건의 판정 — 모든 합계·행이 이 목록 하나를 읽는다(헤더와 표가 다른 수를 말하지 않게).
// 미입금 상태: lost(거래 잃음) · undated(날짜 미정) · overdue(받을 돈이 늦음 — 빨강) ·
// slipped(성사 전 거래의 예상일 지남 — 중립) · unrecorded(기록 이전 달의 성사 거래) · pending.
export function collectPaymentFacts(deals, { now = new Date(), recordsSince } = {}) {
  const today = kstDayNumber(now) ?? kstDayNumber(Date.now());
  const since = recordsSince || recordsStartKey(deals);
  const facts = [];
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal || deal.hidden) continue;
    const payments = effectivePayments(deal).filter((p) => p.status !== "cancelled");
    const owed = deal.stage === "closing" || payments.some((p) => p.status === "paid");
    payments.forEach((payment, i) => {
      const plannedDay = kstDayNumber(payment.plannedAt);
      const expectedDay = kstDayNumber(payment.expectedAt);
      const paid = payment.status === "paid";
      const paidDay = paid ? kstDayNumber(payment.paidAt) : null;
      const expectedKey = monthKeyOfDay(expectedDay);
      let state = "pending";
      let daysLate = 0;
      if (paid) state = "paid";
      else if (deal.stage === "lost") state = "lost";
      else if (expectedDay == null) state = "undated";
      else if (expectedDay < today) {
        daysLate = today - expectedDay;
        if (!owed) state = "slipped";
        else if (expectedKey < since) state = "unrecorded";
        else state = "overdue";
      }
      facts.push({
        key: `${deal.id}::${payment.id}`,
        deal,
        dealId: deal.id,
        org: orgOf(deal),
        payment,
        paymentId: payment.id,
        index: i + 1,
        total: payments.length,
        state,
        daysLate,
        plannedDay,
        expectedDay,
        paidDay,
        plannedKey: monthKeyOfDay(plannedDay),
        expectedKey,
        paidKey: monthKeyOfDay(paidDay),
      });
    });
  }
  return facts;
}

const isOpen = (fact) => fact.state !== "paid" && fact.state !== "lost";

function sumOf(list, pick) {
  return list.reduce((sum, item) => sum + pick(item), 0);
}

function bucket(list, pick) {
  return { amount: sumOf(list, pick), count: list.length };
}

// ── 달 합계 ─────────────────────────────────────────────────────────────────

function summarizeFacts(facts, monthKey) {
  const plannedIn = facts.filter((f) => f.plannedKey === monthKey);
  const expectedOpen = facts.filter((f) => f.expectedKey === monthKey && isOpen(f));
  const planned = sumOf(plannedIn, (f) => f.payment.plannedAmount);
  const plannedConfirmed = sumOf(plannedIn.filter((f) => f.state === "paid"), (f) => f.payment.paidAmount);
  const moved = plannedIn.filter((f) => isOpen(f) && (f.expectedKey == null || f.expectedKey > monthKey));
  return {
    key: monthKey,
    planned,
    confirmed: sumOf(facts.filter((f) => f.paidKey === monthKey), (f) => f.payment.paidAmount),
    plannedConfirmed,
    // 히어로 괄호 — 계획한 것 중 들어온 것 − 계획. 음수면 아직(또는 끝내) 안 들어온 만큼.
    plannedDelta: plannedConfirmed - planned,
    moved: bucket(moved, (f) => f.payment.expectedAmount),
    remainingExpected: sumOf(expectedOpen, (f) => f.payment.expectedAmount),
    pending: bucket(expectedOpen.filter((f) => f.state === "pending"), (f) => f.payment.expectedAmount),
    overdue: bucket(expectedOpen.filter((f) => f.state === "overdue"), (f) => f.payment.expectedAmount),
    slipped: bucket(expectedOpen.filter((f) => f.state === "slipped"), (f) => f.payment.expectedAmount),
  };
}

export function summarizePlanMonth(deals, monthKey, { now = new Date() } = {}) {
  return summarizeFacts(collectPaymentFacts(deals, { now }), monthKey);
}

// ── 월별 막대 ───────────────────────────────────────────────────────────────

function seriesFromFacts(facts, { currentKey, currentYear, since }) {
  const months = [];
  for (let offset = -PLAN_SERIES_BACK; offset <= PLAN_SERIES_AHEAD; offset += 1) {
    const key = shiftMonthKey(currentKey, offset);
    const summary = summarizeFacts(facts, key);
    const isPast = offset < 0;
    const recorded = key >= since;
    months.push({
      key,
      label: monthLabelOfKey(key, currentYear),
      isPast,
      isCurrent: offset === 0,
      recorded,
      // 기록 이전 달은 확정을 모른다 — 0이 아니라 null(그리지 않음).
      confirmed: recorded ? summary.confirmed : null,
      // 지난 달의 미입금은 "남은 예상"이 아니라 늦은 것 — 표가 행으로 말하고 막대에는 쌓지 않는다.
      remainingExpected: isPast ? 0 : summary.remainingExpected,
      planned: summary.planned,
      delta: isPast && recorded ? summary.confirmed - summary.planned : null,
    });
  }
  const max = months.reduce((top, m) => Math.max(top, (m.confirmed || 0) + m.remainingExpected, m.planned), 0);
  return { months, max };
}

export function buildPlanSeries(deals, { now = new Date() } = {}) {
  const today = kstDayNumber(now) ?? kstDayNumber(Date.now());
  const currentKey = monthKeyOfDay(today);
  const since = recordsStartKey(deals);
  const facts = collectPaymentFacts(deals, { now, recordsSince: since });
  return { currentKey, ...seriesFromFacts(facts, { currentKey, currentYear: dayParts(today).y, since }) };
}

// ── 딜별 결제 표 ─────────────────────────────────────────────────────────────

function installmentText(label, index, total) {
  if (total > 1) return label ? `${index}회 ${label}` : `${index}회`;
  return label || "전액";
}

function rowFromFact(fact, monthKey) {
  const { payment } = fact;
  const paid = fact.state === "paid";
  const movedDate = fact.plannedDay !== fact.expectedDay;
  return {
    key: fact.key,
    dealId: fact.dealId,
    deal: fact.deal,
    org: fact.org,
    paymentId: fact.paymentId,
    installment: { index: fact.index, total: fact.total, label: payment.label, text: installmentText(payment.label, fact.index, fact.total) },
    planned: { amount: payment.plannedAmount, at: payment.plannedAt, dayLabel: shortDay(fact.plannedDay) },
    expected: {
      amount: payment.expectedAmount,
      at: payment.expectedAt,
      dayLabel: shortDay(fact.expectedDay),
      // "원래 9/15 → 10/2" — 처음 계획한 날짜와 지금 예상일이 다를 때만.
      moved: movedDate,
      movedLabel: movedDate ? `원래 ${shortDay(fact.plannedDay) || "미정"} → ${shortDay(fact.expectedDay) || "미정"}` : null,
      amountChanged: payment.plannedAmount !== payment.expectedAmount,
    },
    state: fact.state,
    daysLate: fact.daysLate,
    paid: paid ? { amount: payment.paidAmount, at: payment.paidAt, dayLabel: shortDay(fact.paidDay) } : null,
    // 차이 = 입금액 − 지금 예상 금액. 이유 한 줄(paidNote)은 차이가 있을 때만 저장돼 있다.
    difference: paid ? payment.paidAmount - payment.expectedAmount : null,
    paidNote: paid ? payment.paidNote || null : null,
    // 입금이 예상일보다 며칠 빠르거나 늦었나(+ 늦음). 날짜 둘 중 하나라도 없으면 null.
    timing: paid && fact.paidDay != null && fact.expectedDay != null ? fact.paidDay - fact.expectedDay : null,
    // 이 달 안에서의 자리 — 이 달에 입금됐으면 입금일, 아니면 이 달의 예상일, 아니면 이 달의 계획일.
    sortDay: (fact.paidKey === monthKey ? fact.paidDay : null)
      ?? (fact.expectedKey === monthKey ? fact.expectedDay : null)
      ?? (fact.plannedKey === monthKey ? fact.plannedDay : null)
      ?? Number.POSITIVE_INFINITY,
  };
}

// 이 달에 계획했거나, 지금 예상하거나, 입금된 결제(취소 제외) — 이 달 안의 날짜 순, 같은 날은 거래·회차 순.
function rowsFromFacts(facts, monthKey) {
  return facts
    .filter((f) => f.plannedKey === monthKey || f.expectedKey === monthKey || f.paidKey === monthKey)
    .map((f) => rowFromFact(f, monthKey))
    .sort((a, b) => (a.sortDay - b.sortDay) || a.org.localeCompare(b.org, "ko") || (a.installment.index - b.installment.index));
}

export function paymentRowsForMonth(deals, monthKey, { now = new Date() } = {}) {
  return rowsFromFacts(collectPaymentFacts(deals, { now }), monthKey);
}

// ── 결제 보기 모델 ──────────────────────────────────────────────────────────

// 한 번에 모은다 — 월별 막대 · 선택한 달의 표 · 그 달 합계 · 이번 달 합계(히어로).
// monthKey가 없거나 막대 범위 밖이면 이번 달.
export function buildPaymentsBoard(deals, { now = new Date(), monthKey = null } = {}) {
  const today = kstDayNumber(now) ?? kstDayNumber(Date.now());
  const currentKey = monthKeyOfDay(today);
  const currentYear = dayParts(today).y;
  const since = recordsStartKey(deals);
  const facts = collectPaymentFacts(deals, { now, recordsSince: since });
  const minKey = shiftMonthKey(currentKey, -PLAN_SERIES_BACK);
  const maxKey = shiftMonthKey(currentKey, PLAN_SERIES_AHEAD);
  const key = isMonthKey(monthKey) && monthKey >= minKey && monthKey <= maxKey ? monthKey : currentKey;
  const rows = rowsFromFacts(facts, key);
  const overdueRows = rows.filter((row) => row.state === "overdue");
  const series = seriesFromFacts(facts, { currentKey, currentYear, since });
  return {
    currentKey,
    monthKey: key,
    monthLabel: monthLabelOfKey(key, currentYear),
    isCurrentMonth: key === currentKey,
    recordsSince: since,
    recorded: key >= since,
    prevKey: key > minKey ? shiftMonthKey(key, -1) : null,
    nextKey: key < maxKey ? shiftMonthKey(key, 1) : null,
    series: series.months,
    max: series.max,
    summary: summarizeFacts(facts, key),
    current: summarizeFacts(facts, currentKey),
    rows,
    overdueCount: overdueRows.length,
    // §5.3 red budget — 화면 순서대로 앞의 MAX_DANGER_RAILS건만 1px 레일, 넘치면 머리에 합계.
    railKeys: new Set(overdueRows.slice(0, MAX_DANGER_RAILS).map((row) => row.key)),
    hasAny: facts.length > 0,
  };
}
