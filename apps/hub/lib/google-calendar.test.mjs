import assert from "node:assert/strict";
import { test } from "node:test";

import { readCombinedGoogleCalendarEvents } from "./google-calendar.js";
import { parseGoogleCalendarIcal } from "./google-calendar-ical.js";

function event({ id, title, startAt, endAt, source }) {
  return {
    id,
    summary: title,
    start: { dateTime: startAt },
    end: { dateTime: endAt },
    ...(source ? { source } : {}),
  };
}

test("prefers OAuth events but still merges in Personal/Company sources when OAuth is connected", async () => {
  const result = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({
      ok: true,
      reason: "ok",
      source: "oauth",
      readOnly: false,
      calendarId: "primary",
      items: [event({ id: "o1", title: "OAuth meeting", startAt: "2026-07-14T02:00:00Z", endAt: "2026-07-14T03:00:00Z" })],
    }),
    readMergedSources: async () => ({
      ok: true,
      status: "live",
      items: [event({ id: "p1", title: "Dinner", startAt: "2026-07-14T10:00:00Z", endAt: "2026-07-14T11:00:00Z", source: "personal" })],
      sources: [
        { id: "personal", label: "Personal", status: "live" },
        { id: "company", label: "Company", status: "live" },
      ],
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "oauth");
  assert.equal(result.readOnly, false);
  assert.deepEqual(result.items.map((item) => item.id), ["o1", "p1"]);
});

test("falls back to Personal/Company sources when OAuth is not connected", async () => {
  const result = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: false, reason: "missing-connection", items: [], calendarId: "primary" }),
    readMergedSources: async () => ({
      ok: true,
      status: "live",
      items: [event({ id: "c1", title: "Standup", startAt: "2026-07-14T01:00:00Z", endAt: "2026-07-14T01:30:00Z", source: "company" })],
      sources: [{ id: "company", label: "Company", status: "live" }],
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "ok");
  assert.equal(result.source, "multi");
  assert.equal(result.readOnly, true);
  assert.equal(result.items.length, 1);
});

test("reports partial-source-failure without discarding the events that did load", async () => {
  const result = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: false, reason: "missing-connection", items: [], calendarId: "primary" }),
    readMergedSources: async () => ({
      ok: true,
      status: "partial",
      items: [event({ id: "c1", title: "Standup", startAt: "2026-07-14T01:00:00Z", endAt: "2026-07-14T01:30:00Z", source: "company" })],
      sources: [
        { id: "personal", label: "Personal", status: "error" },
        { id: "company", label: "Company", status: "live" },
      ],
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "partial-source-failure");
  assert.equal(result.items.length, 1);
});

test("surfaces the OAuth failure reason only when no calendar source has anything live", async () => {
  const result = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: false, reason: "calendar-read-failed", items: [], calendarId: "primary" }),
    readMergedSources: async () => ({ ok: false, status: "preview", items: [], sources: [] }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "calendar-read-failed");
  assert.equal(result.items.length, 0);
});

function readOverlappingCalendars(primary, subscribed, source = "oauth") {
  return readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: true, source, readOnly: source === "ical", calendarId: "primary", items: primary }),
    readMergedSources: async () => ({
      ok: true, status: "live", items: subscribed,
      sources: [{ id: "company", label: "Company", status: "live" }],
    }),
  });
}

function companyEvents(lines) {
  return parseGoogleCalendarIcal([
    "BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR",
  ].join("\r\n"), { timeMin: "2026-09-01T00:00:00Z", timeMax: "2026-10-01T00:00:00Z" })
    .map(item => ({ ...item, source: "company", sourceLabel: "Company" }));
}

test("shows a Google event only once across OAuth and iCal, preserving the write ID, outcome and feed label", async () => {
  const subscribed = companyEvents([
    "BEGIN:VEVENT", "UID:meeting@google.com", "DTSTART:20260922T020000Z",
    "DTEND:20260922T030000Z", "SUMMARY:Earlier title", "END:VEVENT",
  ]);
  const primary = [{
    id: "meeting", iCalUID: "meeting@google.com", summary: "Updated title",
    start: { dateTime: "2026-09-22T11:00:00+09:00" },
    end: { dateTime: "2026-09-22T12:00:00+09:00" },
    htmlLink: "https://calendar.google.com/calendar/event?eid=meeting",
  }];
  const before = await readOverlappingCalendars(primary, []);
  const result = await readOverlappingCalendars(primary, subscribed);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], { ...before.items[0], source: "company", sourceLabel: "Company" });
  assert.equal(result.readOnly, false);
});

