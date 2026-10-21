import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildNowModel } from './my-work-now.jsx';

// 내 작업 · 지금 렌즈(시안 E, 2026-10-21). 합성 항목으로 고르는 규칙만 고정한다.
const bucket = item => item.dueBucket;
const at = '2026-10-21T01:00:00Z';
const task = (id, extra = {}) => ({ id, lane: 'task', title: id, dueBucket: 'later', whenAt: '', ...extra });

test('지금은 오늘 3개 → 오늘 기한 → 이번 주 기한 순으로 하나를 고르고, 기한 지남은 따로 둔다', () => {
  const items = [
    task('late', { dueBucket: 'overdue' }),
    task('week-2', { dueBucket: 'week', whenAt: '2026-10-24' }),
    task('week-1', { dueBucket: 'week', whenAt: '2026-10-23' }),
    task('today', { dueBucket: 'today', whenAt: '2026-10-21' }),
    task('focus-1', { focusToday: true }),
    task('focus-2', { focusToday: true }),
  ];
  const model = buildNowModel(items, { completingIds: new Set(), dueBucketOf: bucket, now: Date.parse(at) });
  assert.equal(model.current.id, 'focus-1');
  assert.equal(model.focusIndex, 1);
  assert.deepEqual(model.queue.map(item => item.id), ['focus-2', 'today', 'week-1', 'week-2']);
  assert.deepEqual(model.overdue.map(item => item.id), ['late']);

  const noFocus = buildNowModel(items.filter(item => !item.focusToday), { completingIds: new Set(), dueBucketOf: bucket, now: Date.parse(at) });
  assert.equal(noFocus.current.id, 'today');
  assert.equal(noFocus.focusIndex, null);
  const weekOnly = buildNowModel(items.filter(item => item.dueBucket === 'week'), { completingIds: new Set(), dueBucketOf: bucket, now: Date.parse(at) });
  assert.equal(weekOnly.current.id, 'week-1');
  assert.equal(weekOnly.currentDue, 'week');
});

test('완료 처리 중인 항목은 빠지고 다음이 올라오며, 기한 없는 할 일만 있으면 고를 후보를 낸다', () => {
  const items = [task('focus-1', { focusToday: true }), task('focus-2', { focusToday: true }), task('loose-1'), task('loose-2')];
  const model = buildNowModel(items, { completingIds: new Set(['focus-1']), dueBucketOf: bucket, now: Date.parse(at) });
  assert.equal(model.current.id, 'focus-2');
  assert.equal(model.focusIndex, 1);
  const empty = buildNowModel([task('loose-1'), task('loose-2')], { completingIds: new Set(), dueBucketOf: bucket, now: Date.parse(at) });
  assert.equal(empty.current, null);
  assert.deepEqual(empty.pickable.map(item => item.id), ['loose-1', 'loose-2']);
});

test('오늘 시간표는 시작 순서, 다음 일정은 아직 끝나지 않은 첫 일정이다', () => {
  const event = (id, whenAt, endAt) => ({ id, lane: 'event', title: id, bucket: 'today', whenAt, endAt });
  const items = [event('later', '2026-10-21T07:00:00Z', '2026-10-21T08:00:00Z'), event('past', '2026-10-21T00:00:00Z', '2026-10-21T00:30:00Z'), event('soon', '2026-10-21T01:20:00Z', '2026-10-21T02:00:00Z')];
  const model = buildNowModel(items, { completingIds: new Set(), dueBucketOf: bucket, now: Date.parse(at) });
  assert.deepEqual(model.events.map(item => item.id), ['past', 'soon', 'later']);
  assert.equal(model.upcoming.id, 'soon');
  assert.equal(model.minutesToNext, 20);
});

test('지금은 착지 렌즈이고, 완료·미루기·오늘 3개·체크리스트는 목록과 같은 처리기를 쓴다', () => {
  const source = readFileSync(new URL('./my-work.jsx', import.meta.url), 'utf8');
  assert.match(source, /\{ key: 'now', label: '지금' \}/);
  assert.match(source, /LENSES\.some\(\(l\) => l\.key === lensParam\) \? lensParam : 'now'/);
  for (const handler of ['onComplete={scheduleComplete}', 'onDefer={handleItemDefer}', 'onToggleFocus={toggleFocus}', 'onToggleChecklist={toggleChecklist}']) assert.ok(source.includes(handler), handler);
  const css = readFileSync(new URL('./my-work-now.css', import.meta.url), 'utf8');
  const danger = [...css.matchAll(/([^{}]+)\{[^}]*var\(--danger\)/g)].map(m => m[1].trim());
  assert.ok(danger.every(selector => /mwn-(row--rail|danger)/.test(selector)), danger.join(' | '));
  assert.doesNotMatch(css, /!important|#[\da-fA-F]{3,8}\b|rgba?\(/);
});
