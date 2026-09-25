// 거래 "돈" 보기 — 매출과 현금흐름만(운영자 승인 목업 10, 2026-09-26 "굿, 이렇게").
//
// 한 화면이 두 가지에 답한다:
//   ① 이번 달 매출이 목표에 얼마나 왔나 — 머리 카드(들어온 돈 / 목표, KPI 넷, 리본)
//   ② 돈이 언제 들어오나 — 현금흐름 차트(주 · 월)와 들어올 돈 목록
// 이 파일은 렌더를 모르는 순수 모델이다. pages/deals-money.jsx가 그리고, pages/revenue.jsx의 Deals가
// 워크스페이스·소속 필터를 거친 딜 집합을 넘긴다.
//
// 확실성은 두 칸뿐이다(§5.3 선 모양으로 구분 — 색 아님):
//   확실 — 계약된 돈: 클로징(won) 단계이거나, 같은 거래의 결제가 이미 한 번 들어온(계약이 살아 있는)
//          거래의 미입금 결제. 늦음 = 확실인데 예상일이 오늘(KST)보다 앞이고 아직 안 들어온 것.
//   가능 — 아직 계약 전 거래 중 금액과 날짜가 있는 것.
// 금액이나 날짜가 없으면(또는 가능인데 예상일이 이미 지났으면) "날짜 · 일정 없음" 묶음으로 간다 —
// 날짜를 지어내 어느 주에 꽂지 않는다.
//
// 정직성 규칙:
// - 이전 달은 그리지 않는다(운영자 2026-09-26). 차트는 이번 주·이번 달부터다. 이미 지난 확실한 돈은
//   "밀린 돈" 한 칸으로 모아 말한다.
// - 결제 기록 이전 달(deal-payment-plan.js recordsStartKey)에 예상된 성사 거래의 미입금은 늦음이 아니라
//   기록이 없는 것이다 — 목록·합계에서 뺀다(빨강을 지어내지 않는다).
// - 숨긴 거래·Lost는 들어올 돈에서 빠진다. 이미 들어온 돈(paid)은 Lost여도 실제 현금이라 들어온 돈에
//   센다. 숨긴 거래는 뺀다(deal-payment-plan recordsStartKey와 같은 규칙).
// - 매달 정기(deal-recurring.js)는 이번 달부터 3달 뒤까지만 회차를 만든다(보이는 창).

import { DEAL_STAGES } from "./deal-stages.js";
import { IMPLICIT_PAYMENT_ID, effectivePayments, normalizePayments } from "./deal-payments.js";
import { isRecurringActive, normalizeRecurring, recurringInstances, recurringMethodLabel } from "./deal-recurring.js";
import { monthKeyOfDay, monthLabelOfKey, recordsStartKey, shiftMonthKey } from "./deal-payment-plan.js";
import { MAX_DANGER_RAILS, formatDayLabel, kstDayNumber, timelineContext } from "./deal-timeline.js";

const DAY_MS = 86_400_000;

// 현금흐름 주 차트 — 이번 주 + 앞으로 9주(월요일 시작, KST).
export const MONEY_WEEKS = 10;
// 월 차트·매달 정기 회차의 창 — 이번 달 + 앞으로 3달.
export const MONEY_MONTHS_AHEAD = 3;
// 주당 정기 바닥 = 한 달 정기 ÷ (52/12 ≈ 4.33주).
export const WEEKS_PER_MONTH = 52 / 12;
// "그 뒤"·"날짜 · 일정 없음" 묶음은 앞의 몇 건만 펼쳐 두고 나머지는 "펼치기".
export const MONEY_GROUP_PREVIEW = 5;

export const MONEY_GROUPS = [
  { key: "late", label: "밀린 돈" },
  { key: "soon", label: "이번 주 · 다음 주" },
  { key: "later", label: "그 뒤" },
  { key: "undated", label: "날짜 · 일정 없음" },
];

