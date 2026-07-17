export const DEFAULT_RHYTHM_TIME_ZONE = "Asia/Seoul";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDateKey(value) {
  const match = DATE_KEY_PATTERN.exec(String(value || ""));
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function resolveRhythmTimeZone(value) {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_RHYTHM_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_RHYTHM_TIME_ZONE;
  }
}

export function toZonedDateKey(value, timeZone = DEFAULT_RHYTHM_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveRhythmTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDateKey(dateKey, days) {
  if (!isCalendarDateKey(dateKey) || !Number.isInteger(days)) return "";
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function routineSemanticKey(row) {
  const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
  return String(
    meta.ritual_key || meta.key || meta.name || row?.check_type || "ritual",
  ).trim() || "ritual";
}

export function routineLocalDateKey(row, timeZone = DEFAULT_RHYTHM_TIME_ZONE) {
  const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
  if (isCalendarDateKey(meta.local_date)) return meta.local_date;
  return toZonedDateKey(row?.checked_at, timeZone);
}

export function legacyCandidateWindow(dateKey) {
  if (!isCalendarDateKey(dateKey)) return null;
  return {
    start: `${shiftDateKey(dateKey, -1)}T00:00:00.000Z`,
    end: `${shiftDateKey(dateKey, 2)}T00:00:00.000Z`,
  };
}
