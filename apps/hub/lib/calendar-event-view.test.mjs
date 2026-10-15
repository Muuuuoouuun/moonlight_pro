import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { calendarEventWhenLabel, mapGoogleEventsToGrid } from './calendar-event-view.js';

const week = () => Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 5 + index));
const event = (change = {}) => ({
  id: 'event-a', outcomeKey: 'calendar-source:event-a', title: '로컬 일정 입력',
  start: '2026-10-05T09:30:00', end: '2026-10-05T10:45:00', allDay: false, ...change,
});
const positions = rows => rows.map(({ day, start, end }) => ({ day, start, end }));

test('single-day timed events keep the existing grid and drawer clock format', () => {
  const input = event(), [row] = mapGoogleEventsToGrid([input], week());
  assert.deepEqual(positions([row]), [{ day: 0, start: 9.5, end: 10.75 }]);
  assert.equal(row.id, input.id);
  assert.equal(row.outcomeKey, input.outcomeKey);
  assert.equal(row.originalStart, input.start);
  assert.equal(row.originalEnd, input.end);
  assert.equal(calendarEventWhenLabel(row), '9:30 – 10:45');
});

test('single-day all-day events retain the one-hour marker and 종일 copy', () => {
  const [row] = mapGoogleEventsToGrid([event({ allDay: true, start: '2026-10-05T00:00:00', end: '2026-10-06T00:00:00' })], week());
  assert.deepEqual(positions([row]), [{ day: 0, start: 8, end: 9 }]);
  assert.equal(calendarEventWhenLabel(row), '종일');
});

test('an all-day event beginning before the viewed week remains on its overlapping days', () => {
  const rows = mapGoogleEventsToGrid([event({ allDay: true, start: '2026-10-04', end: '2026-10-07' })], week());
  assert.deepEqual(rows.map(row => row.day), [0, 1]);
  assert.equal(calendarEventWhenLabel(rows[1]), '2026-10-04 – 2026-10-06 · 종일');
});

test('all-day ends are exclusive and every remaining visible day gets a segment', () => {
  const rows = mapGoogleEventsToGrid([event({ allDay: true, start: '2026-10-05', end: '2026-10-08' })], week());
  assert.deepEqual(rows.map(row => row.day), [0, 1, 2]);
  assert.equal(new Set(rows.map(row => row.segmentKey)).size, 3);
  assert.ok(rows.every(row => row.outcomeKey === 'calendar-source:event-a'));
  assert.equal(mapGoogleEventsToGrid([event({ allDay: true, start: '2026-10-03', end: '2026-10-05' })], week()).length, 0);
});

test('long all-day intervals are bounded by visible days, including a single-day view', () => {
  const input = event({ allDay: true, start: '2026-09-01', end: '2026-11-01' });
  assert.equal(mapGoogleEventsToGrid([input], week()).length, 7);
  assert.deepEqual(positions(mapGoogleEventsToGrid([input], [new Date(2026, 9, 6, 14)])), [{ day: 0, start: 8, end: 9 }]);
});

test('timed intervals split at day boundaries and retain original times for every segment', () => {
  const input = event({ start: '2026-10-05T17:00:00', end: '2026-10-06T10:00:00' });
  const rows = mapGoogleEventsToGrid([input], week());
  assert.deepEqual(positions(rows), [{ day: 0, start: 17, end: 24 }, { day: 1, start: 0, end: 10 }]);
  for (const row of rows) {
    assert.equal(row.originalStart, input.start);
    assert.equal(row.originalEnd, input.end);
    assert.equal(calendarEventWhenLabel(row), '2026-10-05 17:00 – 2026-10-06 10:00');
  }
});

test('a timed event starting before the week keeps its complete intermediate and ending days', () => {
  const rows = mapGoogleEventsToGrid([event({ start: '2026-10-04T17:00:00', end: '2026-10-06T10:00:00' })], week());
  assert.deepEqual(positions(rows), [{ day: 0, start: 0, end: 24 }, { day: 1, start: 0, end: 10 }]);
});

test('midnight is an exclusive end boundary, never an extra next-day event', () => {
  const rows = mapGoogleEventsToGrid([event({ start: '2026-10-05T17:00:00', end: '2026-10-06T00:00:00' })], week());
  assert.deepEqual(positions(rows), [{ day: 0, start: 17, end: 24 }]);
});

test('a 01:00 end and a 01:00-only single-day event never expand to the rest of the day', () => {
  const overnight = mapGoogleEventsToGrid([event({ start: '2026-10-05T23:00:00', end: '2026-10-06T01:00:00' })], week());
  assert.deepEqual(positions(overnight), [{ day: 0, start: 23, end: 24 }, { day: 1, start: 0, end: 1 }]);
  assert.deepEqual(positions(mapGoogleEventsToGrid([event({ start: '2026-10-05T01:00:00', end: '2026-10-05T02:00:00' })], week())), [{ day: 0, start: 1, end: 2 }]);
});

test('short and zero-duration events retain the legacy 15-minute minimum marker', () => {
  assert.deepEqual(positions(mapGoogleEventsToGrid([event({ end: '2026-10-05T09:35:00' })], week())), [{ day: 0, start: 9.5, end: 9.75 }]);
  assert.deepEqual(positions(mapGoogleEventsToGrid([event({ end: '2026-10-05T09:30:00' })], week())), [{ day: 0, start: 9.5, end: 9.75 }]);
});

test('source identity collisions keep distinct rendering keys and original completion keys', () => {
  const inputs = ['personal', 'company'].map(source => event({ source, outcomeKey: `${source}:event-a`, allDay: true, start: '2026-10-05', end: '2026-10-07' }));
  const rows = mapGoogleEventsToGrid(inputs, week());
  assert.equal(new Set(rows.map(row => row.segmentKey)).size, 4);
  assert.deepEqual(rows.map(row => row.outcomeKey), ['personal:event-a', 'personal:event-a', 'company:event-a', 'company:event-a']);
  const withoutOutcome = mapGoogleEventsToGrid(inputs.map(input => ({ ...input, outcomeKey: null })), week());
  assert.equal(new Set(withoutOutcome.map(row => row.segmentKey)).size, 4);
});

test('invalid/outside inputs are ignored without mutating provider data', () => {
  const input = event(), before = JSON.stringify(input);
  assert.deepEqual(mapGoogleEventsToGrid(null, week()), []);
  assert.deepEqual(mapGoogleEventsToGrid([input], null), []);
  assert.deepEqual(mapGoogleEventsToGrid([null, event({ start: 'bad' }), event({ end: 'bad' }), event({ end: '2026-10-04T10:00:00' }), event({ start: '2026-10-20T09:00:00', end: '2026-10-20T10:00:00' })], week()), []);
  assert.deepEqual(mapGoogleEventsToGrid([event({ allDay: true, start: '2026-02-30', end: '2026-03-01' })], week()), []);
  mapGoogleEventsToGrid([input], week());
  assert.equal(JSON.stringify(input), before);
});

test('all-day date-only placement is stable both west and east of UTC', () => {
  for (const timezone of ['America/Los_Angeles', 'Asia/Seoul']) {
    const code = `import {mapGoogleEventsToGrid} from ${JSON.stringify(new URL('./calendar-event-view.js', import.meta.url).href)};
      const rows=mapGoogleEventsToGrid([{allDay:true,start:'2026-10-05',end:'2026-10-07'}],[new Date(2026,9,5),new Date(2026,9,6)]);
      process.stdout.write(JSON.stringify(rows.map(row=>row.day)));`;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '[0,1]', timezone);
  }
});
