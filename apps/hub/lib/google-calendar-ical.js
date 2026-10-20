import ical from "node-ical";
import { kstDayKey } from "./kst-day.js";
import { CALENDAR_READ_LIMITS, calendarItemBytes, calendarCoverage } from "./calendar-read-coverage.js";

const GOOGLE_CALENDAR_ICAL_HOSTS = new Set(["calendar.google.com", "www.google.com"]);
const MAX_ICAL_BYTES = 5 * 1024 * 1024;
const ICAL_FETCH_TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;
const MAX_ICAL_WINDOW_DAYS = 366;
const MAX_ICAL_EXPANSION_CANDIDATES = 2000;
const MAX_ICAL_COMPONENTS = 2000;

// node-ical expands a whole RRULE before returning. A small feed can therefore
// generate huge arrays. Conservatively refuse expensive rules before expansion;
// this is a disclosed partial read, never a silently shortened recurrence.
function recurrenceWorkEstimate(component, min, max) {
  const options = component.rrule.options;
  const duration = Math.max(0, Number(component.end) - Number(component.start)) || 0;
  const days = Math.ceil((max - min + duration) / DAY_MS) + 3;
  if (days > MAX_ICAL_WINDOW_DAYS + 3) return Infinity;
  const hours = ["HOURLY", "MINUTELY", "SECONDLY"].includes(options.freq) ? 24 : options.byHour?.length || 1;
  const minutes = ["MINUTELY", "SECONDLY"].includes(options.freq) ? 60 : options.byMinute?.length || 1;
  const seconds = options.freq === "SECONDLY" ? 60 : options.bySecond?.length || 1;
  // COUNT rules can enumerate from DTSTART before filtering the window. Do not
  // mistake a short requested window for bounded historical COUNT work.
  return Math.max(options.count || 0, days * hours * minutes * seconds);
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.val === "string") return value.val.trim();
  return "";
}

function normalizeWindow({ timeMin, timeMax }) {
  const min = asDate(timeMin);
  const max = asDate(timeMax);

  if (!min || !max || min >= max) {
    throw new Error("A valid bounded iCal time window is required.");
  }

  return { min, max };
}

function toCalendarPoint(date, allDay) {
  return allDay
    ? { date: formatLocalDate(date) }
    : { dateTime: date.toISOString() };
}

function mapInstance(instance, event) {
  const source = instance.event || event;
  const start = asDate(instance.start || source.start);
  const end = asDate(instance.end || source.end || start);
  if (!start || !end) return null;

  const iCalUID = normalizeText(source.uid || event.uid);
  const uid = iCalUID || `ical-${start.getTime()}`;
  const isRecurring = Boolean(event.rrule || source.recurrenceid);
  const allDay = Boolean(instance.isFullDay || source.start?.dateOnly || source.datetype === "date");
  // RECURRENCE-ID names the original slot even when this occurrence moves.
  const recurrenceId = asDate(source.recurrenceid);
  const occurrence = recurrenceId || start;
  const occurrenceAllDay = recurrenceId ? Boolean(source.recurrenceid.dateOnly) : allDay;
  const occurrenceKey = occurrenceAllDay ? formatLocalDate(occurrence) : occurrence.toISOString();

  return {
    id: isRecurring ? `${uid}:${occurrenceKey}` : uid,
    iCalUID: iCalUID || undefined,
    ...(isRecurring ? { originalStartTime: toCalendarPoint(occurrence, occurrenceAllDay) } : {}),
    summary: normalizeText(instance.summary || source.summary) || "(제목 없음)",
    description: normalizeText(source.description) || undefined,
    location: normalizeText(source.location) || undefined,
    start: toCalendarPoint(start, allDay),
    end: toCalendarPoint(end, allDay),
    htmlLink: normalizeText(source.url) || undefined,
  };
}

export function validateGoogleCalendarIcalUrl(value) {
  const raw = String(value || "").trim();
  let url;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("A valid Google Calendar iCal URL is required.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Google Calendar iCal feeds must use HTTPS.");
  }

  if (!GOOGLE_CALENDAR_ICAL_HOSTS.has(url.hostname)) {
    throw new Error("Only Google Calendar iCal feed URLs are allowed.");
  }

  if (!url.pathname.startsWith("/calendar/ical/") || !url.pathname.endsWith(".ics")) {
    throw new Error("The URL must be a Google Calendar iCal feed ending in .ics.");
  }

  url.hash = "";
  return url.toString();
}

