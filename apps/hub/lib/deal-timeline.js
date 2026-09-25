// 거래 탭의 날짜·표시 도우미 — KST 달력, 금액 라벨, 확실성, 다음 약속, 하단 독 항목.
//
// 2026-09-24 "언제" 보기(예상일 칸)로 시작한 파일이다. 운영자 2026-09-26 결정으로 거래 탭의 보기는
// 돈(lib/deal-money.js — 매출·현금흐름) · 단계(칸반) 둘만 남았고, 칸·멈춘 거래 줄·확실성 리본은
// 화면과 함께 빠졌다. 여기엔 두 보기와 하단 독이 같이 읽는 판정만 남는다.
//
// 정직성 규칙:
// - 확실성은 personal-revenue-roadmap.js의 CERTAINTY_BY_STAGE 하나를 쓴다(§15 2026-09-15).
// - 날짜는 운영자 달력(Asia/Seoul) 기준이다. 서버·브라우저 시간대와 무관하게 같은 칸에 떨어진다.

import { DEAL_STAGES, isDealStalled } from "./deal-stages.js";
import { CERTAINTY_BY_STAGE, LIFECYCLE_BY_STAGE } from "./personal-revenue-roadmap.js";
import { effectivePayments } from "./deal-payments.js";

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
// 저장 시각은 KST 정오(03:00Z) — 어느 시간대에서 다시 읽어도 같은 날짜로 떨어진다.
const KST_NOON_UTC_MS = 3 * 3_600_000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// danger 레일 예산(§5.3 red budget) — 고객 연락 큐의 MAX_DANGER_RAILS와 같은 값.
export const MAX_DANGER_RAILS = 3;

// 거래 탭의 보기 — 운영자 2026-09-26: 돈(매출·현금흐름, 기본) · 단계(칸반) 둘뿐이다.
// 언제(예상일 칸)·결제(월별 막대·표)·지역(히트맵 — dashboard/revenue/heatmap과 ⌘K로 계속 열린다)은
// 전환에서 빠졌다. 옛 링크(`?view=time|payments|region`)는 돈으로 떨어진다.
export const DEAL_VIEW_OPTIONS = [
  { key: "money", label: "돈" },
  { key: "stage", label: "단계" },
];

export const DEFAULT_DEAL_VIEW = "money";

// `?view=` 값 → 보기 키. 모르는 값·빈 값·옛 보기는 기본 보기(돈)로 떨어진다.
export function resolveDealView(raw) {
  const key = String(raw || "").toLowerCase();
  return DEAL_VIEW_OPTIONS.some((option) => option.key === key) ? key : DEFAULT_DEAL_VIEW;
}

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

// 차이 금액 — "+₩300K" · "−₩200K"(U+2212) · 0은 "₩0". 예상 대비 확정의 차이를 말할 때만 쓴다.
export function formatSignedWon(value) {
  const n = Math.round(Number(value) || 0);
  if (n === 0) return "₩0";
  return `${n > 0 ? "+" : "−"}${formatWon(Math.abs(n))}`;
}

// 이번 주(월–일)·다음 주·그 뒤·이번 달의 경계. 모두 KST 일련번호.
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
// 1일로 두면 다음 주와 겹칠 수 있어 언제나 다음 주 뒤에 떨어지는 날을 고른다.
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

// ── 하단 독 항목 ─────────────────────────────────────────────────────────

function amountOf(deal) {
  const n = Number(deal?.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 딜 단위 공통 판정 — 다음 약속·단계·확실성은 결제 건수와 무관하게 딜 하나에 하나다.
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

// 돈 보기의 행을 누르면 여는 독은 결제 한 건이 아니라 딜 하나를 다룬다 — 금액은 딜 전체 예상,
// 예상일은 딜의 것(독의 "예상일 바꾸기"는 거래의 예상일을 옮긴다).
export function dealDockItem(deal, { now = new Date(), stages = DEAL_STAGES } = {}) {
  if (!deal) return null;
  const ctx = timelineContext(now);
  const stageList = Array.isArray(stages) && stages.length ? stages : DEAL_STAGES;
  const closeDay = dealCloseDay(deal);
  const payments = effectivePayments(deal);
  return {
    ...decorateDealBase(deal, ctx, stageList),
    id: deal.id,
    paymentId: null,
    explicitPayment: false,
    expectedAt: deal.closeAt || null,
    paymentLabel: null,
    installmentIndex: 1,
    installmentTotal: 1,
    amount: payments.reduce((sum, p) => sum + p.expectedAmount, 0) || amountOf(deal),
    closeDay,
    closeLabel: closeDay == null ? null : formatDayLabel(closeDay),
    closeOverdue: false,
  };
}
