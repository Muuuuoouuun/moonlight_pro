import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listGoogleCalendarIcalEvents,
  listMergedGoogleCalendarSourceEvents,
  parseGoogleCalendarIcal,
  readGoogleCalendarEventsWithIcalFallback,
  resolveGoogleCalendarSources,
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

test("resolveGoogleCalendarSources retains invalid configured sources as failures without exposing their URL", () => {
  const original = {
    personal: process.env.GOOGLE_CALENDAR_ICAL_ID_MOON,
    company: process.env.GOOGLE_CALENDAR_ICAL_ID_CLE_MOON,
  };

  try {
    process.env.GOOGLE_CALENDAR_ICAL_ID_MOON =
      "https://calendar.google.com/calendar/ical/personal%40example.com/private-token/basic.ics";
    delete process.env.GOOGLE_CALENDAR_ICAL_ID_CLE_MOON;

    assert.deepEqual(resolveGoogleCalendarSources(), [
      {
        id: "personal",
        label: "Personal",
        icalUrl: "https://calendar.google.com/calendar/ical/personal%40example.com/private-token/basic.ics",
      },
    ]);

    process.env.GOOGLE_CALENDAR_ICAL_ID_CLE_MOON = "not-a-valid-url";
    assert.deepEqual(
      resolveGoogleCalendarSources().map((source) => source.id),
      ["personal", "company"],
    );
    assert.deepEqual(resolveGoogleCalendarSources()[1], { id: "company", label: "Company", icalUrl: null });
  } finally {
    if (original.personal === undefined) delete process.env.GOOGLE_CALENDAR_ICAL_ID_MOON;
    else process.env.GOOGLE_CALENDAR_ICAL_ID_MOON = original.personal;
    if (original.company === undefined) delete process.env.GOOGLE_CALENDAR_ICAL_ID_CLE_MOON;
    else process.env.GOOGLE_CALENDAR_ICAL_ID_CLE_MOON = original.company;
  }
});

test("actual iCal read and merged feeds retain the complete bounded window beyond former 50/250 caps", async () => {
  const start = Date.parse("2026-10-20T00:00:00Z");
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0"];
  for (let i = 0; i < 300; i++) lines.push(
    "BEGIN:VEVENT", `UID:window-${i}`, `DTSTART:${stamp(start + i * 60_000)}`,
    `DTEND:${stamp(start + (i + 1) * 60_000)}`, "SUMMARY:synthetic", "END:VEVENT",
  );
  lines.push("END:VCALENDAR");
  const fetchImpl = async () => new Response(lines.join("\r\n"));
  const source = { id: "personal", label: "Personal", icalUrl: "https://calendar.google.com/calendar/ical/test/basic.ics" };
  const result = await listMergedGoogleCalendarSourceEvents({
    timeMin: "2026-10-19T15:00:00Z", timeMax: "2026-10-20T15:00:00Z", maxResults: 50,
    sources: [source], fetchImpl,
  });
  assert.equal(result.items.length, 300);
  assert.equal(result.coverage.totalCount, 300);
  assert.equal(result.coverage.complete, true);
});

