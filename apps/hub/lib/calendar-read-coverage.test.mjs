import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarReadIsPartial, readCalendarEventPages } from "./calendar-read-coverage.js";
import { readCombinedGoogleCalendarEvents } from "./google-calendar.js";
import { buildDailyFocus } from "./daily-focus.js";
import { todayAgendaRows, collapsedTodayAgendaRows } from "../components/hub/pages/workflow-reading.js";

const event = (id, at = "2026-10-20T08:00:00+09:00") => ({ id, start: { dateTime: at } });
const noFeeds = async () => ({ ok: false, status: "preview", items: [], sources: [] });

test("50 past rows plus a later next appointment traverse pages into Today, preserving provider IDs", async () => {
  const input = [...Array.from({ length: 50 }, (_, i) => event(`past-${i}`)), event("next", "2026-10-20T17:00:00+09:00")];
  const tokens = [];
  const calendar = await readCombinedGoogleCalendarEvents({
    maxResults: 50,
    readOauth: async () => ({
      ...await readCalendarEventPages({ readPage: async token => {
        tokens.push(token);
        return token ? { items: input.slice(50) } : { items: input.slice(0, 50), nextPageToken: "next-page" };
      } }),
      calendarId: "synthetic",
    }),
    readMergedSources: noFeeds,
  });
  const now = new Date("2026-10-20T16:30:00+09:00");
  const agenda = buildDailyFocus({ calendar, now }).todayAgenda;
  const rows = todayAgendaRows(agenda.items, now);
  assert.deepEqual(tokens, [undefined, "next-page"]);
  assert.deepEqual(agenda.items.map(item => item.id), input.map(item => item.id));
  assert.equal(agenda.state, "live");
  assert.equal(agenda.coverage.totalCount, 51);
  assert.equal(rows.find(row => row.next)?.event.id, "next");
  assert.ok(collapsedTodayAgendaRows(rows).some(row => row.event.id === "next"));
  assert.equal(new Set(agenda.items.map(item => item.outcomeKey)).size, 51);
});

test("empty and short pages with continuation are not exhausted; duplicate IDs keep the latest record", async () => {
  const pages = [
    { items: [], nextPageToken: "a" },
    { items: [event("same")], nextPageToken: "b" },
    { items: [{ ...event("same"), summary: "Updated" }, event("other")] },
  ];
  const result = await readCalendarEventPages({ readPage: async () => pages.shift() });
  assert.equal(result.coverage.complete, true);
  assert.equal(result.coverage.pagesRead, 3);
  assert.equal(result.coverage.totalCount, 2);
  assert.equal(result.items[0].summary, "Updated");
});

test("a later-page failure preserves read rows as partial, while a first-page failure is error", async () => {
  let calls = 0;
  const result = await readCalendarEventPages({ readPage: async () => {
    if (++calls === 1) return { items: [event("read")], nextPageToken: "later" };
    throw new Error("synthetic transport failure");
  } });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "partial-source-failure");
  assert.equal(result.coverage.totalCount, null);
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.items.map(item => item.id), ["read"]);
  const first = await readCalendarEventPages({ readPage: async () => { throw new Error("offline"); } });
  assert.equal(first.ok, false);
  assert.equal(first.reason, "calendar-read-failed");
});

test("page budget, cycle, invalid page and abort fail closed without retrying or inventing totals", async () => {
  let calls = 0;
  const budget = await readCalendarEventPages({ maxPages: 2, readPage: async () => ({
    items: [event(`read-${++calls}`)], nextPageToken: `page-${calls}`,
  }) });
  assert.equal(calls, 2);
  assert.equal(budget.coverage.reason, "calendar-page-budget");
  assert.equal(budget.coverage.truncated, true);
  assert.equal(budget.coverage.totalCount, null);
  calls = 0;
  const cycle = await readCalendarEventPages({ readPage: async () => {
    calls++; return { items: [], nextPageToken: "repeated" };
  } });
  assert.equal(calls, 2);
  assert.equal(cycle.coverage.reason, "calendar-page-cycle");
  assert.equal((await readCalendarEventPages({ readPage: async () => ({ items: "not-an-array" }) })).ok, false);
  const controller = new AbortController();
  controller.abort();
  const aborted = await readCalendarEventPages({ signal: controller.signal, readPage: async () => assert.fail("no request after abort") });
  assert.equal(aborted.coverage.reason, "calendar-read-timeout");
});

