const HOUR_HEIGHT = 52;
const MIN_CARD_HEIGHT = 44;
const CARD_GAP = 2;

// Visual markers may be taller than their duration. Allocation and rendering
// must use the same rectangle, including the mobile/coarse-pointer touch floor.
export function calendarEventCardGeometry(event, startHour = 8) {
  return {
    top: (event.start - startHour) * HOUR_HEIGHT,
    height: Math.max(MIN_CARD_HEIGHT, (event.end - event.start) * HOUR_HEIGHT - CARD_GAP),
  };
}

// Retain the normal working-day range, extending only for received timed rows.
// The last touch marker gets trailing room without inventing a 25:00 hour label.
export function calendarGridRange(events) {
  const valid = (Array.isArray(events) ? events : []).filter(event => event && Number.isFinite(event.start) && Number.isFinite(event.end) && event.end > event.start);
  const timed = valid.filter(event => !event.allDay);
  const startHour = Math.max(0, Math.floor(Math.min(8, ...timed.map(event => event.start))));
  const endHour = Math.min(24, Math.ceil(Math.max(20, ...timed.map(event => event.end))));
  const height = Math.max((endHour - startHour) * HOUR_HEIGHT, ...valid.map(event => {
    const box = calendarEventCardGeometry(event, startHour);
    return box.top + box.height + CARD_GAP;
  }));
  return { startHour, endHour, height, hours: Array.from({ length: endHour - startHour }, (_, index) => startHour + index) };
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// All-day dates are calendar dates, even when the API appends local midnight.
// Parsing them as instants would move a date-only value in timezones west of UTC.
function allDayKey(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function shiftCalendarDay(key, offset) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const clockHour = date => date.getHours() + date.getMinutes() / 60;
const clockLabel = date => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Split provider events by their intersection with each visible calendar day.
 * Completion/notes still use the original outcomeKey; only the rendering key is segmented.
 */
export function mapGoogleEventsToGrid(events, days) {
  if (!Array.isArray(events) || !Array.isArray(days)) return [];
  const visible = days.flatMap((value, day) => {
    const start = new Date(value);
    if (!Number.isFinite(start.getTime())) return [];
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [{ day, key: localDateKey(start), start, end }];
  });

  const segments = events.flatMap((event, index) => {
    if (!event || !event.start) return [];
    const identity = event.outcomeKey || `${event.source || 'calendar'}:${event.id || index}`;
    const base = {
      id: event.id, outcomeKey: event.outcomeKey, allDay: Boolean(event.allDay), title: event.title,
      originalStart: event.start, originalEnd: event.end || event.start,
      tone: event.source === 'personal' ? 'personal' : event.source === 'company' ? 'company' : 'moon',
      sourceLabel: event.source === 'personal' ? '개인' : event.source === 'company' ? '회사' : '',
    };

    if (event.allDay) {
      const first = allDayKey(event.start), suppliedEnd = allDayKey(event.end);
      if (!first || (event.end && !suppliedEnd)) return [];
      // A missing/equal end retains the legacy single-day marker. Provider end dates are exclusive.
      const end = suppliedEnd && suppliedEnd > first ? suppliedEnd : shiftCalendarDay(first, 1);
      return visible.filter(day => day.key >= first && day.key < end).map(day => ({
        ...base, day: day.day, segmentKey: `${identity}:${day.key}`, start: 8, end: 9,
        multiDay: end > shiftCalendarDay(first, 1),
      }));
    }

    const start = new Date(event.start), rawEnd = new Date(event.end || event.start);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(rawEnd.getTime()) || rawEnd < start) return [];
    // A missing/zero duration needs a point marker, not an invented 15-minute
    // event that can spill into the next day. Visual height is handled separately.
    const end = rawEnd > start ? rawEnd : new Date(start.getTime() + 1);
    const multiDay = localDateKey(start) !== localDateKey(end);
    return visible.flatMap(day => {
      const from = Math.max(start.getTime(), day.start.getTime());
      const until = Math.min(end.getTime(), day.end.getTime());
      if (from >= until) return [];
      const startHour = from === day.start.getTime() ? 0 : clockHour(new Date(from));
      const endHour = until === day.end.getTime() ? 24 : clockHour(new Date(until));
      return [{ ...base, day: day.day, segmentKey: `${identity}:${day.key}`, start: startHour,
        end: Math.min(24, Math.max(startHour + 0.25, endHour)), multiDay }];
    });
  });
  return layoutCalendarEventSegments(segments);
}

/** Drawer copy describes the original event, never a clipped day segment. */
export function calendarEventWhenLabel(event) {
  const originalStart = event?.originalStart ?? event?.start;
  const originalEnd = event?.originalEnd ?? event?.end ?? originalStart;
  if (event?.allDay) {
    const first = allDayKey(originalStart), end = allDayKey(originalEnd);
    if (!first || !end || end <= shiftCalendarDay(first, 1)) return '종일';
    return `${first} – ${shiftCalendarDay(end, -1)} · 종일`;
  }
  const start = new Date(originalStart), end = new Date(originalEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '일정 시각 확인 필요';
  if (localDateKey(start) === localDateKey(end)) return `${clockLabel(start)} – ${clockLabel(end)}`;
  return `${localDateKey(start)} ${clockLabel(start)} – ${localDateKey(end)} ${clockLabel(end)}`;
}

/** Allocate non-overlapping columns for each day's actual clickable rectangles.
 * Short adjacent events may need separate columns because a 44px marker outlives
 * its duration. Preserve identifiers/times; visual size never changes the event.
 */
export function layoutCalendarEventSegments(events) {
  if (!Array.isArray(events)) return [];
  const placement = events.map(() => ({ overlapColumn: 0, overlapColumns: 1 }));
  const days = new Map();
  events.forEach((event, index) => {
    if (!Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= event.start) return;
    const geometry = calendarEventCardGeometry(event, 0);
    const start = geometry.top;
    const end = start + geometry.height + CARD_GAP;
    if (!days.has(event.day)) days.set(event.day, []);
    days.get(event.day).push({ index, start, end });
  });
  for (const intervals of days.values()) {
    intervals.sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);
    let ends = [], group = [];
    const finishGroup = () => {
      for (const index of group) placement[index].overlapColumns = ends.length;
      ends = []; group = [];
    };
    for (const interval of intervals) {
      if (ends.length && ends.every(end => end <= interval.start)) finishGroup();
      let column = ends.findIndex(end => end <= interval.start);
      if (column < 0) column = ends.length;
      ends[column] = interval.end;
      placement[interval.index].overlapColumn = column;
      group.push(interval.index);
    }
    finishGroup();
  }
  return events.map((event, index) => ({ ...event, ...placement[index] }));
}