export function resolveGoogleCalendarIcalUrl() {
  const value = process.env.GOOGLE_CALENDAR_ICAL_URL?.trim();
  return value ? validateGoogleCalendarIcalUrl(value) : null;
}

export function hasGoogleCalendarIcalUrl() {
  try {
    return Boolean(resolveGoogleCalendarIcalUrl());
  } catch {
    return false;
  }
}

function parseGoogleCalendarIcalWindow(text, { timeMin, timeMax }) {
  const { min, max } = normalizeWindow({ timeMin, timeMax });
  const parsed = ical.sync.parseICS(String(text || ""));
  const items = [];
  let retainedBytes = 2, work = 0, components = 0, partialReason = "";

  for (const component of Object.values(parsed)) {
    if (component?.type !== "VEVENT" || String(component.status || "").toUpperCase() === "CANCELLED") {
      continue;
    }

    if (++components > MAX_ICAL_COMPONENTS) {
      partialReason = "ical-component-budget";
      break;
    }
    if (component.rrule) {
      const estimate = recurrenceWorkEstimate(component, min, max);
      if (work + estimate > MAX_ICAL_EXPANSION_CANDIDATES) {
        partialReason = "ical-recurrence-budget";
        continue;
      }
      work += estimate;
    }
    let instances;
    try {
      const allDay = Boolean(component.start?.dateOnly || component.datetype === "date");
      // node-ical's date-only API uses host-local calendar dates. Supply KST date
      // keys as local midnights, then enforce the exact KST-exclusive bounds below.
      instances = ical.expandRecurringEvent(component, {
        from: allDay ? new Date(`${kstDayKey(min)}T00:00:00`) : min,
        to: allDay ? new Date(`${kstDayKey(max)}T00:00:00`) : max,
        includeOverrides: true, excludeExdates: true, expandOngoing: true,
      });
    } catch {
      partialReason = "ical-recurrence-unreadable";
      continue;
    }

    for (const instance of instances) {
      const mapped = mapInstance(instance, component);
      if (!mapped) continue;
      const start = asDate(mapped.start.dateTime || `${mapped.start.date}T00:00:00+09:00`);
      const end = asDate(mapped.end.dateTime || `${mapped.end.date}T00:00:00+09:00`);
      if (!start || !end || start >= max || end <= min) continue;
      const bytes = calendarItemBytes(mapped) + (items.length ? 1 : 0);
      if (items.length >= CALENDAR_READ_LIMITS.maxItems || retainedBytes + bytes > CALENDAR_READ_LIMITS.maxBytes) {
        partialReason = "ical-retained-budget";
        break;
      }
      items.push(mapped);
      retainedBytes += bytes;
    }
    if (partialReason === "ical-retained-budget") break;
  }

  items.sort((a, b) => {
    const aStart = Date.parse(a.start.dateTime || `${a.start.date}T00:00:00+09:00`);
    const bStart = Date.parse(b.start.dateTime || `${b.start.date}T00:00:00+09:00`);
    return aStart - bStart || a.id.localeCompare(b.id);
  });
  return { items, coverage: calendarCoverage(items, !partialReason, {
    truncated: Boolean(partialReason), reason: partialReason || "ok", retainedBytes,
    limits: { ...CALENDAR_READ_LIMITS, maxWindowDays: MAX_ICAL_WINDOW_DAYS, maxExpansionCandidates: MAX_ICAL_EXPANSION_CANDIDATES },
  }) };
}

// Retain the array-only parser's bounded compatibility API. Actual read envelopes
// use the explicit coverage envelope below, never this legacy projection.
export function parseGoogleCalendarIcal(text, { timeMin, timeMax, maxResults = 60 }) {
  return parseGoogleCalendarIcalWindow(text, { timeMin, timeMax }).items
    .slice(0, Math.max(1, Math.min(Number(maxResults) || 60, 250)));
}

