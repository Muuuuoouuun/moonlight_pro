// 거래 "언제" 보기 — 딜을 단계가 아니라 예상일(시간) 위에 놓는 순수 로직.
// 운영자 승인 목업(2026-09-24 영업·매출 재설계, 목업 3 · 거래): 칸반 열 = 단계였던 것을
// 열 = 시간으로 바꾸고, 단계는 카드 안의 막대로 줄인다. 카드를 다른 열로 옮기면 예상일
// (`deals.expected_close_at`, 화면 모델 `closeAt`)이 바뀐다 — 파이프라인 관리가 곧 현금 흐름 관리.
//
// 이 파일은 렌더를 모른다. pages/deals-timeline.jsx가 그리고, pages/revenue.jsx의 Deals가
// 제목 문장·키보드 선택 순서를 위해 같은 결과를 읽는다.
//
// 정직성 규칙:
// - 확실성은 personal-revenue-roadmap.js의 CERTAINTY_BY_STAGE 하나를 쓴다(§15 2026-09-15).
//   클로징(won) = 확정 + 라이프사이클 "입금 대기", 상담·견적·최종미팅 = 가능성 높음,
//   컨택·잠재 리드 = 확인 필요.
// - 날짜는 운영자 달력(Asia/Seoul) 기준이다. 서버·브라우저 시간대와 무관하게 같은 칸에 떨어진다.
//
// 결제(2026-09-24 라운드 2, deal-payments.js): 딜에 명시 결제 일정이 없으면 amount·closeAt이
// "암묵적 결제 1건"으로 그대로 레인에 선다 — 이하 전부 라운드 1과 동일하게 동작한다. 명시
// 일정이 있으면 레인은 "결제 카드"(미입금 항목마다 하나) 위에 서고, 딜 하나가 여러 레인에
// 걸칠 수 있다("2회 중 1회"). 완결(전 항목 결제·취소, §deal-payments.isDealFullyPaid)된 딜은
// 레인에서 빠진다. "멈춘 거래"·다음 약속은 딜 단위 그대로다(결제 건수와 무관).

import { DEAL_STAGES, isDealStalled } from "./deal-stages.js";
import { CERTAINTY_BY_STAGE, LIFECYCLE_BY_STAGE } from "./personal-revenue-roadmap.js";
import {
  IMPLICIT_PAYMENT_ID,
  effectivePayments,
  hasPaymentSchedule,
  isDealFullyPaid,
  unpaidPayments,
} from "./deal-payments.js";

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
// 저장 시각은 KST 정오(03:00Z) — 어느 시간대에서 다시 읽어도 같은 날짜로 떨어진다.
const KST_NOON_UTC_MS = 3 * 3_600_000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 칸반 카드의 danger 레일 예산(§5.3 red budget) — 고객 연락 큐의 MAX_DANGER_RAILS와 같은 값.
export const MAX_DANGER_RAILS = 3;

export const DEAL_VIEW_OPTIONS = [
  { key: "time", label: "언제" },
  { key: "stage", label: "단계" },
  { key: "region", label: "지역" },
];

// `?view=` 값 → 보기 키. 모르는 값·빈 값은 기본 보기(언제)로 떨어진다.
export function resolveDealView(raw) {
  const key = String(raw || "").toLowerCase();
  return DEAL_VIEW_OPTIONS.some((option) => option.key === key) ? key : "time";
}

export const TIMELINE_LANES = [
  { key: "this-week", title: "이번 주" },
  { key: "next-week", title: "다음 주" },
  { key: "later", title: "나중에" },
  { key: "undated", title: "날짜 미정" },
];

// ── KST 달력 ────────────────────────────────────────────────────────────────

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (!value) return NaN;
  return Date.parse(String(value));
}

// KST 달력 날짜의 일련번호(1970-01-01 = 0). 유효하지 않으면 null.
export function kstDayNumber(value) {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

function dayParts(dayNumber) {
  const date = new Date(dayNumber * DAY_MS);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), dow: date.getUTCDay() };
}

function dayNumberOf(y, m, d) {
  return Math.floor(Date.UTC(y, m, d) / DAY_MS);
}

