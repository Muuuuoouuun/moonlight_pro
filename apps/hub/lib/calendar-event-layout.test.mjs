import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarEventCardGeometry, calendarGridRange, layoutCalendarEventSegments } from './calendar-event-view.js';

const row = (id, start, end, extra = {}) => ({ id, outcomeKey: `personal:${id}`, segmentKey: `personal:${id}:2026-10-05`, day: 0, start, end, ...extra });
const positions = events => events.map(event => [event.overlapColumn, event.overlapColumns]);

test('isolated and end-exclusive adjacent intervals retain one column', () => {
  assert.deepEqual(positions(layoutCalendarEventSegments([row('a', 9, 10), row('b', 10, 11), row('c', 13, 14)])), [[0, 1], [0, 1], [0, 1]]);
});

test('overlap allocation is independent for each visible day', () => {
  assert.deepEqual(positions(layoutCalendarEventSegments([row('a', 9, 10), row('b', 9, 10, { day: 1 })])), [[0, 1], [0, 1]]);
});

test('three simultaneous intervals occupy three distinct columns', () => {
  const rows = layoutCalendarEventSegments(['a', 'b', 'c'].map(id => row(id, 9, 10)));
  assert.deepEqual(positions(rows), [[0, 3], [1, 3], [2, 3]]);
});

test('a connected chain reuses ended columns and closes before the next group', () => {
  assert.deepEqual(positions(layoutCalendarEventSegments([row('a', 9, 10), row('b', 9.5, 10.5), row('c', 10, 11), row('d', 13, 14)])), [[0, 2], [1, 2], [0, 2], [0, 1]]);
});

test('allocation includes complete off-hours segments and their true overlap', () => {
  const rows = layoutCalendarEventSegments([row('all-day', 8, 9), row('overnight', 0, 10, { multiDay: true }), ...['a', 'b', 'c'].map(id => row(id, 0, 1, { multiDay: true }))]);
  assert.deepEqual(positions(rows), [[1, 4], [0, 4], [1, 4], [2, 4], [3, 4]]);
  assert.deepEqual(positions(layoutCalendarEventSegments([row('a', 19, 24, { multiDay: true }), row('b', 20, 21)])), [[0, 2], [1, 2]]);
});

test('layout preserves input order, identifiers, original times and provider objects', () => {
  const input = [row('later', 10, 12, { originalStart: '2026-10-05T10:00:00', originalEnd: '2026-10-05T12:00:00' }), row('earlier', 9, 11)];
  const before = JSON.stringify(input), rows = layoutCalendarEventSegments(input);
  assert.equal(JSON.stringify(input), before);
  rows.forEach((event, index) => {
    const preserved = { ...event };
    delete preserved.overlapColumn;
    delete preserved.overlapColumns;
    assert.deepEqual(preserved, input[index]);
  });
  assert.deepEqual(positions(rows), [[1, 2], [0, 2]]);
  assert.deepEqual(layoutCalendarEventSegments(null), []);
});


test('single-day off-hours events have independent overlap columns', () => {
  const rows = layoutCalendarEventSegments([row('visible', 8, 9), ...['a', 'b', 'c'].map(id => row(id, 1, 2)), row('late', 20, 21)]);
  assert.deepEqual(positions(rows), [[0, 1], [0, 3], [1, 3], [2, 3], [0, 1]]);
});

test('quarter-hour adjacency allocates for actual 44px rectangles, including mixed long/short chains', () => {
  const rows = layoutCalendarEventSegments([
    row('long', 9, 10), row('a', 9.25, 9.5), row('b', 9.5, 9.75), row('c', 9.75, 10), row('later', 13, 14),
  ]);
  assert.deepEqual(positions(rows), [[0, 4], [1, 4], [2, 4], [3, 4], [0, 1]]);
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
    if (rows[a].overlapColumn !== rows[b].overlapColumn) continue;
    const left = calendarEventCardGeometry(rows[a], 0), right = calendarEventCardGeometry(rows[b], 0);
    assert.ok(left.top + left.height <= right.top || right.top + right.height <= left.top);
  }
});

test('default/all-day-only range stays 08–20, while early and late starts expand only required hours', () => {
  assert.deepEqual(calendarGridRange([]), { startHour: 8, endHour: 20, height: 624, hours: Array.from({ length: 12 }, (_, i) => 8 + i) });
  assert.deepEqual(calendarGridRange([row('all-day', 8, 9, { allDay: true })]), calendarGridRange([]));
  const early = calendarGridRange([row('early', 7, 7.5)]);
  assert.equal(early.startHour, 7);
  assert.equal(early.endHour, 20);
  assert.equal(calendarEventCardGeometry(row('early', 7, 7.5), early.startHour).top, 0);
  const evening = calendarGridRange([row('evening', 19 + 55 / 60, 20)]);
  const eveningBox = calendarEventCardGeometry(row('evening', 19 + 55 / 60, 20), evening.startHour);
  assert.ok(evening.height >= eveningBox.top + eveningBox.height);
  assert.equal(evening.endHour, 20, 'extra touch space is not another hour');
});

test('23:55 markers fit trailing space without a fabricated 24:00 or 25:00 label', () => {
  const input = row('late', 23 + 55 / 60, 24), range = calendarGridRange([input]);
  const box = calendarEventCardGeometry(input, range.startHour);
  assert.equal(range.endHour, 24);
  assert.equal(range.hours.at(-1), 23);
  assert.ok(range.height >= box.top + box.height);
  assert.equal(box.height, 44);
});
