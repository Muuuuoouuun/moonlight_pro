import assert from "node:assert/strict";
import { test } from "node:test";

import { readCombinedGoogleCalendarEvents } from "./google-calendar.js";

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