export function dayNumberToIso(dayNumber) {
  return new Date(dayNumber * DAY_MS + KST_NOON_UTC_MS).toISOString();
}

function shortDate(dayNumber) {
  const { m, d } = dayParts(dayNumber);
  return `${m + 1}/${d}`;
}

export function formatDayLabel(dayNumber) {
  if (dayNumber == null) return "";
  return `${shortDate(dayNumber)} ${WEEKDAYS[dayParts(dayNumber).dow]}`;
}

function monthLabelOf(dayNumber, currentYear) {
  const { y, m } = dayParts(dayNumber);
  return y === currentYear ? `${m + 1}월` : `${y}년 ${m + 1}월`;
}

// 칸반 카드 발치의 예상일 라벨 — revenue-ledger.js의 formatShortDate와 같은 모양("9. 25.").
export function formatCloseLabel(value) {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "미정";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(ms));
}

// revenue.jsx `fmt`과 같은 K/M 임계값 — 100만원 미만 건을 ₩0.1M로 쓰지 않는다.
export function formatWon(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "₩0";
  if (n >= 1000000) return `₩${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₩${Math.round(n / 1000)}K`;
  return `₩${n}`;
}

// 이번 주(월–일)·다음 주·그 뒤의 경계. 모두 KST 일련번호.
export function timelineContext(now = new Date()) {
  const today = kstDayNumber(now) ?? kstDayNumber(Date.now());
  const { y, m, dow } = dayParts(today);
  const thisWeekStart = today - ((dow + 6) % 7);
  const nextWeekStart = thisWeekStart + 7;
  const laterStart = nextWeekStart + 7;
  return {
    today,
    year: y,
    month: m,
    thisWeekStart,
    nextWeekStart,
    laterStart,
    monthStart: dayNumberOf(y, m, 1),
    nextMonthStart: dayNumberOf(y, m + 1, 1),
    monthLabel: `${m + 1}월`,
  };
}

// ── 딜 판정 ────────────────────────────────────────────────────────────────

export function dealCloseDay(deal) {
  return kstDayNumber(deal?.closeAt);
}

export function certaintyOfDeal(deal) {
  return CERTAINTY_BY_STAGE[deal?.stage] || CERTAINTY_BY_STAGE.potential;
}

export function lifecycleOfDeal(deal) {
  return LIFECYCLE_BY_STAGE[deal?.stage] || null;
}

// 언제 보기에 올라오는 딜. Lost·숨김은 빠진다. 클로징(won)은 금액이 확정됐고 현금만 남은
// 상태라, 예상일이 이번 달 이후인 건만 "입금 대기"로 보인다 — 명시 결제 일정이 없으면
// 지난달 이전이거나 날짜 없는 클로징은 끝난 거래로 본다(단계 보기에는 그대로 있다). 명시
// 결제 일정이 완결(전부 결제·취소)됐으면 단계·날짜와 무관하게 레인에서 빠진다.
export function isTimelineDeal(deal, ctx) {
  if (!deal || deal.hidden || deal.stage === "lost") return false;
  if (isDealFullyPaid(deal)) return false;
  if (deal.stage === "closing" && !hasPaymentSchedule(deal)) {
    const day = dealCloseDay(deal);
    return day != null && day >= ctx.monthStart;
  }
  return true;
}

function laneKeyForDay(day, ctx) {
  if (day == null) return "undated";
  if (day < ctx.nextWeekStart) return "this-week"; // 지난 예상일도 지금 처리할 일이라 이번 주
  if (day < ctx.laterStart) return "next-week";
  return "later";
}

export function dealLaneKey(deal, ctx) {
  return laneKeyForDay(dealCloseDay(deal), ctx);
}