test("keeps separate events with the same title and time, including events without a shared UID", async () => {
  const primary = [{ id: "first", iCalUID: "first@example.com", summary: "Meeting", start: { date: "2026-09-22" } }];
  for (const iCalUID of ["second@example.com", undefined]) {
    const subscribed = [{ ...primary[0], id: "second", iCalUID, source: "company" }];
    const result = await readOverlappingCalendars(primary, subscribed);
    assert.equal(result.items.length, 2);
    assert.notEqual(result.items[0].outcomeKey, result.items[1].outcomeKey);
  }
});

test("matches recurring copies by the original instant, including moved occurrences and timezone offsets", async () => {
  const subscribed = companyEvents([
    "BEGIN:VEVENT", "UID:weekly@example.com", "DTSTART:20260922T010000Z",
    "DTEND:20260922T020000Z", "RRULE:FREQ=WEEKLY;COUNT=2", "SUMMARY:Weekly", "END:VEVENT",
    "BEGIN:VEVENT", "UID:weekly@example.com", "RECURRENCE-ID:20260922T010000Z",
    "DTSTART:20260922T030000Z", "DURATION:PT1H", "SUMMARY:Moved weekly", "END:VEVENT",
  ]);
  const primary = [22, 29].map(day => ({
    id: `weekly_${day}`, iCalUID: "weekly@example.com", recurringEventId: "weekly",
    originalStartTime: { dateTime: `2026-09-${day}T10:00:00+09:00` },
    summary: "Weekly", start: { dateTime: `2026-09-${day}T${day === 22 ? "12" : "10"}:00:00+09:00` },
  }));
  const before = await readOverlappingCalendars(primary, []);
  const result = await readOverlappingCalendars(primary, subscribed);
  assert.deepEqual(result.items.map(item => item.id), ["weekly_22", "weekly_29"]);
  assert.deepEqual(result.items.map(item => item.outcomeKey), before.items.map(item => item.outcomeKey));
  assert.notEqual(result.items[0].outcomeKey, result.items[1].outcomeKey);
});

test("deduplicates all-day recurring copies while retaining each day", async () => {
  const subscribed = companyEvents([
    "BEGIN:VEVENT", "UID:daily@example.com", "DTSTART;VALUE=DATE:20260922",
    "DTEND;VALUE=DATE:20260923", "RRULE:FREQ=DAILY;COUNT=2", "SUMMARY:Daily", "END:VEVENT",
  ]);
  const primary = [22, 23].map(day => ({
    id: `daily_${day}`, iCalUID: "daily@example.com", recurringEventId: "daily",
    originalStartTime: { date: `2026-09-${day}` }, start: { date: `2026-09-${day}` },
  }));
  const result = await readOverlappingCalendars(primary, subscribed);
  assert.deepEqual(result.items.map(item => item.id), ["daily_22", "daily_23"]);
});

test("deduplicates a default iCal fallback also configured as a company subscription", async () => {
  const subscribed = companyEvents([
    "BEGIN:VEVENT", "UID:fallback@example.com", "DTSTART:20260922T020000Z",
    "DTEND:20260922T030000Z", "SUMMARY:Meeting", "END:VEVENT",
  ]);
  const primary = subscribed.map(({ source, sourceLabel, ...item }) => item);
  const before = await readOverlappingCalendars(primary, [], "ical");
  const result = await readOverlappingCalendars(primary, subscribed, "ical");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].outcomeKey, before.items[0].outcomeKey);
  assert.equal(result.items[0].source, "company");
  assert.equal(result.source, "ical");
  assert.equal(result.readOnly, true);
});

test("does not collapse unrelated personal and company outcome histories when OAuth is unavailable", async () => {
  const shared = { id: "shared", iCalUID: "shared@example.com", start: { date: "2026-09-22" } };
  const result = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: false, items: [] }),
    readMergedSources: async () => ({ ok: true, sources: [], items: [
      { ...shared, source: "personal" }, { ...shared, source: "company" },
    ] }),
  });
  assert.equal(result.items.length, 2);
  assert.notEqual(result.items[0].outcomeKey, result.items[1].outcomeKey);
});
