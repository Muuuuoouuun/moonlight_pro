import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDailyFocus } from "./daily-focus.js";
import { collapsedTodayAgendaRows, todayAgendaRows } from "../components/hub/pages/workflow-reading.js";

const NOW = "2026-10-20T16:30:00+09:00";
const ids = (items) => items.map((item) => item.id);
const timed = (id, at) => ({ id, summary: `합성 일정 ${id}`, start: { dateTime: at }, outcomeKey: `outcome-${id}` });
const focus = (items, now = NOW, extra = {}) => buildDailyFocus({
  calendar: { ok: true, items, ...extra }, now: new Date(now),
}).todayAgenda;

for (const count of [0, 1, 8, 9, 100]) {
  test(`today projection keeps all ${count} supplied same-day events in chronological order`, () => {
    const items = Array.from({ length: count }, (_, index) => timed(
      `event-${index}`, new Date(Date.parse("2026-10-20T09:00:00+09:00") + index * 60_000).toISOString(),
    ));
    const agenda = focus([...items].reverse());
    assert.equal(agenda.state, "live");
    assert.deepEqual(ids(agenda.items), ids(items));
    assert.deepEqual(agenda.items.map((item) => item.outcomeKey), items.map((item) => item.outcomeKey));
    assert.ok(agenda.items.every((item) => !("completed" in item) && !("endAt" in item)));
  });
}

test("the next appointment after eight past starts reaches the compact timeline", () => {
  const items = Array.from({ length: 9 }, (_, index) => timed(`event-${index}`, `2026-10-20T${String(index + 9).padStart(2, "0")}:00:00+09:00`));
  const agenda = focus(items);
  const rows = todayAgendaRows(agenda.items, new Date(NOW));
  assert.equal(rows.find((row) => row.next)?.event.id, "event-8");
  assert.ok(collapsedTodayAgendaRows(rows).some((row) => row.event.id === "event-8"));
  assert.equal(rows.find((row) => row.event.id === "event-7")?.label, "시작 시각 지남");
  assert.ok(rows.every((row) => !/진행 중|완료/.test(row.label)), "a start never establishes an end or completion");
});

test("many date-only all-day events cannot consume the next appointment's supply slot", () => {
  const allDay = Array.from({ length: 12 }, (_, index) => ({
    id: `all-${index}`, start: { date: "2026-10-20" }, end: { date: "2026-10-21" },
  }));
  const agenda = focus([timed("next", "2026-10-20T17:00:00+09:00"), ...allDay]);
  assert.deepEqual(ids(agenda.items), [...ids(allDay), "next"]);
  assert.ok(agenda.items.slice(0, 12).every((item) => item.allDay && item.whenLabel === "종일"));
  const rows = todayAgendaRows(agenda.items, new Date(NOW));
  assert.equal(rows.filter((row) => row.next).length, 1);
  assert.equal(rows.at(-1).event.id, "next");
  assert.ok(collapsedTodayAgendaRows(rows).some((row) => row.event.id === "next"));
});

test("KST midnight uses the operator day, not UTC or the timestamp's written date", () => {
  const items = [
    timed("before", "2026-10-19T14:59:59Z"),
    timed("start", "2026-10-19T15:00:00Z"),
    timed("last", "2026-10-20T14:59:59Z"),
    timed("tomorrow", "2026-10-20T15:00:00Z"),
    { id: "all-today", start: { date: "2026-10-20" } },
    { id: "all-before", start: { date: "2026-10-19" } },
    { id: "all-after", start: { date: "2026-10-21" } },
  ];
  for (const now of ["2026-10-19T15:00:00Z", "2026-10-20T14:59:59Z"]) {
    assert.deepEqual(ids(focus(items, now).items), ["all-today", "start", "last"]);
  }
  assert.deepEqual(ids(focus(items, "2026-10-20T15:00:00Z").items), ["all-after", "tomorrow"]);
});

test("different explicit offsets sort by instant and display in KST", () => {
  const agenda = focus([
    timed("late", "2026-10-20T00:30:00-07:00"),
    timed("early", "2026-10-20T09:30:00+09:00"),
    timed("middle", "2026-10-20T04:30:00+02:00"),
  ]);
  assert.deepEqual(ids(agenda.items), ["early", "middle", "late"]);
  assert.deepEqual(agenda.items.map((item) => item.whenLabel), ["09:30", "11:30", "16:30"]);
});

test("DST spring gap and repeated fall hour are distinct instants, with no local-clock inference", () => {
  for (const [items, now, labels] of [
    [[timed("after", "2026-03-08T03:30:00-04:00"), timed("before", "2026-03-08T01:30:00-05:00")],
      "2026-03-08T07:00:00Z", ["15:30", "16:30"]],
    [[timed("after", "2026-11-01T01:30:00-05:00"), timed("before", "2026-11-01T01:30:00-04:00")],
      "2026-11-01T06:00:00Z", ["14:30", "15:30"]],
  ]) {
    const agenda = focus(items, now);
    assert.deepEqual(ids(agenda.items), ["before", "after"]);
    assert.deepEqual(agenda.items.map((item) => item.whenLabel), labels);
    const rows = todayAgendaRows(agenda.items, new Date(now));
    assert.equal(rows.find((row) => row.next)?.event.id, "after");
    assert.deepEqual(rows.map((row) => row.label), ["시작 시각 지남", "다음 시작"]);
  }
});