// 다음 약속 — 기록의 next_action(+ next_action_at)이 먼저, 없으면 캘린더에 잡아둔 다음 미팅.
export function dealPromise(deal, ctx) {
  const action = typeof deal?.nextAction === "string" ? deal.nextAction.trim() : "";
  const meeting = deal?.nextMeeting && typeof deal.nextMeeting === "object" ? deal.nextMeeting : null;
  let text = "";
  let at = null;
  if (action) {
    text = action;
    at = deal.nextActionAt || null;
  } else if (meeting?.summary) {
    text = `미팅 · ${meeting.summary}`;
    at = meeting.startAt || null;
  }
  if (!text) return null;
  const day = kstDayNumber(at);
  if (day == null) return { text, overdue: false, dueLabel: null, overdueDays: 0 };
  const diff = day - ctx.today;
  if (diff < 0) return { text, overdue: true, dueLabel: `${-diff}일 지남`, overdueDays: -diff };
  const dueLabel = diff === 0 ? "오늘" : diff === 1 ? "내일" : formatDayLabel(day);
  return { text, overdue: false, dueLabel, overdueDays: 0 };
}

// 고객 DB 딥링크 키(customers.jsx `?customer=<kind>:<id>`). 기록에서 풀리지 않으면 null —
// 화면은 "고객 열기"를 숨긴다(링크가 "찾을 수 없음"으로 끝나지 않게).
export function dealCustomerKey(deal, { leads = [], accounts = [] } = {}) {
  if (!deal) return null;
  if (deal.leadId && leads.some((lead) => lead.id === deal.leadId)) return `lead:${deal.leadId}`;
  if (deal.companyId) {
    const lead = leads.find((item) => item.companyId === deal.companyId && item.id);
    if (lead) return `lead:${lead.id}`;
    const account = accounts.find((item) => item.companyId === deal.companyId && item.id);
    if (account) return `account:${account.id}`;
  }
  return null;
}

// ── 예상일 바꾸기 ─────────────────────────────────────────────────────────

function preset(key, label, day) {
  return { key, label, day, iso: day == null ? "" : dayNumberToIso(day), dateLabel: day == null ? "날짜 미정" : formatDayLabel(day) };
}

// 독의 "예상일 바꾸기" 프리셋. 이번 주 금요일이 이미 지났으면 오늘. "다음 달"은 15일 —
// 1일로 두면 다음 주 칸과 겹칠 수 있어 언제나 "나중에" 칸에 떨어지는 날을 고른다.
export function closeDatePresets(now = new Date()) {
  const ctx = timelineContext(now);
  const thisFriday = Math.max(ctx.today, ctx.thisWeekStart + 4);
  const nextFriday = ctx.nextWeekStart + 4;
  const nextMonthMid = dayNumberOf(ctx.year, ctx.month + 1, 15);
  return [
    preset("this-week", "이번 주 금", thisFriday),
    preset("next-week", "다음 주", nextFriday),
    preset("next-month", "다음 달", nextMonthMid),
    preset("none", "미정", null),
  ];
}

// 칸에 끌어 놓았을 때 새 예상일. 같은 칸 안의 이동은 날짜를 바꾸지 않는다(호출처가 판단).
export function laneDropDate(laneKey, now = new Date()) {
  const ctx = timelineContext(now);
  const presets = closeDatePresets(now);
  if (laneKey === "this-week") return presets[0];
  if (laneKey === "next-week") return presets[1];
  if (laneKey === "later") {
    const { y, m } = dayParts(ctx.laterStart);
    return preset("later", "나중에", Math.max(ctx.laterStart, dayNumberOf(y, m, 15)));
  }
  return presets[3];
}