function dayParts(day) {
  const date = new Date(day * DAY_MS);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

function shortDay(day) {
  if (day == null) return null;
  const { m, d } = dayParts(day);
  return `${m + 1}/${d}`;
}

// 차트 칸 밑의 짧은 값 — "2.4M" · "600K". 0은 호출처가 "—"로 쓴다.
export function formatShortWon(value) {
  const n = Math.round(Number(value) || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

// 계약된 거래 — 클로징이거나 결제가 한 번이라도 들어왔다.
export function isContractedDeal(deal) {
  if (!deal) return false;
  if (deal.stage === "closing") return true;
  return normalizePayments(deal.payments).some((p) => p.status === "paid");
}

export function moneyContext(now = new Date()) {
  const base = timelineContext(now);
  const currentKey = monthKeyOfDay(base.today);
  return {
    ...base,
    currentKey,
    windowEndKey: shiftMonthKey(currentKey, MONEY_MONTHS_AHEAD),
  };
}

// 실제로 [fromDay, toDay)에 들어온 돈 — 입금 기록(status='paid')의 paidAt 기준. 숨긴 거래만 뺀다.
// 입금 기록은 언제나 명시 결제다(암묵 결제·가상 정기 회차는 입금될 때 명시로 적힌다).
export function paidBetween(deals, fromDay, toDay) {
  let total = 0;
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal || deal.hidden) continue;
    for (const payment of normalizePayments(deal.payments)) {
      if (payment.status !== "paid") continue;
      const day = kstDayNumber(payment.paidAt);
      if (day == null || day < fromDay || day >= toDay) continue;
      total += payment.paidAmount;
    }
  }
  return total;
}

// 계약된 거래의 매달 정기 합 — 이번 달에 살아 있는 계획만.
export function recurringMonthlyTotal(deals, monthKey) {
  let total = 0;
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal || deal.hidden || deal.stage === "lost" || !isContractedDeal(deal)) continue;
    const rec = normalizeRecurring(deal.recurring);
    if (rec && isRecurringActive(rec, monthKey)) total += rec.amount;
  }
  return total;
}

function stageLabelOf(deal, stages) {
  return stages.find((stage) => stage.key === deal.stage)?.label || "단계 미정";
}

// 거래 하나의 아직 안 들어온 결제 — { payment, kind, index, total }.
// kind: lump(일시불 — 암묵 결제 또는 명시 1건) · installment(명시 여러 건) · recurring(매달 정기 회차).
function openPaymentsOf(deal, rec, ctx) {
  const explicit = normalizePayments(deal.payments);
  const oneOff = rec ? explicit.filter((p) => !p.recurringMonth) : effectivePayments(deal);
  const open = [];
  const unpaid = oneOff.filter((p) => p.status === "expected");
  unpaid.forEach((payment) => {
    const index = oneOff.indexOf(payment) + 1;
    open.push({ payment, kind: oneOff.length > 1 ? "installment" : "lump", index, total: oneOff.length });
  });
  if (rec) {
    for (const instance of recurringInstances(rec, explicit, { fromMonth: ctx.currentKey, toMonth: ctx.windowEndKey })) {
      if (instance.status !== "expected") continue;
      open.push({ payment: instance, kind: "recurring", index: 1, total: 1 });
    }
  }
  return open;
}

function methodOf(kind, payment, index, total, rec) {
  if (kind === "recurring") return recurringMethodLabel(rec);
  if (kind === "installment") return payment.label || `${total}회 중 ${index}회`;
  return payment.label || "일시불";
}

function rowFor({ deal, contracted, stageLabel, rec, open, ctx, since }) {
  const { payment, kind, index, total } = open;
  const amount = payment.expectedAmount;
  const day = kstDayNumber(payment.expectedAt);
  const certainty = contracted ? "sure" : "maybe";
  const row = {
    key: `${deal.id}::${payment.id}`,
    dealId: deal.id,
    deal,
    paymentId: payment.id,
    recurringMonth: payment.recurringMonth || null,
    kind,
    certainty,
    amount,
    hasAmount: amount > 0,
    day,
    dateLabel: shortDay(day),
    dayLabel: day == null ? null : formatDayLabel(day),
    stageLabel,
    method: methodOf(kind, payment, index, total, rec),
    group: "undated",
    action: null,
    daysLate: 0,
    slipped: false,
    note: null,
  };
  if (day == null) {
    // 계약됐는데 날짜가 없는 일시불(암묵 결제) = "일정 없음" — 일시불/매달 빠른 입력. 나머지는 독에서.
    row.action = contracted && payment.id === IMPLICIT_PAYMENT_ID ? "schedule" : "dates";
    row.note = contracted ? "계약 · 일정 없음" : `${stageLabel} · 날짜 없음`;
    return row;
  }
  if (day < ctx.today) {
    // 계약 전 거래의 지난 정기 회차는 받을 돈도, 다시 잡을 날짜도 아니다 — 그냥 지나간 달이다.
    if (kind === "recurring" && !contracted) return null;
    if (contracted) {
      if (monthKeyOfDay(day) < since) return null; // 결제 기록 이전 — 늦음을 지어내지 않는다
      row.group = "late";
      row.action = "confirm";
      row.daysLate = ctx.today - day;
      return row;
    }
    // 계약 전 거래의 예상일이 지났다 — 파이프라인이 밀린 것(중립). 날짜를 다시 잡을 때까지 일정 없음.
    row.slipped = true;
    row.action = "redate";
    row.note = `${stageLabel} · ${shortDay(day)} 지남`;
    return row;
  }
  if (day < ctx.laterStart) {
    row.group = "soon";
    row.action = contracted ? "confirm" : "dates";
    return row;
  }
  row.group = "later";
  return row;
}