test("an explicitly incomplete calendar stays partial, including when no today rows were read", () => {
  for (const items of [[], [timed("read", "2026-10-20T17:00:00+09:00")]]) {
    const agenda = focus(items, NOW, { reason: "partial-source-failure" });
    assert.equal(agenda.state, "partial");
    assert.equal(agenda.reason, "partial-source-failure");
    assert.equal(agenda.items.length, items.length);
  }
});

test('Today retains supplied all-day spans on each intersected KST day, with an exclusive end', () => {
  const trip = { id: 'trip', summary: '합성 현장 출장', start: { date: '2026-10-19' }, end: { date: '2026-10-22' }, outcomeKey: 'trip-key' };
  for (const day of ['2026-10-19', '2026-10-20', '2026-10-21']) {
    const agenda = focus([trip], `${day}T12:00:00+09:00`);
    assert.deepEqual(ids(agenda.items), ['trip']);
    assert.equal(agenda.items[0].whenAt, '2026-10-19');
    assert.equal(agenda.items[0].whenLabel, '종일');
    assert.equal(agenda.items[0].outcomeKey, 'trip-key');
  }
  for (const day of ['2026-10-18', '2026-10-22']) assert.deepEqual(focus([trip], `${day}T12:00:00+09:00`).items, []);
});

test('Today retains supplied cross-midnight travel without inventing ongoing or completed status', () => {
  const travel = { ...timed('travel', '2026-10-19T23:00:00+09:00'), end: { dateTime: '2026-10-20T07:30:00+09:00' } };
  for (const now of ['2026-10-20T07:00:00+09:00', '2026-10-20T16:30:00+09:00']) {
    const agenda = focus([travel], now);
    assert.deepEqual(ids(agenda.items), ['travel']);
    assert.equal(agenda.items[0].whenAt, travel.start.dateTime);
    assert.equal(agenda.items[0].whenLabel, '2026-10-19 23:00 시작');
    assert.equal(agenda.items[0].outcomeKey, travel.outcomeKey);
    assert.equal(todayAgendaRows(agenda.items, new Date(now))[0].label, '시작 시각 지남');
    assert.ok(!('endAt' in agenda.items[0]) && !('completed' in agenda.items[0]));
  }
});

test('day overlap uses exact KST instants across offsets and midnight boundaries', () => {
  const rows = [
    { ...timed('ends-at-midnight', '2026-10-19T14:00:00Z'), end: { dateTime: '2026-10-19T15:00:00Z' } },
    { ...timed('ends-after-midnight', '2026-10-19T23:00:00+09:00'), end: { dateTime: '2026-10-19T15:00:00.001Z' } },
    { ...timed('different-offset', '2026-10-19T07:00:00-07:00'), end: { dateTime: '2026-10-20T01:00:00+02:00' } },
    timed('starts-at-midnight', '2026-10-19T15:00:00Z'),
    timed('tomorrow-midnight', '2026-10-20T15:00:00Z'),
  ];
  const agenda = focus(rows);
  assert.deepEqual(new Set(ids(agenda.items)), new Set(['ends-after-midnight', 'different-offset', 'starts-at-midnight']));
  assert.equal(agenda.items.find(item => item.id === 'different-offset').whenLabel, '2026-10-19 23:00 시작');
});

test('missing/equal end does not fabricate carry-over duration for timed or all-day rows', () => {
  const rows = [timed('point', '2026-10-19T23:55:00+09:00'),
    { ...timed('equal', '2026-10-19T23:55:00+09:00'), end: { dateTime: '2026-10-19T23:55:00+09:00' } },
    { id: 'all-point', start: { date: '2026-10-19' } },
    { id: 'all-equal', start: { date: '2026-10-19' }, end: { date: '2026-10-19' } },
  ];
  assert.equal(focus(rows, '2026-10-19T23:56:00+09:00').items.length, 4);
  assert.equal(focus(rows, '2026-10-20T00:00:00+09:00').items.length, 0);
});

test('carried all-day context stays visible beside the next same-day start and keeps partial truth', () => {
  const trip = { id: 'trip', start: { date: '2026-10-19' }, end: { date: '2026-10-22' } };
  const agenda = focus([trip, ...Array.from({ length: 10 }, (_, i) => timed(`past-${i}`, `2026-10-20T09:${String(i).padStart(2, '0')}:00+09:00`)), timed('next', '2026-10-20T17:00:00+09:00')], NOW, { coverage: { complete: false } });
  const compact = collapsedTodayAgendaRows(todayAgendaRows(agenda.items, new Date(NOW)));
  assert.deepEqual(ids(compact.map(row => row.event)), ['trip', 'past-9', 'next']);
  assert.equal(agenda.state, 'partial');
  assert.equal(agenda.coverage.totalCount, null);
});

test('invalid date-only spans cannot create indefinite all-day carry-over', () => {
  for (const end of ['not-a-date', '2026-02-30', '2026-13-01', '2026-10-22T00:00:00Z']) {
    const event = { id: 'invalid-end', start: { date: '2026-10-19' }, end: { date: end } };
    assert.equal(focus([event], '2026-10-19T12:00:00+09:00').items.length, 1);
    assert.equal(focus([event], '2026-10-20T12:00:00+09:00').items.length, 0);
  }
  for (const start of ['not-a-date', '2026-02-30', '2026-13-01']) {
    assert.equal(focus([{ id: 'invalid-start', start: { date: start }, end: { date: '2026-12-31' } }]).items.length, 0);
  }
});
