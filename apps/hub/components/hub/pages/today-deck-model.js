import { MAX_FOCUS_PER_DAY } from "@/lib/task-today";
import { REVIEW_EVENING_HOUR } from "@/lib/daily-review-rhythm";

// 오늘 13a "하루 시계 위에 세 자리"의 판단 규칙 — 화면(today-deck.jsx)과 시험이 같은 함수를 쓴다.

export const DAY_START = 7 * 60;
export const DAY_END = 21 * 60;
const WORK_START = 9 * 60;
const WORK_END = 18 * 60;
export const MORNING_END_HOUR = 11;

export function todayMode(date) {
  const hour = date.getHours();
  return hour < MORNING_END_HOUR ? "morning" : hour < REVIEW_EVENING_HOUR ? "day" : "evening";
}

export const minuteOf = (date) => date.getHours() * 60 + date.getMinutes();
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
export const hm = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const durationLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);
export const dayPos = (minute) => Math.min(100, Math.max(0, ((minute - DAY_START) / (DAY_END - DAY_START)) * 100));

// 오늘(기기 날짜) 안의 시각 일정만 분 단위로 펼친다. 끝 시각이 없으면 30분으로 그린다 —
// 띠의 폭일 뿐 끝났다고 판정하지 않는다(진행 중 판정은 끝 시각이 있을 때만).
export function dayEvents(agenda, now) {
  if (!["live", "partial"].includes(agenda?.state)) return [];
  const from = startOfDay(now);
  const to = from + 24 * 60 * 60 * 1000;
  return (Array.isArray(agenda.items) ? agenda.items : []).flatMap((item) => {
    if (item.allDay) return [];
    const start = Date.parse(item.whenAt || "");
    if (!Number.isFinite(start) || start >= to) return [];
    const end = Date.parse(item.endAt || "");
    const s = start < from ? 0 : minuteOf(new Date(start));
    const known = Number.isFinite(end) && end > start;
    const e = known ? (end >= to ? 24 * 60 : minuteOf(new Date(end))) : s + 30;
    return [{ id: item.id, title: item.title, s, e, endKnown: known }];
  }).sort((a, b) => a.s - b.s);
}

// 일과(09–18시) 안에서 일정 사이 30분 이상 빈 시간.
export function freeGaps(events, { from = WORK_START, to = WORK_END, min = 30 } = {}) {
  const gaps = [];
  let cursor = from;
  for (const event of events) {
    if (event.s - cursor >= min) gaps.push({ s: cursor, e: Math.min(event.s, to) });
    cursor = Math.max(cursor, event.e);
    if (cursor >= to) break;
  }
  if (to - cursor >= min) gaps.push({ s: cursor, e: to });
  return gaps.filter((gap) => gap.e - gap.s >= min);
}

const knownCount = (taskToday, value) => ["live", "partial"].includes(taskToday?.state) && Number.isInteger(value) && value >= 0
  && (taskToday.state === "live" || value > 0) ? value : null;

export function buildTodayDeck({ taskToday, agenda, now }) {
  const mode = todayMode(now);
  const minute = minuteOf(now);
  const events = dayEvents(agenda, now);
  const agendaReadable = ["live", "partial"].includes(agenda?.state);
  const current = events.find((event) => event.endKnown && event.s <= minute && minute < event.e) || null;
  const next = events.find((event) => event.s > minute) || null;
  const items = Array.isArray(taskToday?.items) ? taskToday.items : [];
  const focusOpen = items.filter((task) => task.focusToday);
  const picked = knownCount(taskToday, taskToday?.focus?.picked);
  const done = knownCount(taskToday, taskToday?.focus?.done);

  let headline;
  if (mode === "morning") {
    headline = picked == null ? "오늘 세 자리를 골라요" : picked >= MAX_FOCUS_PER_DAY ? "오늘은 이 세 가지" : `세 자리 중 ${picked}개 골랐어요`;
  } else if (mode === "day") {
    headline = current ? `지금은 ${current.title}`
      : next ? `빈 시간 · 다음은 ${hm(next.s)}`
        : focusOpen.length ? `남은 자리 ${focusOpen.length}개`
          : picked === 0 ? "세 자리가 비어 있어요"
            : picked != null && done === picked ? "오늘 3개를 다 끝냈어요"
              : agendaReadable ? "다음 일정은 없어요" : "오늘 세 자리";
  } else {
    headline = done == null ? "하루를 닫을 시간" : `오늘 3개 중 ${done}개 끝냈어요`;
  }
  return { mode, minute, events, agendaReadable, current, next, gaps: freeGaps(events), focusOpen, picked, done, headline };
}

