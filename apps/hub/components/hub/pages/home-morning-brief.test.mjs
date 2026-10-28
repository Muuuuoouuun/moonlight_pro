import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeMorningBrief, formatHomeClock } from './home-morning-brief.js';

test('Home clock keeps KST and the existing invalid-time fallback', () => {
  assert.equal(formatHomeClock('invalid-date'), '--:--');
  assert.equal(formatHomeClock('2026-09-29T01:30:00Z'), '10:30');
});

test('Home handoff shows one factual execution line without repeating attention or calendar rows', () => {
  const result = buildHomeMorningBrief({ brief: { status: 'live', taskToday: { state: 'live', focus: { picked: 3, done: 1 }, queueCount: 6 } }, schedule: { status: 'error' } });
  assert.deepEqual(result, { state: 'live', progress: '집중 3개 중 1개 완료 · 대기 6개' });
  assert.equal(result.rows, undefined, 'three repeated briefing rows are no longer part of the Home handoff');
});

test('unknown, stale and partial task reads never claim a verified zero or all work finished', () => {
  const unknown = buildHomeMorningBrief({ brief: { status: 'live' } });
  assert.equal(unknown.state, 'partial'); assert.match(unknown.progress, /확인/ );
  const stale = buildHomeMorningBrief({ brief: { status: 'live', taskToday: { state: 'live', stale: true, focus: { picked: 2, done: 1 }, queueCount: 4 } } });
  assert.equal(stale.state, 'partial'); assert.match(stale.progress, /이전 조회/);
  const partial = buildHomeMorningBrief({ brief: { status: 'partial', taskToday: { state: 'partial', focus: { picked: 0, done: 0 }, queueCount: 0 } } });
  assert.equal(partial.state, 'partial'); assert.doesNotMatch(partial.progress, /대기 0개/);
  for (const focus of [{ picked: 5, done: 1 }, { picked: 1, done: 2 }, { picked: 1 }, { picked: -1, done: 0 }]) {
    assert.match(buildHomeMorningBrief({ brief: { status: 'live', taskToday: { state: 'live', focus } } }).progress, /확인하지 못/);
  }
});

test('loading, preview and error stay separate and verified empty focus invites choosing in Today', () => {
  for (const status of ['loading', 'preview', 'error']) {
    const result = buildHomeMorningBrief({ brief: { status } });
    assert.equal(result.state, status); assert.doesNotMatch(result.progress, /대기 0|다 끝/);
  }
  const empty = buildHomeMorningBrief({ brief: { status: 'live', taskToday: { state: 'live', focus: { picked: 0, done: 0 }, queueCount: 0 } } });
  assert.equal(empty.state, 'live'); assert.match(empty.progress, /고르지 않았/); assert.match(empty.progress, /대기 0개/);
});
