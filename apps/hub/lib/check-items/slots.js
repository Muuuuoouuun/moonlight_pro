// 확인할 것 — 시간 잡기의 권장 시간(확인할 것 스펙 §4.7). 순수 함수, import 없음.
//
// 지금 이후·근무 시간 창 안에서, 캘린더 일정과 이미 잡아 둔 일을 피해 소요 시간이 들어가는 가장 이른
// 빈 시간을 권장한다. 종일 일정은 무시한다. 캘린더를 읽지 못했으면 호출부가 계산하지 않는다 — 빈 시간을
// 지어내지 않는다. 한국 시간(UTC+9, 서머타임 없음) 고정.

export const WORKDAY = Object.freeze({ startHour: 9, endHour: 19 }); // Q-CF9 기본값(2026-10-01 승인)
export const DURATION_CHOICES = Object.freeze([15, 30, 45, 60]);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const STEP_MIN = 5;
const BUFFER_MIN = 5;

export function kstDayKeyOf(ms) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function kstMs(dayKey, minutesOfDay) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, 0) - KST_OFFSET_MS + minutesOfDay * MINUTE;
}

function addDays(dayKey, days) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 다음 근무일 — 주말은 내일 후보에서 건너뛴다(Q-CF9).
export function nextWorkdayKey(dayKey) {
  let next = addDays(dayKey, 1);
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Date(`${next}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return next;
    next = addDays(next, 1);
  }
  return next;
}

function roundUp(ms, stepMin) {
  const step = stepMin * MINUTE;
  return Math.ceil(ms / step) * step;
}

function busyIntervals(events = [], blocks = []) {
  const list = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || event.allDay) continue;
    const start = Date.parse(event.start);
    const end = Date.parse(event.end || event.start);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) list.push([start, end]);
  }
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const start = Date.parse(block?.start);
    const end = Date.parse(block?.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) list.push([start, end]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of list) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function gapsInDay(dayKey, from, busy, minutes, workday) {
  const dayStart = kstMs(dayKey, workday.startHour * 60);
  const dayEnd = kstMs(dayKey, workday.endHour * 60);
  const need = minutes * MINUTE;
  const slots = [];
  let cursor = Math.max(dayStart, from);
  for (const [start, end] of busy) {
    if (end <= cursor) continue;
    if (start >= dayEnd) break;
    if (start - cursor >= need) slots.push({ start: cursor, end: cursor + need });
    cursor = Math.max(cursor, end);
  }
  if (dayEnd - cursor >= need) slots.push({ start: cursor, end: cursor + need });
  return slots;
}

function toSlot({ start, end }, todayKey) {
  const dayKey = kstDayKeyOf(start);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), dayKey, isToday: dayKey === todayKey };
}

/**
 * @returns {{ recommended: object|null, options: object[], noRoomToday: boolean }}
 *   options — 최대 셋: 오늘 첫 빈 시간 · 오늘 그다음 빈 시간 · 다음 근무일 첫 빈 시간
 */
export function suggestSlots({ events = [], blocks = [], now = Date.now(), minutes = 30, workday = WORKDAY } = {}) {
  const todayKey = kstDayKeyOf(now);
  const busy = busyIntervals(events, blocks);
  const from = roundUp(now + BUFFER_MIN * MINUTE, STEP_MIN);
  const today = gapsInDay(todayKey, from, busy, minutes, workday).slice(0, 2);
  const nextDay = nextWorkdayKey(todayKey);
  const tomorrow = gapsInDay(nextDay, kstMs(nextDay, 0), busy, minutes, workday).slice(0, 1);
  const options = [...today, ...tomorrow].map((slot) => toSlot(slot, todayKey));
  return { recommended: options[0] || null, options, noRoomToday: today.length === 0 };
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
export function formatSlot(slot, now = Date.now()) {
  if (!slot) return '';
  const start = Date.parse(slot.start);
  const end = Date.parse(slot.end);
  const hm = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 16);
  const dayKey = kstDayKeyOf(start);
  const todayKey = kstDayKeyOf(now);
  const date = new Date(`${dayKey}T00:00:00Z`);
  const prefix = dayKey === todayKey ? '' : dayKey === addDays(todayKey, 1) ? '내일 ' : `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${WEEKDAY[date.getUTCDay()]} `;
  return `${prefix}${hm(start)}–${hm(end)}`;
}
