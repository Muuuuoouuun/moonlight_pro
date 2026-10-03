const MIN_EVENT_MS = 15 * 60 * 1000;

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
    // Preserve the existing minimum marker for events whose provider omits a duration.
    const end = rawEnd > start ? rawEnd : new Date(start.getTime() + MIN_EVENT_MS);
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

/** Allocate non-overlapping columns for each day's visible intervals.
 * Adjacent events share a column; hidden overnight portions consume no column.
 * Preserve input order and original identifiers/times for the outcome drawer.
 */
export function layoutCalendarEventSegments(events) {
  if (!Array.isArray(events)) return [];
  const placement = events.map(() => ({ overlapColumn: 0, overlapColumns: 1 }));
  const days = new Map();
  events.forEach((event, index) => {
    const start = Math.max(8, event.start);
    const end = Math.min(20, event.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
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