// 금액도 결제도 없는 거래 — 계약됐으면 "일정 없음"(빠른 입력), 아니면 "금액 없음"(독).
function emptyRowFor({ deal, contracted, stageLabel, ctx, since }) {
  if (contracted) {
    // 오래전에 끝난 성사 거래(기록 이전 예상일)는 끝난 것으로 본다.
    const closeDay = kstDayNumber(deal.closeAt);
    if (closeDay != null && monthKeyOfDay(closeDay) < since) return null;
  }
  return {
    key: `${deal.id}::none`,
    dealId: deal.id,
    deal,
    paymentId: null,
    recurringMonth: null,
    kind: "none",
    certainty: contracted ? "sure" : "maybe",
    amount: 0,
    hasAmount: false,
    day: null,
    dateLabel: null,
    dayLabel: null,
    stageLabel,
    method: null,
    group: "undated",
    action: contracted ? "schedule" : "dates",
    daysLate: 0,
    slipped: false,
    note: contracted ? "계약 · 일정 없음" : `${stageLabel} · 금액 없음`,
  };
}

const byDay = (a, b) => (a.day - b.day) || (a.certainty === b.certainty ? 0 : a.certainty === "sure" ? -1 : 1) || (b.amount - a.amount);
const undatedOrder = (a, b) => (a.certainty === b.certainty ? 0 : a.certainty === "sure" ? -1 : 1)
  || (Number(b.hasAmount) - Number(a.hasAmount)) || (b.amount - a.amount);

function sums(rows) {
  let sure = 0;
  let maybe = 0;
  for (const row of rows) {
    if (row.certainty === "sure") sure += row.amount;
    else maybe += row.amount;
  }
  return { sure, maybe };
}

