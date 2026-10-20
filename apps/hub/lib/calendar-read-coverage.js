// Safety ceilings are not completeness claims. Callers must expose partial coverage
// and access to the original calendar whenever a ceiling is reached.
export const CALENDAR_READ_LIMITS = Object.freeze({ maxItems: 1000, maxBytes: 1024 * 1024 });
const utf8 = new TextEncoder();
export const calendarItemBytes = item => utf8.encode(JSON.stringify(item)).byteLength;

export function boundCalendarItems(input) {
  const items = [];
  let retainedBytes = 2;
  for (const item of input) {
    const bytes = calendarItemBytes(item) + (items.length ? 1 : 0);
    if (items.length >= CALENDAR_READ_LIMITS.maxItems || retainedBytes + bytes > CALENDAR_READ_LIMITS.maxBytes) {
      return { items, truncated: true, retainedBytes };
    }
    items.push(item);
    retainedBytes += bytes;
  }
  return { items, truncated: false, retainedBytes };
}

// A successful transport is not proof that the requested calendar window is complete.
export function calendarReadIsPartial(read) {
  return Boolean(read?.ok && (
    read.reason === "partial-source-failure"
    || read.coverage?.complete === false
    || read.coverage?.truncated
    || read.nextPageToken
  ));
}

export function calendarCoverage(items, complete, extra = {}) {
  return { complete, returnedCount: items.length, totalCount: complete ? items.length : null, ...extra };
}

// Bound both provider work and retained data. A short/empty page may still have a
// continuation: only absence of nextPageToken proves exhaustion (Google list API).
export async function readCalendarEventPages({ readPage, maxPages = 20, signal }) {
  const pageBudget = Math.max(1, Math.min(20, Math.floor(Number(maxPages) || 20)));
  const events = new Map();
  const tokens = new Set();
  let pageToken, pagesRead = 0, retainedBytes = 2;
  const result = (complete, reason = "ok", truncated = false) => {
    const items = [...events.values()];
    return {
      ok: pagesRead > 0, reason: complete ? "ok" : pagesRead ? "partial-source-failure" : "calendar-read-failed",
      items, coverage: calendarCoverage(items, complete, { pagesRead, truncated, reason, retainedBytes, limits: CALENDAR_READ_LIMITS }),
    };
  };
  while (pagesRead < pageBudget) {
    try {
      signal?.throwIfAborted();
      const page = await readPage(pageToken);
      // A transport may resolve after cancellation instead of rejecting.
      signal?.throwIfAborted();
      if (!page || (page.items !== undefined && !Array.isArray(page.items))
        || (page.nextPageToken !== undefined && typeof page.nextPageToken !== "string")) {
        return result(false, "invalid-calendar-page");
      }
      if ((page.items || []).some(event => !event?.id || !event?.start)) return result(false, "invalid-calendar-event");
      pagesRead += 1;
      for (const event of page.items || []) {
        const previous = events.get(event.id);
        const bytes = calendarItemBytes(event) - (previous ? calendarItemBytes(previous) : 0) + (!previous && events.size ? 1 : 0);
        if ((!previous && events.size >= CALENDAR_READ_LIMITS.maxItems) || retainedBytes + bytes > CALENDAR_READ_LIMITS.maxBytes) {
          return result(false, "calendar-retained-budget", true);
        }
        // Provider ID, not title/start, is stable across pages and updates.
        events.set(event.id, event);
        retainedBytes += bytes;
      }
      pageToken = page.nextPageToken || "";
      if (!pageToken) return result(true);
      if (tokens.has(pageToken)) return result(false, "calendar-page-cycle", true);
      tokens.add(pageToken);
    } catch {
      return result(false, signal?.aborted ? "calendar-read-timeout" : "calendar-page-read-failed");
    }
  }
  return result(false, "calendar-page-budget", true);
}
