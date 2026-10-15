import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

const moduleUrl = new URL('./home-morning-brief.js', import.meta.url);
const module = existsSync(moduleUrl) ? await import(moduleUrl.href) : {};
const { buildHomeMorningBrief, formatHomeClock } = module;

const now = new Date('2026-09-29T00:15:00.000Z'); // 09:15 Seoul

test('shared Home clock keeps the existing fallback for an invalid schedule time', () => {
  assert.equal(formatHomeClock('invalid-date'), '--:--');
});

test('Home morning brief uses a confirmed urgent KA, next timed event, and picked focus progress', () => {
  assert.equal(typeof buildHomeMorningBrief, 'function');
  const result = buildHomeMorningBrief({
    brief: {
      status: 'live',
      signals: [],
      dailyFocus: {
        urgentKa: { state: 'live', item: { name: '고객 A', reason: '다음 행동 1일 지남' } },
        focusCustomers: { state: 'live', items: [] },
      },
      taskToday: { state: 'live', focus: { picked: 3, done: 1 }, counts: { missed: 0 } },
    },
    schedule: {
      status: 'live',
      events: [
        { id: 'past', title: '지난 일정', start: '2026-09-28T23:00:00Z', end: '2026-09-28T23:30:00Z' },
        { id: 'next', title: '고객 미팅', start: '2026-09-29T01:30:00Z', end: '2026-09-29T02:30:00Z' },
      ],
    },
    now,
  });
  assert.equal(result.state, 'live');
  assert.deepEqual(result.rows.map(row => row.label), ['먼저 확인', '다음 일정', '오늘의 진척']);
  assert.equal(result.rows[0].text, '고객 A · 다음 행동 1일 지남');
  assert.equal(result.rows[1].text, '10:30 고객 미팅');
  assert.equal(result.rows[2].text, '직접 고른 할 일 3개 중 1개 완료');
});

test('Home morning brief does not turn failed reads into empty records', () => {
  assert.equal(typeof buildHomeMorningBrief, 'function');
  const result = buildHomeMorningBrief({
    brief: { status: 'error', signals: [], dailyFocus: null, taskToday: null },
    schedule: { status: 'preview', events: [] },
    now,
  });
  assert.equal(result.state, 'partial');
  assert.match(result.rows[0].text, /확인하지 못/);
  assert.match(result.rows[1].text, /연결/);
  assert.match(result.rows[2].text, /확인하지 못/);
  assert.doesNotMatch(result.rows.map(row => row.text).join(' '), /0건|일정이 없습니다/);
});

test('Home morning brief distinguishes a confirmed quiet morning from partial calendar coverage', () => {
  assert.equal(typeof buildHomeMorningBrief, 'function');
  const brief = {
    status: 'live', signals: [],
    dailyFocus: { urgentKa: { state: 'live', item: null }, focusCustomers: { state: 'live', items: [] } },
    taskToday: { state: 'live', focus: { picked: 0, done: 0 }, counts: { missed: 0 } },
  };
  const quiet = buildHomeMorningBrief({ brief, schedule: { status: 'live', events: [] }, now });
  assert.match(quiet.rows[0].text, /긴급 항목이 없습니다/);
  assert.equal(quiet.rows[1].text, '남은 시간 일정이 없습니다');
  assert.match(quiet.rows[2].text, /아직 고르지/);
  const partial = buildHomeMorningBrief({ brief, schedule: { status: 'partial', events: [] }, now });
  assert.equal(partial.state, 'partial');
  assert.match(partial.rows[1].text, /일부 캘린더 미확인/);
});
