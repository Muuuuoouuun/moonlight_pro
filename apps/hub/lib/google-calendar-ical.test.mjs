import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listGoogleCalendarIcalEvents,
  parseGoogleCalendarIcal,
  readGoogleCalendarEventsWithIcalFallback,
  validateGoogleCalendarIcalUrl,
} from "./google-calendar-ical.js";

test("accepts only Google Calendar HTTPS iCal feed URLs", () => {
  const privateUrl = "https://calendar.google.com/calendar/ical/user%40example.com/private-token/basic.ics";

  assert.equal(validateGoogleCalendarIcalUrl(privateUrl), privateUrl);
  assert.throws(
    () => validateGoogleCalendarIcalUrl("http://calendar.google.com/calendar/ical/user/basic.ics"),
    /HTTPS/,
  );
  assert.throws(
    () => validateGoogleCalendarIcalUrl("https://example.com/calendar.ics"),
    /Google Calendar/,
  );
});

test("parses bounded timed and all-day events without leaking the feed URL", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moonlight Test//EN",
    "BEGIN:VEVENT",
    "UID:timed@example.com",
    "DTSTAMP:20260713T000000Z",
    "DTSTART:20260714T010000Z",
    "DTEND:20260714T020000Z",
    "SUMMARY:Customer meeting",
    "LOCATION:Seoul showroom",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:all-day@example.com",
    "DTSTAMP:20260713T000000Z",
    "DTSTART;VALUE=DATE:20260715",
    "DTEND;VALUE=DATE:20260716",
    "SUMMARY:Personal day",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:outside@example.com",
    "DTSTAMP:20260713T000000Z",
    "DTSTART:20260814T010000Z",
    "DTEND:20260814T020000Z",
    "SUMMARY:Outside range",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:cancelled@example.com",
    "DTSTAMP:20260713T000000Z",
    "DTSTART:20260716T010000Z",
    "DTEND:20260716T020000Z",
    "SUMMARY:Cancelled meeting",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const events = parseGoogleCalendarIcal(feed, {
    timeMin: "2026-07-13T00:00:00+09:00",
    timeMax: "2026-07-20T00:00:00+09:00",
    maxResults: 20,
  });

  assert.deepEqual(
    events.map((event) => ({
      id: event.id,
      title: event.summary,
      start: event.start,
      end: event.end,
    })),
    [
      {
        id: "timed@example.com",
        title: "Customer meeting",
        start: { dateTime: "2026-07-14T01:00:00.000Z" },
        end: { dateTime: "2026-07-14T02:00:00.000Z" },
      },
      {
        id: "all-day@example.com",
        title: "Personal day",
        start: { date: "2026-07-15" },
        end: { date: "2026-07-16" },
      },
    ],
  );
  assert.equal(JSON.stringify(events).includes("private-token"), false);
});

test("expands recurring events inside the requested window", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moonlight Test//EN",
    "BEGIN:VEVENT",
    "UID:weekly@example.com",
    "DTSTAMP:20260701T000000Z",
    "DTSTART:20260713T010000Z",
    "DTEND:20260713T013000Z",
    "RRULE:FREQ=WEEKLY;COUNT=3",
    "SUMMARY:Weekly sync",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const events = parseGoogleCalendarIcal(feed, {
    timeMin: "2026-07-19T00:00:00Z",
    timeMax: "2026-08-01T00:00:00Z",
    maxResults: 20,
  });

  assert.deepEqual(
    events.map((event) => ({ id: event.id, start: event.start.dateTime })),
    [
      { id: "weekly@example.com:2026-07-20T01:00:00.000Z", start: "2026-07-20T01:00:00.000Z" },
      { id: "weekly@example.com:2026-07-27T01:00:00.000Z", start: "2026-07-27T01:00:00.000Z" },
    ],
  );
});

test("fetches an iCal feed without caching and returns an honest read-only source", async () => {
  const feedUrl = "https://calendar.google.com/calendar/ical/user%40example.com/private-token/basic.ics";
  const feed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moonlight Test//EN",
    "BEGIN:VEVENT",
    "UID:event@example.com",
    "DTSTAMP:20260713T000000Z",
    "DTSTART:20260714T010000Z",
    "DTEND:20260714T020000Z",
    "SUMMARY:Live event",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(feed, {
      status: 200,
      headers: { "content-type": "text/calendar; charset=utf-8" },
    });
  };

  const result = await listGoogleCalendarIcalEvents({
    feedUrl,
    timeMin: "2026-07-13T00:00:00Z",
    timeMax: "2026-07-20T00:00:00Z",
    maxResults: 20,
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "ical");
  assert.equal(result.readOnly, true);
  assert.equal(result.items.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(JSON.stringify(result).includes("private-token"), false);
});

test("uses the read-only iCal source only when OAuth is not connected", async () => {
  let iCalReads = 0;
  const result = await readGoogleCalendarEventsWithIcalFallback({
    readOAuth: async () => ({ ok: false, reason: "missing-connection", items: [] }),
    readIcal: async () => {
      iCalReads += 1;
      return { ok: true, reason: "ok", source: "ical", readOnly: true, items: [{ id: "ical-event" }] };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "ical");
  assert.equal(result.readOnly, true);
  assert.equal(iCalReads, 1);
});

test("keeps OAuth API failures visible instead of masking them with iCal", async () => {
  let iCalReads = 0;
  const result = await readGoogleCalendarEventsWithIcalFallback({
    readOAuth: async () => ({ ok: false, reason: "Google API 503", items: [] }),
    readIcal: async () => {
      iCalReads += 1;
      return { ok: true, source: "ical", readOnly: true, items: [] };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "Google API 503");
  assert.equal(iCalReads, 0);
});
