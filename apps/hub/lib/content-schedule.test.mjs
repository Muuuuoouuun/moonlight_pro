import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SWEEP_HOUR_KST, latestSweepBoundary, deriveScheduleState, dueUrgency, validateScheduleInput, schedulePresets, formatKstShort } from './content-schedule.js';

const kst = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h, min) - 9 * 3600 * 1000;
const id = '11111111-1111-4111-8111-111111111111';

test('the nightly boundary is the latest 22:00 KST at or before now', () => {
  assert.equal(SWEEP_HOUR_KST, 22);
  assert.equal(latestSweepBoundary(kst(2026, 9, 29, 22, 0)), kst(2026, 9, 29, 22, 0), 'exactly at the sweep');
  assert.equal(latestSweepBoundary(kst(2026, 9, 29, 23, 30)), kst(2026, 9, 29, 22, 0));
  assert.equal(latestSweepBoundary(kst(2026, 9, 29, 12, 0)), kst(2026, 9, 28, 22, 0), 'during the day the boundary is last night');
  assert.equal(latestSweepBoundary(kst(2026, 10, 1, 0, 5)), kst(2026, 9, 30, 22, 0), 'crosses month end');
});

test('state is derived from status and time; daytime overdue is due, not missed', () => {
  const now = kst(2026, 9, 29, 12, 40);
  assert.equal(deriveScheduleState({ status: 'scheduled', scheduled_at: new Date(kst(2026, 9, 29, 19)).toISOString() }, now), 'scheduled');
  assert.equal(deriveScheduleState({ status: 'scheduled', scheduled_at: new Date(kst(2026, 9, 29, 9)).toISOString() }, now), 'due');
  assert.equal(deriveScheduleState({ status: 'missed', scheduled_at: new Date(kst(2026, 9, 28, 21)).toISOString() }, now), 'missed');
  for (const status of ['published', 'cancelled']) assert.equal(deriveScheduleState({ status, scheduled_at: 'x' }, now), status);
  assert.equal(deriveScheduleState(null, now), null);
  assert.equal(dueUrgency({ scheduled_at: new Date(kst(2026, 9, 29, 12, 10)).toISOString() }, now), 'now');
  assert.equal(dueUrgency({ scheduled_at: new Date(kst(2026, 9, 29, 9)).toISOString() }, now), 'late');
});

test('schedule input validation bounds time, ids, text and revision', () => {
  const now = kst(2026, 9, 29, 12);
  const good = { variantId: id, contentId: id, scheduledAt: new Date(now + 3600000).toISOString(), title: '  제목  ', channel: 'threads', expectedRevision: 0 };
  const ok = validateScheduleInput(good, now);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.title, '제목');
  for (const [patch, reason] of [
    [{ variantId: 'x' }, 'invalid-id'], [{ scheduledAt: 'soon' }, 'invalid-time'],
    [{ scheduledAt: new Date(now - 3600000).toISOString() }, 'time-in-past'],
    [{ scheduledAt: new Date(now + 400 * 86400000).toISOString() }, 'time-too-far'],
    [{ title: 'a'.repeat(201) }, 'invalid-title'], [{ title: 'a\u0000' }, 'invalid-title'],
    [{ channel: 'c'.repeat(41) }, 'invalid-channel'], [{ expectedRevision: -1 }, 'invalid-revision'],
  ]) assert.equal(validateScheduleInput({ ...good, ...patch }, now).reason, reason);
  assert.equal(validateScheduleInput({ ...good, scheduledAt: new Date(now - 60000).toISOString() }, now).ok, true, 'a minute in the past is tolerated (사용자 시계 차이)');
  assert.equal(validateScheduleInput(null, now).ok, false);
});

test('presets are three future KST slots that never collide', () => {
  const morningNow = kst(2026, 9, 29, 9, 0);
  const a = schedulePresets(morningNow);
  assert.deepEqual(a.map((p) => p.label), ['1시간 뒤', '오늘 저녁 7시', '내일 아침 8시']);
  assert.equal(Date.parse(a[1].at), kst(2026, 9, 29, 19));
  const lateNow = kst(2026, 9, 29, 20, 0);
  const b = schedulePresets(lateNow);
  assert.deepEqual(b.map((p) => p.label), ['1시간 뒤', '내일 저녁 7시', '모레 아침 8시']);
  for (const list of [a, b]) {
    const times = list.map((p) => Date.parse(p.at));
    assert.ok(times.every((t) => t > (list === a ? morningNow : lateNow)));
    assert.deepEqual([...times].sort((x, y) => x - y), times, 'ascending');
  }
});

test('formatKstShort writes Korea time', () => {
  assert.equal(formatKstShort(new Date(kst(2026, 9, 29, 19, 30)).toISOString()), '9/29 19:30');
  assert.equal(formatKstShort('nope'), '');
});
