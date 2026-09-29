import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPublishLog, filterLog, countLog, weekStrip, kstDateKey } from './content-publish-log.js';

const kst = (m, d, h, min = 0) => Date.UTC(2026, m - 1, d, h, min) - 9 * 3600 * 1000;
const iso = (t) => new Date(t).toISOString();
const now = kst(9, 29, 12, 40); // 화요일
const sched = (id, patch = {}) => ({ variantId: id, contentId: `c-${id}`, title: `글 ${id}`, channel: 'threads', scheduledAt: iso(kst(9, 29, 19)), status: 'scheduled', revision: 1, createdAt: iso(kst(9, 28, 22)), updatedAt: iso(kst(9, 28, 22)), missedAt: null, ...patch });
const pub = (id, patch = {}) => ({ id: `p-${id}`, variantId: id, contentId: `c-${id}`, status: 'published', channel: 'threads', title: `글 ${id}`, publishedAt: iso(kst(9, 29, 8, 34)), targetUrl: 'https://www.threads.net/@a/post/1', provenance: 'operator_confirmed', ...patch });

test('merges by variant: a publish record wins over any schedule state and marks late posts', () => {
  const rows = buildPublishLog({
    schedules: [sched('a', { scheduledAt: iso(kst(9, 29, 8)) }), sched('b', { scheduledAt: iso(kst(9, 28, 21)), status: 'missed', missedAt: iso(kst(9, 28, 22)) }), sched('c'), sched('d', { status: 'cancelled', updatedAt: iso(kst(9, 28, 23)) })],
    publishLogs: [pub('a'), pub('b', { publishedAt: iso(kst(9, 29, 9)) }), pub('e')],
  }, now);
  const by = Object.fromEntries(rows.map((row) => [row.variantId, row]));
  assert.equal(by.a.state, 'published');
  assert.equal(by.a.method, 'notify', 'a schedule existed');
  assert.equal(by.a.lateMinutes, 0, 'within the hour is on time, not late');
  assert.equal(by.b.state, 'published', 'a missed schedule that was posted later is published');
  assert.ok(by.b.lateMinutes > 600, 'posted the next morning is late');
  assert.equal(by.c.state, 'scheduled');
  assert.equal(by.d.state, 'cancelled');
  assert.equal(by.d.method, 'manual', 'a cancelled schedule is not a notification-driven post');
  assert.equal(by.e.state, 'published');
  assert.equal(by.e.method, 'manual', 'no schedule: recorded by hand');
  assert.equal(by.e.url, 'https://www.threads.net/@a/post/1');
});

test('rows are newest first and per-row history is chronological with the recorded URL', () => {
  const rows = buildPublishLog({ schedules: [sched('a', { scheduledAt: iso(kst(9, 29, 8)) }), sched('c')], publishLogs: [pub('a')] }, now);
  assert.deepEqual(rows.map((row) => row.variantId), ['c', 'a']);
  const a = rows.find((row) => row.variantId === 'a');
  assert.deepEqual(a.events.map((event) => event.kind), ['created', 'published']);
  assert.equal(a.events.at(-1).url, 'https://www.threads.net/@a/post/1');
  assert.match(a.events.at(-1).label, /운영자 확인/);
  const times = a.events.map((event) => event.atMs);
  assert.deepEqual([...times].sort((x, y) => x - y), times);
});

test('non-published publish logs and rows without a usable time are ignored', () => {
  const rows = buildPublishLog({ schedules: [sched('x', { scheduledAt: 'nope' })], publishLogs: [pub('y', { status: 'failed' }), pub('z', { publishedAt: null }), pub('w', { variantId: null })] }, now);
  assert.deepEqual(rows, []);
});

test('metrics are attached read-only from the performance owner', () => {
  const rows = buildPublishLog({ publishLogs: [pub('a')], metricsById: { a: { views: 120, shares: 4, replies: null } } }, now);
  assert.deepEqual(rows[0].metrics, { views: 120, shares: 4, replies: null });
  assert.equal(buildPublishLog({ publishLogs: [pub('a')] }, now)[0].metrics, null);
});

test('filters and counts', () => {
  const rows = buildPublishLog({
    schedules: [sched('due', { scheduledAt: iso(kst(9, 29, 9)) }), sched('miss', { status: 'missed', scheduledAt: iso(kst(9, 28, 21)) }), sched('soon'), sched('gone', { status: 'cancelled' })],
    publishLogs: [pub('done')],
  }, now);
  assert.deepEqual(countLog(rows), { all: 5, action: 2, scheduled: 1, published: 1 });
  assert.deepEqual(filterLog(rows, 'action').map((row) => row.variantId).sort(), ['due', 'miss']);
  assert.equal(filterLog(rows, 'all').length, 5);
});

test('week strip runs Monday to Sunday in KST and places rows on their local day', () => {
  const rows = buildPublishLog({ schedules: [sched('c'), sched('n', { scheduledAt: iso(kst(9, 30, 0, 30)) })], publishLogs: [pub('a', { publishedAt: iso(kst(9, 27, 21, 10)) })] }, now);
  const week = weekStrip(rows, now);
  assert.deepEqual(week.map((day) => day.label), ['월', '화', '수', '목', '금', '토', '일']);
  assert.deepEqual(week.map((day) => day.dayOfMonth), [28, 29, 30, 1, 2, 3, 4]);
  assert.equal(week[1].isToday, true);
  assert.equal(week[2].isFuture, true);
  assert.equal(week[1].items.length, 1);
  assert.equal(week[2].items[0].variantId, 'n', '00:30 KST belongs to the next KST day, not the UTC day');
  assert.equal(week[0].items.length, 0, 'the Sunday 27th post is last week');
  assert.equal(kstDateKey(kst(9, 30, 0, 30)), '2026-09-30');
});
