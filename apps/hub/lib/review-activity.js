// 하루 리뷰의 "활동 흐름" — GitHub 기여 그래프처럼 그날 한 일의 양을 칸의 진하기로 보여 준다
// (2026-09-23 지속 루프 설계 §12). 활동 = 완료한 할 일 + 고객 연락 + 메모 + 하루 리뷰(1).
// 원천은 주간 리포트와 같다(tasks.completed_at, crm_activities.occurred_at의 연락 종류,
// journal_entries note의 created_at, daily_review의 review_date). 색은 Moonstone 명도 한 계열 —
// 초록·카테고리 색을 쓰지 않는다(DESIGN §4·§5.3). 숫자는 칸의 aria-label·툴팁이 직접 말한다.
import { isCalendarDateKey, shiftDateKey, toZonedDateKey } from "./rhythm-calendar.js";

export const ACTIVITY_WEEKS = 16;
export const ACTIVITY_SOURCES = ["tasks", "contacts", "memos", "reviews"];
const SOURCE_LABELS = { tasks: "할 일", contacts: "연락", memos: "메모", reviews: "리뷰" };

function weekStart(dateKey) {
  const index = (new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return shiftDateKey(dateKey, -index);
}

// 최근 16주(월요일 시작) ~ 오늘.
export function activityWindow(todayKey) {
  if (!isCalendarDateKey(todayKey)) return null;
  return { from: shiftDateKey(weekStart(todayKey), -7 * (ACTIVITY_WEEKS - 1)), to: todayKey };
}

export function covers(window, from, to) {
  return Boolean(window && from >= window.from && to <= window.to);
}

// 행을 운영자 시간대 날짜로 모은다. 원천 하나가 null(못 읽음·잘림)이면 그 원천은 missing — 0으로 위장하지 않는다.
export function tallyActivity({ from, to, timezone, tasks, contacts, memos, reviews }) {
  const days = {};
  const missing = [];
  const bump = (date, key) => {
    if (!isCalendarDateKey(date) || date < from || date > to) return;
    const day = days[date] || (days[date] = { tasks: 0, contacts: 0, memos: 0, review: false });
    if (key === "review") day.review = true;
    else day[key] += 1;
  };
  const zoned = (value) => (value ? toZonedDateKey(value, timezone) : "");
  if (Array.isArray(tasks)) tasks.forEach((row) => bump(zoned(row?.completed_at), "tasks")); else missing.push("tasks");
  if (Array.isArray(contacts)) contacts.forEach((row) => bump(zoned(row?.occurred_at), "contacts")); else missing.push("contacts");
  if (Array.isArray(memos)) memos.forEach((row) => bump(zoned(row?.created_at), "memos")); else missing.push("memos");
  if (Array.isArray(reviews)) reviews.forEach((row) => bump(row?.review_date, "review")); else missing.push("reviews");
  return { from, to, days, missing };
}

export function dayTotal(day) {
  return day ? day.tasks + day.contacts + day.memos + (day.review ? 1 : 0) : 0;
}

// GitHub처럼 0은 비우고, 활동이 있는 날의 분포를 네 단계로 나눈다(사분위). 날마다 척도가 흔들리지
// 않도록 16주 창 전체로 한 번 정하고, 월 캘린더도 같은 경계를 쓴다.
export function activityThresholds(activity) {
  const totals = Object.values(activity?.days || {}).map(dayTotal).filter((total) => total > 0).sort((a, b) => a - b);
  if (!totals.length) return [1, 2, 3];
  const at = (q) => totals[Math.min(totals.length - 1, Math.floor(q * (totals.length - 1)))];
  const cuts = [at(0.25), at(0.5), at(0.75)];
  // 경계가 겹치면(값이 고르게 적은 초기) 1씩 벌려 네 단계가 모두 의미를 갖게 한다.
  for (let index = 1; index < cuts.length; index += 1) if (cuts[index] <= cuts[index - 1]) cuts[index] = cuts[index - 1] + 1;
  return cuts;
}

export function activityLevel(total, thresholds) {
  if (!total) return 0;
  if (total <= thresholds[0]) return 1;
  if (total <= thresholds[1]) return 2;
  if (total <= thresholds[2]) return 3;
  return 4;
}

export function activityDetail(day) {
  if (!day || !dayTotal(day)) return "활동 없음";
  const parts = ["tasks", "contacts", "memos"].filter((key) => day[key] > 0).map((key) => `${SOURCE_LABELS[key]} ${day[key]}`);
  if (day.review) parts.push("리뷰 ✓");
  return parts.join(" · ");
}

export function missingText(missing) {
  return (missing || []).map((key) => SOURCE_LABELS[key]).join("·");
}

// 16주 × 7일 그리드(열 = 주, 행 = 월~일). 미래 칸은 비활성, 월이 바뀌는 열에 월 라벨.
export function buildActivityWeeks(activity, todayKey) {
  const window = activityWindow(todayKey);
  if (!window || !activity) return null;
  const thresholds = activityThresholds(activity);
  const weeks = [];
  let lastMonth = "";
  for (let week = 0; week < ACTIVITY_WEEKS; week += 1) {
    const start = shiftDateKey(window.from, week * 7);
    const month = start.slice(0, 7);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDateKey(start, index);
      const day = activity.days[date];
      const total = dayTotal(day);
      return { date, total, level: date > todayKey ? null : activityLevel(total, thresholds), detail: activityDetail(day), future: date > todayKey };
    });
    weeks.push({ start, label: month !== lastMonth ? `${Number(month.slice(5))}월` : "", days });
    lastMonth = month;
  }
  const active = Object.entries(activity.days).filter(([date, day]) => date <= todayKey && dayTotal(day) > 0).length;
  return { weeks, thresholds, active };
}

// 잔디 옆 요약 — 이번 달·지난달 활동한 날, 가장 활발한 요일, 최근 7일 활동 수. 지난달이 창 밖이면 null(모름 ≠ 0).
export function activitySummary(activity, todayKey) {
  if (!activity?.days || !isCalendarDateKey(todayKey)) return null;
  const month = todayKey.slice(0, 7);
  const prevDate = new Date(`${month}-01T00:00:00.000Z`);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);
  const weekAgo = shiftDateKey(todayKey, -6);
  const byWeekday = Array(7).fill(0);
  let thisMonth = 0;
  let lastMonth = 0;
  let last7 = 0;
  for (const [date, day] of Object.entries(activity.days)) {
    const total = dayTotal(day);
    if (!total || date > todayKey) continue;
    if (date.startsWith(month)) thisMonth += 1;
    if (date.startsWith(prevMonth)) lastMonth += 1;
    if (date >= weekAgo) last7 += total;
    byWeekday[(new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7] += total;
  }
  const peak = Math.max(...byWeekday);
  const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
  return {
    thisMonth,
    lastMonth: activity.from <= `${prevMonth}-01` ? lastMonth : null,
    busiestWeekday: peak > 0 ? WEEKDAYS[byWeekday.indexOf(peak)] : null,
    last7,
  };
}