export async function listGoogleCalendarIcalEvents({
  feedUrl = resolveGoogleCalendarIcalUrl(),
  timeMin,
  timeMax,
  maxResults = 60,
  fetchImpl = fetch,
}) {
  const validatedUrl = validateGoogleCalendarIcalUrl(feedUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ICAL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(validatedUrl, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "text/calendar, text/plain;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`Google Calendar iCal feed returned HTTP ${response.status}.`);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_ICAL_BYTES) {
      throw new Error("Google Calendar iCal feed is too large.");
    }

    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_ICAL_BYTES) {
      throw new Error("Google Calendar iCal feed is too large.");
    }

    controller.signal.throwIfAborted();
    const read = parseGoogleCalendarIcalWindow(body, { timeMin, timeMax });
    return {
      ok: true,
      reason: read.coverage.complete ? "ok" : "partial-source-failure",
      source: "ical",
      readOnly: true,
      ...read,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Personal + Company are two separate Google accounts (not the single OAuth-connected
// calendar) — each publishes a per-owner "secret address in iCal format" feed, named here
// by owner rather than a generic list so a third source is a one-line addition later.
const CALENDAR_SOURCE_DEFINITIONS = [
  { id: "personal", label: "Personal", envVar: "GOOGLE_CALENDAR_ICAL_ID_MOON" },
  { id: "company", label: "Company", envVar: "GOOGLE_CALENDAR_ICAL_ID_CLE_MOON" },
];

export function resolveGoogleCalendarSources() {
  return CALENDAR_SOURCE_DEFINITIONS.map(({ id, label, envVar }) => {
    const raw = process.env[envVar]?.trim();
    if (!raw) return null;
    try {
      return { id, label, icalUrl: validateGoogleCalendarIcalUrl(raw) };
    } catch {
      // A configured but invalid feed is a failed source, not an absent source.
      return { id, label, icalUrl: null };
    }
  }).filter(Boolean);
}

function mergedItemSortKey(item) {
  return Date.parse(item.start.dateTime || `${item.start.date}T00:00:00+09:00`);
}

export async function listMergedGoogleCalendarSourceEvents({
  timeMin,
  timeMax,
  maxResults = 60,
  sources = resolveGoogleCalendarSources(),
  fetchImpl = fetch,
}) {
  if (!sources.length) {
    return { ok: false, status: "preview", items: [], sources: [] };
  }

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const read = await listGoogleCalendarIcalEvents({
          feedUrl: source.icalUrl,
          timeMin,
          timeMax,
          maxResults,
          fetchImpl,
        });

        return {
          id: source.id,
          label: source.label,
          status: read.coverage.complete ? "live" : "partial",
          coverage: read.coverage,
          items: read.items.map((item) => ({ ...item, source: source.id, sourceLabel: source.label })),
        };
      } catch (error) {
        return {
          id: source.id,
          label: source.label,
          status: "error",
          detail: error instanceof Error ? error.message : String(error),
          items: [],
        };
      }
    }),
  );

  const liveCount = results.filter((result) => result.status === "live").length;
  const readableCount = results.filter((result) => result.status !== "error").length;
  const items = results
    .flatMap((result) => result.items)
    .sort((a, b) => mergedItemSortKey(a) - mergedItemSortKey(b) || a.id.localeCompare(b.id));

  return {
    ok: readableCount > 0,
    status: readableCount === 0 ? "error" : liveCount === results.length ? "live" : "partial",
    items,
    coverage: calendarCoverage(items, liveCount === results.length, { truncated: results.some(result => result.coverage?.truncated) }),
    sources: results.map(({ id, label, status, detail }) => ({
      id,
      label,
      status,
      ...(detail ? { detail } : {}),
    })),
  };
}

export async function readGoogleCalendarEventsWithIcalFallback({ readOAuth, readIcal }) {
  const oauthResult = await readOAuth();

  if (oauthResult.ok) {
    return {
      ...oauthResult,
      source: "oauth",
      readOnly: false,
    };
  }

  const canUseIcal =
    typeof readIcal === "function" &&
    ["missing-connection", "missing-access-token"].includes(oauthResult.reason);

  if (!canUseIcal) {
    return oauthResult;
  }

  try {
    return await readIcal();
  } catch {
    return {
      ok: false,
      reason: "Google Calendar iCal feed could not be read.",
      source: "ical",
      readOnly: true,
      items: [],
      connection: null,
    };
  }
}