function feedWithEvent({ uid, title, startAt, endAt }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moonlight Test//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20260713T000000Z",
    `DTSTART:${startAt}`,
    `DTEND:${endAt}`,
    `SUMMARY:${title}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

test("merges live personal and company sources, tagging each event with its source", async () => {
  const sources = [
    { id: "personal", label: "Personal", icalUrl: "https://calendar.google.com/calendar/ical/p%40example.com/private-a/basic.ics" },
    { id: "company", label: "Company", icalUrl: "https://calendar.google.com/calendar/ical/c%40example.com/private-b/basic.ics" },
  ];
  const feeds = {
    [sources[0].icalUrl]: feedWithEvent({ uid: "p1@example.com", title: "Dinner", startAt: "20260714T100000Z", endAt: "20260714T110000Z" }),
    [sources[1].icalUrl]: feedWithEvent({ uid: "c1@example.com", title: "Standup", startAt: "20260714T010000Z", endAt: "20260714T013000Z" }),
  };
  const fetchImpl = async (url) =>
    new Response(feeds[url], { status: 200, headers: { "content-type": "text/calendar" } });

  const result = await listMergedGoogleCalendarSourceEvents({
    timeMin: "2026-07-13T00:00:00Z",
    timeMax: "2026-07-20T00:00:00Z",
    sources,
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "live");
  assert.deepEqual(
    result.items.map((item) => ({ title: item.summary, source: item.source })),
    [
      { title: "Standup", source: "company" },
      { title: "Dinner", source: "personal" },
    ],
  );
  assert.deepEqual(result.sources, [
    { id: "personal", label: "Personal", status: "live" },
    { id: "company", label: "Company", status: "live" },
  ]);
});

test("reports partial status when only one configured source is reachable", async () => {
  const sources = [
    { id: "personal", label: "Personal", icalUrl: "https://calendar.google.com/calendar/ical/p%40example.com/private-a/basic.ics" },
    { id: "company", label: "Company", icalUrl: "https://calendar.google.com/calendar/ical/c%40example.com/private-b/basic.ics" },
  ];
  const fetchImpl = async (url) => {
    if (url === sources[0].icalUrl) {
      return new Response(
        feedWithEvent({ uid: "p1@example.com", title: "Dinner", startAt: "20260714T100000Z", endAt: "20260714T110000Z" }),
        { status: 200, headers: { "content-type": "text/calendar" } },
      );
    }
    return new Response("", { status: 404 });
  };

  const result = await listMergedGoogleCalendarSourceEvents({
    timeMin: "2026-07-13T00:00:00Z",
    timeMax: "2026-07-20T00:00:00Z",
    sources,
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "partial");
  assert.equal(result.items.length, 1);
  assert.equal(result.sources.find((s) => s.id === "company").status, "error");
});

test("returns preview status with no configured sources", async () => {
  const result = await listMergedGoogleCalendarSourceEvents({
    timeMin: "2026-07-13T00:00:00Z",
    timeMax: "2026-07-20T00:00:00Z",
    sources: [],
  });

  assert.deepEqual(result, { ok: false, status: "preview", items: [], sources: [] });
});

test("retained iCal row and byte ceilings are explicit partial reads, never exact totals", async () => {
  const prefix = ["BEGIN:VCALENDAR", "VERSION:2.0"];
  const eventLines = (id, description = "") => [
    "BEGIN:VEVENT", `UID:${id}`, "DTSTART:20261020T010000Z", "DTEND:20261020T020000Z",
    "SUMMARY:synthetic", ...(description ? [`DESCRIPTION:${description}`] : []), "END:VEVENT",
  ];
  const rowFeed = [...prefix, ...Array.from({ length: 1001 }, (_, i) => eventLines(`row-${i}`)).flat(), "END:VCALENDAR"].join("\r\n");
  const hugeFeed = [...prefix, ...eventLines("large", "x".repeat(1024 * 1024)), "END:VCALENDAR"].join("\r\n");
  for (const [body, expectedCount] of [[rowFeed, 1000], [hugeFeed, 0]]) {
    const read = await listGoogleCalendarIcalEvents({
      feedUrl: "https://calendar.google.com/calendar/ical/test/basic.ics",
      timeMin: "2026-10-19T15:00:00Z", timeMax: "2026-10-20T15:00:00Z",
      fetchImpl: async () => new Response(body),
    });
    assert.equal(read.ok, true);
    assert.equal(read.items.length, expectedCount);
    assert.equal(read.reason, "partial-source-failure");
    assert.equal(read.coverage.reason, "ical-retained-budget");
    assert.equal(read.coverage.totalCount, null);
    assert.equal(read.coverage.truncated, true);
    assert.ok(read.coverage.retainedBytes <= read.coverage.limits.maxBytes);
  }
});

test("high-frequency and large-window recurrences are refused before unbounded expansion", async () => {
  const { default: ical } = await import("node-ical");
  const expand = ical.expandRecurringEvent;
  let expandedRecurrences = 0;
  ical.expandRecurringEvent = (event, options) => {
    if (event.rrule) { expandedRecurrences++; assert.fail("expensive recurrence must not expand"); }
    return expand(event, options);
  };
  try {
    for (const [rule, timeMax] of [["FREQ=SECONDLY", "2026-10-21T00:00:00Z"], ["FREQ=DAILY", "2036-10-20T00:00:00Z"]]) {
      const body = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:expensive",
        "DTSTART:20261020T010000Z", "DTEND:20261020T010001Z", `RRULE:${rule}`, "SUMMARY:synthetic", "END:VEVENT",
        "BEGIN:VEVENT", "UID:ordinary", "DTSTART:20261020T020000Z", "DTEND:20261020T030000Z", "SUMMARY:readable", "END:VEVENT", "END:VCALENDAR",
      ].join("\r\n");
      const read = await listMergedGoogleCalendarSourceEvents({
        sources: [{ id: "personal", label: "Personal", icalUrl: "https://calendar.google.com/calendar/ical/test/basic.ics" }],
        timeMin: "2026-10-20T00:00:00Z", timeMax, fetchImpl: async () => new Response(body),
      });
      assert.equal(read.ok, true);
      assert.equal(read.status, "partial");
      assert.deepEqual(read.items.map(item => item.id), ["ordinary"]);
      assert.equal(read.sources[0].status, "partial");
      assert.equal(read.coverage.complete, false);
      assert.equal(read.coverage.totalCount, null);
      assert.equal(read.coverage.truncated, true);
    }
    assert.equal(expandedRecurrences, 0);
  } finally { ical.expandRecurringEvent = expand; }
});

test("iCal all-day dates respect the KST day window rather than the server timezone", async () => {
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0",
    ...[19, 20, 21].flatMap(day => ["BEGIN:VEVENT", `UID:day-${day}`, `DTSTART;VALUE=DATE:202610${day}`, `DTEND;VALUE=DATE:202610${day + 1}`, "SUMMARY:synthetic", "END:VEVENT"]),
    "END:VCALENDAR"].join("\r\n");
  const read = await listGoogleCalendarIcalEvents({
    feedUrl: "https://calendar.google.com/calendar/ical/test/basic.ics",
    timeMin: "2026-10-20T00:00:00+09:00", timeMax: "2026-10-21T00:00:00+09:00",
    fetchImpl: async () => new Response(body),
  });
  assert.deepEqual(read.items.map(item => item.start.date), ["2026-10-20"]);
  assert.equal(read.coverage.totalCount, 1);
});

test("recurring all-day instances use KST-exclusive date boundaries", async () => {
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:recurring-days",
    "DTSTART;VALUE=DATE:20261019", "DTEND;VALUE=DATE:20261020", "RRULE:FREQ=DAILY;COUNT=3",
    "SUMMARY:synthetic", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const read = await listGoogleCalendarIcalEvents({
    feedUrl: "https://calendar.google.com/calendar/ical/test/basic.ics",
    timeMin: "2026-10-20T00:00:00+09:00", timeMax: "2026-10-21T00:00:00+09:00",
    fetchImpl: async () => new Response(body),
  });
  assert.deepEqual(read.items.map(item => item.start.date), ["2026-10-20"]);
  assert.equal(read.coverage.totalCount, 1);
});
