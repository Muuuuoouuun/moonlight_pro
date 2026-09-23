// 하루 리뷰가 "꾸준히 남게" 하는 규칙 — 언제 떠올리게 할지(cue), 오늘 3개로 무엇을 권할지,
// 월 캘린더와 이번 주 기록일을 어떻게 셀지. 컴포넌트는 결과만 그린다
// (docs/superpowers/specs/2026-09-23-daily-review-sustainable-loop-design.md §4).
// 날짜 키는 모두 워크스페이스 시간대의 YYYY-MM-DD다 — 저장 날짜와 같은 기준이어야 자정 근처에 어긋나지 않는다.
import { isCalendarDateKey, resolveRhythmTimeZone, shiftDateKey } from "./rhythm-calendar.js";

export const REVIEW_EVENING_HOUR = 18; // §5 자동 테마가 다크로 바뀌는 시각과 같다.
export const REVIEW_BACKFILL_UNTIL_HOUR = 12; // 어제 메우기 제안은 다음 날 정오까지만.
export const REVIEW_WORKDAYS_PER_WEEK = 5; // 09-20 §6.2 근무일 = 월~금.
export const REVIEW_WEEK_TARGET = 4; // Q-DR3 — 4/5로 시작, 실측 뒤 조정.
export const REVIEW_RECENT_DAYS = 8; // 서버가 싣는 최근 기록 범위(오늘 포함) — 이번 주 + 지난 일요일/어제.
const FOCUS_TEXT_LIMIT = 500;

export function zonedClock(now = new Date(), timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveRhythmTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { dateKey: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) % 24 };
}

// 0=월 … 6=일. 날짜 키 자체의 요일이라 시간대와 무관하다.
export function weekdayIndex(dateKey) {
  if (!isCalendarDateKey(dateKey)) return -1;
  return (new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

export function isWorkday(dateKey) {
  const index = weekdayIndex(dateKey);
  return index >= 0 && index < REVIEW_WORKDAYS_PER_WEEK;
}

export function weekStartOf(dateKey) {
  const index = weekdayIndex(dateKey);
  return index < 0 ? "" : shiftDateKey(dateKey, -index);
}

export function recentRange(todayKey) {
  return isCalendarDateKey(todayKey) ? { from: shiftDateKey(todayKey, -(REVIEW_RECENT_DAYS - 1)), to: todayKey } : null;
}

function recordedMap(entries) {
  const map = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry && isCalendarDateKey(entry.reviewDate)) map.set(entry.reviewDate, entry);
  }
  return map;
}

// 오늘·홈의 한 줄. recent를 못 읽었으면(null) 아무것도 말하지 않는다 — "기록 없음"으로 위장하지 않는다.
export function reviewCue({ todayKey, hour, recent }) {
  if (!isCalendarDateKey(todayKey) || !Number.isInteger(hour) || !Array.isArray(recent)) return null;
  const recorded = recordedMap(recent);
  const today = recorded.get(todayKey);
  if (today) return { kind: "done", date: todayKey, energy: today.energy ?? null };
  const yesterday = shiftDateKey(todayKey, -1);
  if (hour < REVIEW_BACKFILL_UNTIL_HOUR && isWorkday(yesterday) && !recorded.has(yesterday)) {
    return { kind: "backfill", date: yesterday };
  }
  if (hour >= REVIEW_EVENING_HOUR) return { kind: "evening", date: todayKey };
  return null;
}

// "이번 주 k/5" — 연속 일수 대신 매주 초기화되는 근무일 기록 수. 주말 기록은 보이되 분모에 넣지 않는다.
export function weekProgress(todayKey, recent) {
  if (!isCalendarDateKey(todayKey) || !Array.isArray(recent)) return null;
  const start = weekStartOf(todayKey);
  const recorded = recordedMap(recent);
  let workdays = 0;
  let weekend = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = shiftDateKey(start, offset);
    if (date > todayKey) break;
    if (!recorded.has(date)) continue;
    if (isWorkday(date)) workdays += 1;
    else weekend += 1;
  }
  return { start, recorded: workdays, weekend, target: REVIEW_WEEK_TARGET, workdays: REVIEW_WORKDAYS_PER_WEEK };
}

// 09-20 §6.2: 고른 수 중 같은 날 완료한 수로 진척을 권한다. 값은 권장일 뿐 draft를 바꾸지 않는다.
export function suggestFromFocus(today, focusTitles = today?.focusTitles) {
  if (!today || !Number.isInteger(today.focusPicked) || today.focusPicked < 1 || !Number.isInteger(today.focusDone)) return null;
  const done = Math.max(0, Math.min(today.focusDone, today.focusPicked));
  const progress = done === today.focusPicked ? 2 : done > 0 ? 1 : 0;
  const titles = (Array.isArray(focusTitles) ? focusTitles : [])
    .filter((title) => typeof title === "string" && title.trim()).map((title) => title.trim()).slice(0, 3);
  let focus = titles.length ? `오늘 ${today.focusPicked}개: ${titles.join(" · ")}` : "";
  if (focus.length > FOCUS_TEXT_LIMIT) focus = `${focus.slice(0, FOCUS_TEXT_LIMIT - 1)}…`;
  return { progress, focus, done, picked: today.focusPicked, reason: `오늘 ${today.focusPicked}개 중 ${done}개 완료` };
}

export function shiftMonth(month, delta) {
  if (typeof month !== "string" || !isCalendarDateKey(`${month}-01`) || !Number.isInteger(delta)) return "";
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

// 월 캘린더 — 셀 상태는 색이 아니라 채움·테두리로 그린다(StreakMark와 같은 문법).
export function buildReviewMonth(month, entries, todayKey) {
  if (typeof month !== "string" || !isCalendarDateKey(`${month}-01`)) return null;
  // 기록을 읽지 못했으면(preview·error) 지난 날은 "unknown" — 빈 근무일(○)로 단정하지 않는다(§5.3 source truth).
  const known = Array.isArray(entries);
  const recorded = recordedMap(entries);
  const first = `${month}-01`;
  const cells = [];
  for (let date = first; date.startsWith(month); date = shiftDateKey(date, 1)) {
    const entry = recorded.get(date);
    const state = entry ? "recorded"
      : isCalendarDateKey(todayKey) && date > todayKey ? "future"
        : !known ? "unknown"
        : date === todayKey ? "today"
          : isWorkday(date) ? "missed" : "rest";
    cells.push({ date, day: Number(date.slice(8)), state, today: date === todayKey, energy: entry?.energy ?? null });
  }
  const pastCells = cells.filter((cell) => cell.state !== "future");
  return {
    month, leading: weekdayIndex(first), cells, known,
    recordedCount: cells.filter((cell) => cell.state === "recorded").length,
    energySeries: pastCells.map((cell) => cell.energy),
  };
}
