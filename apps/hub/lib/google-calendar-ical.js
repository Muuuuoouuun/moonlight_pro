import ical from "node-ical";

const GOOGLE_CALENDAR_ICAL_HOSTS = new Set(["calendar.google.com", "www.google.com"]);
const MAX_ICAL_BYTES = 5 * 1024 * 1024;
const ICAL_FETCH_TIMEOUT_MS = 8_000;

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

  const uid = normalizeText(source.uid || event.uid) || `ical-${start.getTime()}`;
  const isRecurring = Boolean(event.rrule || source.recurrenceid);
  const allDay = Boolean(instance.isFullDay || source.start?.dateOnly || source.datetype === "date");
  // RECURRENCE-ID names the original slot even when this occurrence moves.
  const recurrenceId = asDate(source.recurrenceid);
  const occurrence = recurrenceId || start;
  const occurrenceAllDay = recurrenceId ? Boolean(source.recurrenceid.dateOnly) : allDay;
  const occurrenceKey = occurrenceAllDay ? formatLocalDate(occurrence) : occurrence.toISOString();

  return {
    id: isRecurring ? `${uid}:${occurrenceKey}` : uid,
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

export function parseGoogleCalendarIcal(text, { timeMin, timeMax, maxResults = 60 }) {
  const { min, max } = normalizeWindow({ timeMin, timeMax });
  const limit = Math.max(1, Math.min(Number(maxResults) || 60, 250));
  const parsed = ical.sync.parseICS(String(text || ""));
  const items = [];

  for (const component of Object.values(parsed)) {
    if (component?.type !== "VEVENT" || String(component.status || "").toUpperCase() === "CANCELLED") {
      continue;
    }

    const instances = ical.expandRecurringEvent(component, {
      from: min,
      to: max,
      includeOverrides: true,
      excludeExdates: true,
      expandOngoing: true,
    });

    for (const instance of instances) {
      const start = asDate(instance.start);
      const end = asDate(instance.end || instance.start);
      if (!start || !end || start >= max || end <= min) continue;

      const mapped = mapInstance(instance, component);
      if (mapped) items.push(mapped);
    }
  }

  return items
    .sort((a, b) => {
      const aStart = a.start.dateTime || `${a.start.date}T00:00:00`;
      const bStart = b.start.dateTime || `${b.start.date}T00:00:00`;
      return aStart.localeCompare(bStart) || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
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

    return {
      ok: true,
      reason: "ok",
      source: "ical",
      readOnly: true,
      items: parseGoogleCalendarIcal(body, { timeMin, timeMax, maxResults }),
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
      return null;
    }
  }).filter(Boolean);
}

function mergedItemSortKey(item) {
  return item.start.dateTime || `${item.start.date}T00:00:00`;
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
          status: "live",
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
  const items = results
    .flatMap((result) => result.items)
    .sort((a, b) => mergedItemSortKey(a).localeCompare(mergedItemSortKey(b)) || a.id.localeCompare(b.id))
    .slice(0, maxResults);

  return {
    ok: liveCount > 0,
    status: liveCount === 0 ? "error" : liveCount === results.length ? "live" : "partial",
    items,
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