export function buildMoneyModel(deals, { now = new Date(), stages = DEAL_STAGES, target = null } = {}) {
  const ctx = moneyContext(now);
  const stageList = Array.isArray(stages) && stages.length ? stages : DEAL_STAGES;
  const list = Array.isArray(deals) ? deals : [];
  const since = recordsStartKey(list);

  const rows = [];
  for (const deal of list) {
    if (!deal || deal.hidden || deal.stage === "lost") continue;
    const contracted = isContractedDeal(deal);
    const rec = normalizeRecurring(deal.recurring);
    const stageLabel = stageLabelOf(deal, stageList);
    const open = openPaymentsOf(deal, rec, ctx);
    if (open.length === 0) {
      // 결제가 전혀 없는(금액도 정기도 없는) 거래만 — 전부 들어온 거래는 끝난 거래다.
      if (!rec && effectivePayments(deal).length === 0) {
        const row = emptyRowFor({ deal, contracted, stageLabel, ctx, since });
        if (row) rows.push(row);
      }
      continue;
    }
    for (const item of open) {
      const row = rowFor({ deal, contracted, stageLabel, rec, open: item, ctx, since });
      if (row) rows.push(row);
    }
  }

  const grouped = new Map(MONEY_GROUPS.map((g) => [g.key, []]));
  for (const row of rows) grouped.get(row.group).push(row);
  grouped.get("late").sort(byDay);
  grouped.get("soon").sort(byDay);
  grouped.get("later").sort(byDay);
  grouped.get("undated").sort(undatedOrder);

  const groups = MONEY_GROUPS.map((g) => {
    const items = grouped.get(g.key);
    return { ...g, items, ...sums(items), preview: g.key === "later" || g.key === "undated" ? MONEY_GROUP_PREVIEW : null };
  });
  const ordered = groups.flatMap((g) => g.items);

  // ── 이번 달 ─────────────────────────────────────────────────────────────
  const inMonth = (row) => row.day != null && row.day >= ctx.today && row.day < ctx.nextMonthStart;
  const dated = rows.filter((row) => row.group === "soon" || row.group === "later");
  const paid = paidBetween(list, ctx.monthStart, ctx.nextMonthStart);
  const late = sums(grouped.get("late")).sure;
  const sureRest = dated.filter((row) => row.certainty === "sure" && inMonth(row)).reduce((s, r) => s + r.amount, 0);
  const maybeMonth = dated.filter((row) => row.certainty === "maybe" && inMonth(row)).reduce((s, r) => s + r.amount, 0);
  const monthEndSure = paid + late + sureRest;
  const withMaybe = monthEndSure + maybeMonth;
  const recurringMonthly = recurringMonthlyTotal(list, ctx.currentKey);
  const targetAmount = Number.isFinite(Number(target)) && Number(target) > 0 ? Math.round(Number(target)) : null;

  // 리본 — 들어옴 · 계약·늦음 · 확실 예정 · 가능. 목표가 합보다 크면 남는 칸(gap)을 두고 목표 눈금을 그 끝에.
  const ribbonTotal = withMaybe;
  const scale = Math.max(ribbonTotal, targetAmount || 0);
  const ribbon = {
    segments: [
      { key: "paid", label: "들어옴", amount: paid },
      { key: "late", label: "계약 · 늦음", amount: late },
      { key: "sure", label: "확실 예정", amount: sureRest },
      { key: "maybe", label: "가능", amount: maybeMonth },
    ],
    total: ribbonTotal,
    gap: Math.max(0, scale - ribbonTotal),
    scale,
    targetPct: targetAmount && scale > 0 ? Math.min(100, (targetAmount / scale) * 100) : null,
  };

  // ── 현금흐름 · 주 ──────────────────────────────────────────────────────
  const weeklyFloor = recurringMonthly > 0 ? recurringMonthly / WEEKS_PER_MONTH : 0;
  const weeks = [{ key: "late", label: "밀린 돈", carry: true, current: false, paid: 0, late, sure: 0, maybe: 0 }];
  for (let i = 0; i < MONEY_WEEKS; i += 1) {
    const start = ctx.thisWeekStart + i * 7;
    const end = start + 7;
    const inWeek = dated.filter((row) => row.day >= start && row.day < end);
    const s = sums(inWeek);
    weeks.push({
      key: `w${start}`,
      label: i === 0 ? "이번 주" : shortDay(start),
      rangeLabel: `${shortDay(start)}–${shortDay(end - 1)}`,
      carry: false,
      current: i === 0,
      paid: i === 0 ? paidBetween(list, start, end) : 0,
      late: 0,
      sure: s.sure,
      maybe: s.maybe,
    });
  }
  const colTotal = (col) => col.paid + col.late + col.sure + col.maybe;
  const weekMax = Math.max(0, weeklyFloor, ...weeks.map(colTotal));

  // ── 현금흐름 · 월 ──────────────────────────────────────────────────────
  const months = [];
  for (let offset = 0; offset <= MONEY_MONTHS_AHEAD; offset += 1) {
    const key = shiftMonthKey(ctx.currentKey, offset);
    const inKey = dated.filter((row) => monthKeyOfDay(row.day) === key);
    const s = sums(inKey);
    months.push({
      key,
      label: monthLabelOfKey(key, ctx.year),
      current: offset === 0,
      paid: offset === 0 ? paid : 0,
      late: offset === 0 ? late : 0,
      sure: s.sure,
      maybe: s.maybe,
      target: offset === 0 ? targetAmount : null,
    });
  }
  const monthMax = Math.max(0, targetAmount || 0, ...months.map(colTotal));

  const lateRows = grouped.get("late");
  return {
    ctx,
    monthLabel: ctx.monthLabel,
    recordsSince: since,
    rows,
    ordered,
    groups,
    // j/k 선택 순서 — 목록에 보이는 거래 순서(같은 거래의 여러 회차는 한 번).
    dealOrder: [...new Set(ordered.map((row) => row.dealId))],
    header: { paid, late, sureRest, maybeMonth, monthEndSure, withMaybe, recurringMonthly, target: targetAmount },
    ribbon,
    weeks,
    weekMax,
    weeklyFloor,
    months,
    monthMax,
    lateCount: lateRows.length,
    // §5.3 red budget — 화면 순서대로 앞의 MAX_DANGER_RAILS건만 1px 레일, 나머지는 직접 라벨.
    railKeys: new Set(lateRows.slice(0, MAX_DANGER_RAILS).map((row) => row.key)),
    hasAny: rows.length > 0 || paid > 0,
  };
}
