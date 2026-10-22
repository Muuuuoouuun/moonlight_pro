import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildTaskToday, groupTaskRows, taskDueLabel, taskPriorityLabel } from '../../../lib/task-today.js';
import { BurningStreakBadge, nextStreakStep, streakWeekLabels } from '../burning-streak.jsx';
import { Progress } from '../hub-primitives.jsx';

// 오늘 할 일 목록·연속 띠·막대 게이지 디벨롭(2026-10-22).
const now = new Date('2026-10-22T03:00:00Z'); // 서울 10/22(목) 12:00

test('레인 이름은 묶음 머리에 한 번만 — 행마다 "나중" 배지를 되풀이하지 않는다', () => {
  const todos = ['a', 'b', 'c'].map((id, i) => ({ id, title: id, status: 'todo', updatedAt: `2026-10-2${i}T00:00:00Z` }));
  const today = buildTaskToday(todos, { now });
  const groups = groupTaskRows(today.later);
  assert.equal(groups.length, 1);
  assert.deepEqual([groups[0].lane, groups[0].label, groups[0].items.length], ['later', '나중', 3]);

  const mixed = groupTaskRows([{ id: 1, lane: 'missed' }, { id: 2, lane: 'missed' }, { id: 3, lane: 'today' }, { id: 4, lane: 'later' }]);
  assert.deepEqual(mixed.map((g) => [g.label, g.items.length]), [['놓침', 2], ['오늘', 1], ['나중', 1]]);
});

test('행 메타는 운영자가 읽는 말 — 보통 우선순위는 말하지 않고 지난 기한만 overdue', () => {
  assert.equal(taskPriorityLabel('med'), '');
  assert.equal(taskPriorityLabel('medium'), '');
  assert.equal(taskPriorityLabel('high'), '높음');
  assert.equal(taskPriorityLabel('low'), '낮음');
  const due = (dueAt) => taskDueLabel({ dueAt }, { now });
  assert.deepEqual(due('2026-10-19'), { text: '3일 지남', overdue: true });
  assert.deepEqual(due('2026-10-22'), { text: '오늘까지', overdue: false });
  assert.deepEqual(due('2026-10-23'), { text: '내일까지', overdue: false });
  assert.deepEqual(due('2026-10-27'), { text: 'D-5', overdue: false });
  assert.deepEqual(due('2026-11-30'), { text: '11/30까지', overdue: false });
  assert.equal(due(null), null);
});

test('오늘 화면은 묶음 머리를 그리고 per-row 레인 배지·영문 우선순위를 쓰지 않는다', () => {
  const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function TaskToday('), source.indexOf('const EMPTY_DAILY_BRIEF_STATE ='));
  assert.match(body, /groupTaskRows\(listItems\)/);
  assert.doesNotMatch(body, /task\.laneLabel/);
  assert.doesNotMatch(body, /task\.priority \|\| 'med'/);
  assert.doesNotMatch(body, /compact\s*\n\s*streak=/, '머리말의 작은 연속 칩은 아래 띠와 같은 값을 두 번 말한다');
  assert.doesNotMatch(source, /이번 주 업로드 <strong>|일평균 몰입/, '근거 없는 하드코딩 수치를 그리지 않는다');
});

test('할 일 목록 CSS는 토큰만 쓰고 빨강은 놓침 머리와 지난 기한 글자에만', () => {
  const css = readFileSync(new URL('./today-tasks.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
  assert.deepEqual([...css.matchAll(/^[^\n]*var\(--danger\)[^\n]*$/gm)].map((m) => m[0].trim().split(' {')[0]), [
    '.hub-app .today-task-group[data-lane="missed"] .today-task-group__label',
    '.hub-app .today-task-row__meta [data-overdue]',
  ]);
});

test('연속 띠는 다음 단계까지 남은 날과 최근 7일 게이지를 말한다', () => {
  assert.deepEqual(nextStreakStep(0), { days: 1, left: 1, label: '불씨' });
  assert.deepEqual(nextStreakStep(2), { days: 3, left: 1, label: '불꽃' });
  assert.deepEqual(nextStreakStep(10), { days: 14, left: 4, label: '활활' });
  assert.equal(nextStreakStep(30), null);
  const labels = streakWeekLabels(now);
  assert.deepEqual(labels, ['금', '토', '일', '월', '화', '수', '오늘']);

  const html = renderToStaticMarkup(React.createElement(BurningStreakBadge, { streak: 2, todayCompleted: 1, recentDays: [0, 0, 0, 0, 1, 1, 1], now }));
  assert.equal((html.match(/hub-streak-week__cell/g) || []).length, 7);
  assert.equal((html.match(/hub-streak-week__cell" data-done=""/g) || []).length, 3);
  assert.match(html, /data-today=""/);
  assert.match(html, /최근 7일 중 3일 완료/);
  assert.match(html, /다음 &#x27;불꽃&#x27;까지 1일/);
  assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b|oklch|--warning|--success/i);

  const idle = renderToStaticMarkup(React.createElement(BurningStreakBadge, { streak: 0, todayCompleted: 0, recentDays: [0, 0, 0, 0, 0, 0, 0], now }));
  assert.match(idle, /연속 시작 전/);
  assert.match(idle, /오늘 한 건 끝내면 1일째가 됩니다/);
});

test('막대 게이지는 chrome을 CSS에 맡기고, 바깥이 이미 말하면 숨긴다', () => {
  const live = renderToStaticMarkup(React.createElement(Progress, { value: 42, label: '이번 주' }));
  assert.match(live, /role="progressbar"/);
  assert.match(live, /aria-valuetext="42%"/);
  assert.match(live, /aria-label="이번 주"/);
  assert.doesNotMatch(live, /background:var\(--surface-3\)|border-radius/, '트랙 면·모서리는 .hub-progress-track이 소유한다');
  const quiet = renderToStaticMarkup(React.createElement(Progress, { value: 42, decorative: true }));
  assert.doesNotMatch(quiet, /role=/);
  assert.match(quiet, /aria-hidden="true"/);
  const css = readFileSync(new URL('../hub-tokens.css', import.meta.url), 'utf8');
  assert.match(css, /\.hub-app \.hub-progress-track \{[^}]*background: var\(--well, var\(--surface-3\)\);/);
  assert.match(css, /\.hub-app \.hub-progress-bar \{[^}]*transition: width var\(--dur-enter\) var\(--ease-hub\);/);
});