test("OAuth success cannot hide feed failure, and feed success cannot hide configured OAuth failure", async () => {
  for (const [oauth, feeds] of [
    [{ ok: true, items: [event("oauth")] }, { ok: false, status: "error", items: [], sources: [] }],
    [{ ok: false, reason: "calendar-read-failed", items: [] }, { ok: true, status: "live", items: [event("feed")], sources: [] }],
    [{ ok: true, items: [], coverage: { complete: false, truncated: true } }, { ok: true, status: "live", items: [], sources: [] }],
    [{ ok: true, items: [], nextPageToken: "legacy-page" }, { ok: false, status: "preview", items: [], sources: [] }],
  ]) {
    const result = await readCombinedGoogleCalendarEvents({ readOauth: async () => oauth, readMergedSources: async () => feeds });
    assert.equal(result.reason, "partial-source-failure");
    assert.equal(result.coverage.complete, false);
    assert.equal(result.coverage.totalCount, null);
    assert.equal(buildDailyFocus({ calendar: result }).todayAgenda.state, "partial");
  }
  const failed = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: false, reason: "missing-connection", items: [] }),
    readMergedSources: async () => ({ ok: false, status: "error", items: [], sources: [] }),
  });
  assert.equal(failed.reason, "calendar-read-failed");
});

test("a throwing source does not discard successful rows from the other source", async () => {
  const result = await readCombinedGoogleCalendarEvents({
    readOauth: async () => { throw new Error("synthetic failure"); },
    readMergedSources: async () => ({ ok: true, status: "live", items: [event("read")], sources: [] }),
  });
  assert.equal(result.items.length, 1);
  assert.equal(calendarReadIsPartial(result), true);
});


test("late page resolution after abort never becomes a complete read", async () => {
  const controller = new AbortController();
  let calls = 0;
  const read = await readCalendarEventPages({ signal: controller.signal, readPage: async () => {
    if (++calls === 1) return { items: [event("before-abort")], nextPageToken: "late" };
    controller.abort();
    return { items: [event("too-late")] };
  } });
  assert.equal(read.reason, "partial-source-failure");
  assert.equal(read.coverage.reason, "calendar-read-timeout");
  assert.equal(read.coverage.totalCount, null);
  assert.deepEqual(read.items.map(item => item.id), ["before-abort"]);
  const first = new AbortController();
  const lateFirst = await readCalendarEventPages({ signal: first.signal, readPage: async () => {
    first.abort(); return { items: [] };
  } });
  assert.equal(lateFirst.ok, false);
  assert.equal(lateFirst.coverage.complete, false);
});

test("provider and combined retained budgets stay partial even when transport is exhausted", async () => {
  const input = Array.from({ length: 1001 }, (_, i) => event(`row-${i}`));
  const provider = await readCalendarEventPages({ readPage: async () => ({ items: input }) });
  assert.equal(provider.items.length, 1000);
  assert.equal(provider.coverage.reason, "calendar-retained-budget");
  assert.equal(provider.coverage.complete, false);
  assert.equal(provider.coverage.totalCount, null);
  const bytes = await readCalendarEventPages({ readPage: async () => ({ items: [{ ...event("oversized"), description: "x".repeat(1024 * 1024) }] }) });
  assert.equal(bytes.ok, true);
  assert.equal(bytes.items.length, 0);
  assert.equal(bytes.coverage.truncated, true);
  const combined = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: true, items: input.slice(0, 600) }),
    readMergedSources: async () => ({ ok: true, status: "live", sources: [], items: input.slice(600) }),
  });
  assert.equal(combined.items.length, 1000);
  assert.equal(combined.coverage.complete, false);
  assert.equal(combined.coverage.totalCount, null);
  assert.equal(combined.coverage.truncated, true);
});

test("complete combined totals describe unique post-dedup window rows", async () => {
  const shared = { ...event("oauth-id"), iCalUID: "same@example.test" };
  const read = await readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: true, items: [shared] }),
    readMergedSources: async () => ({ ok: true, status: "live", sources: [], items: [{ ...shared, id: "feed-id", source: "personal" }] }),
  });
  assert.equal(read.items.length, 1);
  assert.equal(read.coverage.totalCount, 1);
  assert.equal(read.coverage.returnedCount, 1);
  assert.equal(read.coverage.complete, true);
});

test("combined window chronology compares instants, not offset strings", async () => {
  const rows = [
    event("later", "2026-10-20T00:30:00Z"), event("earlier", "2026-10-20T09:00:00+09:00"),
    { id: "all-day", start: { date: "2026-10-20" } },
  ];
  const read = await readCombinedGoogleCalendarEvents({ readOauth: async () => ({ ok: true, items: rows }), readMergedSources: noFeeds });
  assert.deepEqual(read.items.map(item => item.id), ["all-day", "earlier", "later"]);
});
