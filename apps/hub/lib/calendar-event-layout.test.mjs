import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutCalendarEventSegments } from './calendar-event-view.js';

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

test('allocation uses the clipped visible interval and ignores entirely hidden segments', () => {
  const rows = layoutCalendarEventSegments([row('all-day', 8, 9), row('overnight', 0, 10, { multiDay: true }), ...['a', 'b', 'c'].map(id => row(id, 0, 1, { multiDay: true }))]);
  assert.deepEqual(positions(rows), [[1, 2], [0, 2], [0, 1], [0, 1], [0, 1]]);
  assert.deepEqual(positions(layoutCalendarEventSegments([row('a', 19, 24, { multiDay: true }), row('b', 20, 21)])), [[0, 1], [0, 1]]);
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


test('single-day off-hours events consume no visible overlap columns', () => {
  const rows = layoutCalendarEventSegments([row('visible', 8, 9), ...['a', 'b', 'c'].map(id => row(id, 1, 2)), row('late', 20, 21)]);
  assert.deepEqual(positions(rows), [[0, 1], [0, 1], [0, 1], [0, 1], [0, 1]]);
});