// "YYYY-MM-DD"(date 입력) → 저장용 ISO(KST 정오). 형식이 틀리면 null.
export function isoFromDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  return dayNumberToIso(dayNumberOf(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function dateInputValue(value) {
  const day = kstDayNumber(value);
  if (day == null) return "";
  const { y, m, d } = dayParts(day);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function sameCloseDay(left, right) {
  return kstDayNumber(left) === kstDayNumber(right);
}

// ── 보기 모델 ────────────────────────────────────────────────────────────

function amountOf(deal) {
  const n = Number(deal?.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 카드 자리를 만들 미입금 결제 목록. 명시 결제 일정이 있으면 그대로(unpaidPayments) —
// 완결은 isTimelineDeal이 이미 걸렀으므로 여기선 항상 ≥1건. 명시 일정이 없으면 금액이
// 0/미정이어도 카드 한 자리는 유지한다 — deal-payments.effectivePayments는 결제 기록으로
// 의미 없는 0원 항목을 버리지만(§deal-payments.js), 타임라인 카드는 "아직 금액을 모르는
// 딜"도 자리를 차지해야 라운드 1의 "₩ ?" 표시(0원을 사실처럼 감추지 않음)가 유지된다.
function timelineUnpaidPayments(deal) {
  if (hasPaymentSchedule(deal)) return unpaidPayments(deal);
  return [{
    id: IMPLICIT_PAYMENT_ID,
    label: null,
    expectedAmount: amountOf(deal),
    expectedAt: deal?.closeAt || null,
    paidAmount: 0,
    paidAt: null,
    status: "expected",
  }];
}

// 딜 단위 공통 판정 — 멈춘 거래·다음 약속·단계·확실성은 결제 건수와 무관하게 딜 하나에 하나다.
function decorateDealBase(deal, ctx, stages) {
  const stageIndex = Math.max(0, stages.findIndex((stage) => stage.key === deal.stage));
  return {
    deal,
    certainty: certaintyOfDeal(deal),
    lifecycle: lifecycleOfDeal(deal),
    stageIndex,
    stageLabel: stages[stageIndex]?.label || "단계 미정",
    promise: dealPromise(deal, ctx),
    stalled: isDealStalled(deal),
  };
}

// 레인에 서는 카드 하나는 미입금 예상 결제 한 건이다 — buildDealTimeline이 딜마다
// unpaidPayments()를 순회해 직접 조립한다(id 규칙은 그 주석 참고).

const byDateThenAmount = (a, b) => (a.closeDay - b.closeDay) || (b.amount - a.amount);
const byAmountThenAge = (a, b) => (b.amount - a.amount) || ((Number(b.deal.age) || 0) - (Number(a.deal.age) || 0));

// 이번 달 확실성 리본 — 예상일이 이번 달(KST)인 결제만 센다. paymentItems는 buildDealTimeline이
// 넘기는 미입금 카드 목록(라운드 2부터 딜이 아니라 결제 단위). paid(입금됨)는 별도로 전부의
// 딜(레인에서 빠진 완결 포함)에서 "이 달에 실제로 들어온" 금액을 센다.
export function summarizeDealMonth(paymentItems, ctx, { paidThisMonth = 0 } = {}) {
  const segments = {
    confirmed: { key: "confirmed", label: CERTAINTY_BY_STAGE.closing.label, amount: 0, count: 0 },
    recommended: { key: "recommended", label: CERTAINTY_BY_STAGE.final.label, amount: 0, count: 0 },
    unknown: { key: "unknown", label: CERTAINTY_BY_STAGE.potential.label, amount: 0, count: 0 },
  };
  let count = 0;
  for (const item of paymentItems) {
    if (item.closeDay == null || item.closeDay < ctx.monthStart || item.closeDay >= ctx.nextMonthStart) continue;
    const segment = segments[item.certainty.key] || segments.unknown;
    segment.amount += item.amount;
    segment.count += 1;
    count += 1;
  }
  const confirmed = segments.confirmed.amount;
  const paid = Math.max(0, Math.round(Number(paidThisMonth) || 0));
  return {
    monthLabel: ctx.monthLabel,
    count,
    paid,
    confirmed,
    upside: confirmed + segments.recommended.amount,
    total: confirmed + segments.recommended.amount + segments.unknown.amount,
    segments: [
      { key: "paid", label: "입금됨", amount: paid, count: paid > 0 ? 1 : 0 },
      segments.confirmed,
      segments.recommended,
      segments.unknown,
    ],
  };
}

// 실제로 이 달에 들어온 돈 — 결제 완료(status='paid') 항목의 paidAt이 이 달인 것만 센다.
// 레인에서 빠진(완결) 딜의 지불도 포함한다: 입금 사실은 카드 자리와 무관하게 실제 현금이다.
// hidden(정리) 딜은 뺀다. Lost는 실무상 입금이 없을 상태지만, 만에 하나 기록됐다면 실제
// 현금이므로 굳이 걸러 사실을 숨기지 않는다.
export function paidThisMonth(deals, ctx) {
  let total = 0;
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal || deal.hidden) continue;
    for (const payment of effectivePayments(deal)) {
      if (payment.status !== "paid") continue;
      const day = kstDayNumber(payment.paidAt);
      if (day == null || day < ctx.monthStart || day >= ctx.nextMonthStart) continue;
      total += payment.paidAmount;
    }
  }
  return total;
}

export function buildDealTimeline(deals, { now = new Date(), stages = DEAL_STAGES } = {}) {
  const ctx = timelineContext(now);
  const stageList = Array.isArray(stages) && stages.length ? stages : DEAL_STAGES;
  const dealList = Array.isArray(deals) ? deals : [];
  const qualifying = dealList.filter((deal) => isTimelineDeal(deal, ctx));

  // 결제 카드 — 딜마다 미입금 예상 결제만큼(보통 1건) 카드를 만든다. 명시 일정이 있고
  // 미입금이 0건이면(완결) isTimelineDeal이 이미 걸렀으므로 여기선 항상 ≥1건.
  const paymentItems = [];
  for (const deal of qualifying) {
    const base = decorateDealBase(deal, ctx, stageList);
    const payments = timelineUnpaidPayments(deal);
    payments.forEach((payment, i) => {
      const closeDay = kstDayNumber(payment.expectedAt);
      paymentItems.push({
        ...base,
        id: payments.length > 1 ? `${deal.id}::${payment.id}` : deal.id,
        paymentId: payment.id,
        paymentLabel: payment.label,
        installmentIndex: i + 1,
        installmentTotal: payments.length,
        amount: payment.expectedAmount,
        lane: laneKeyForDay(closeDay, ctx),
        closeDay,
        closeLabel: closeDay == null ? null : formatDayLabel(closeDay),
        closeOverdue: closeDay != null && closeDay < ctx.thisWeekStart,
      });
    });
  }

  const lanes = TIMELINE_LANES.map((lane) => {
    const laneItems = paymentItems.filter((item) => item.lane === lane.key)
      .sort(lane.key === "undated" ? byAmountThenAge : byDateThenAmount);
    let rangeLabel = "언제일지 모름";
    if (lane.key === "this-week") rangeLabel = `${shortDate(ctx.thisWeekStart)}–${shortDate(ctx.nextWeekStart - 1)}`;
    if (lane.key === "next-week") rangeLabel = `${shortDate(ctx.nextWeekStart)}–${shortDate(ctx.laterStart - 1)}`;
    if (lane.key === "later") rangeLabel = `${shortDate(ctx.laterStart)}부터`;
    const groups = [];
    if (lane.key === "later") {
      for (const item of laneItems) {
        const label = monthLabelOf(item.closeDay, ctx.year);
        let group = groups[groups.length - 1];
        if (!group || group.label !== label) {
          group = { key: label, label, total: 0, items: [] };
          groups.push(group);
        }
        group.items.push(item);
        group.total += item.amount;
      }
    }
    return {
      ...lane,
      current: lane.key === "this-week",
      rangeLabel,
      total: laneItems.reduce((sum, item) => sum + item.amount, 0),
      items: laneItems,
      groups,
    };
  });

  const ordered = lanes.flatMap((lane) => lane.items);
  // 레일 예산 — 화면 순서대로 앞의 MAX_DANGER_RAILS건만 1px danger 레일, 나머지는 직접 라벨.
  const overdue = ordered.filter((item) => item.promise?.overdue);
  const railIds = new Set(overdue.slice(0, MAX_DANGER_RAILS).map((item) => item.id));
  // 멈춘 거래는 딜 단위 그대로(카드가 아니라) — 결제를 2건으로 나눠도 같은 딜이 두 번 뜨지 않는다.
  const stalled = qualifying
    .filter((deal) => isDealStalled(deal))
    .map((deal) => ({ id: deal.id, ...decorateDealBase(deal, ctx, stageList) }))
    .sort((a, b) => (Number(b.deal.age) || 0) - (Number(a.deal.age) || 0));

  return {
    ctx,
    stages: stageList, // 카드·독의 단계 막대는 판정에 쓴 것과 같은 목록을 그린다
    month: summarizeDealMonth(paymentItems, ctx, { paidThisMonth: paidThisMonth(dealList, ctx) }),
    lanes,
    ordered,
    count: new Set(paymentItems.map((item) => item.deal.id)).size,
    overdueCount: overdue.length,
    railIds,
    stalled,
  };
}
