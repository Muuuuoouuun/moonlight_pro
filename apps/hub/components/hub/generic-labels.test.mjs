import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { brandInWorkspace } from './workspace-map.js';
import { collapsedTodayAgendaRows, todayAgendaRows } from './pages/workflow-reading.js';
import { buildTodayDeck } from './pages/today-deck-model.js';
import { dateKeyInZone, groupTaskRows } from '../../lib/task-today.js';
import { shiftDateKey } from '../../lib/rhythm-calendar.js';
import { REACTION_LABEL } from '../../lib/sales-os/followup-scoring.js';

const primitives = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
const daily = readFileSync(new URL('./pages/daily-brief.jsx', import.meta.url), 'utf8');
const agenda = readFileSync(new URL('./pages/today-time-flow.jsx', import.meta.url), 'utf8');
const deck = readFileSync(new URL('./pages/today-deck.jsx', import.meta.url), 'utf8');
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} stays findable`);
  return source.slice(from, to).replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
}
const code = ts.transpileModule([
  section(primitives, 'export function Card(', '// Wraps instead'),
  section(primitives, 'export function SectionTitle(', '// Button hover is CSS-owned'),
  agenda.slice(agenda.indexOf('export function TodayTimeFlow')).replace('export function', 'function'),
  section(deck, 'export function TodaySlots(', '// 시간대에 맞는 보조 칸'),
  section(primitives, 'export const Button =', 'export const IconButton ='),
  section(primitives, 'const TRUTH_STATES =', 'export function DateQuickPresets('),
  section(daily, 'const BRIEF_DESTINATIONS =', '// Command Brief priority:'),
  section(daily, 'function TaskToday(', 'const EMPTY_DAILY_BRIEF_STATE ='),
  section(daily, 'function BriefNavigation(', '// The command —'),
  section(daily, '// §2 확정 슬롯', '// 60초 시계를 페이지 루트에서 분리'),
].join('\n'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
// Render the production badge, Card, heading and page slots. Unrelated widgets
// are boundaries; no hook effect, API, business write or browser is executed.
const own = new Set(['Card', 'Button', 'SectionTitle', 'TruthBadge', 'TaskToday', 'BriefNavigation', 'FocusSlots', 'TodayTimeFlow', 'TodaySlots', 'EmptyState']);
const deps = { React, brandInWorkspace, collapsedTodayAgendaRows, todayAgendaRows, FOCUS_REACTION_LABEL: REACTION_LABEL,
  MAX_FOCUS_PER_DAY: 3, REVIEW_EVENING_HOUR: 18, useUndoableAction: () => ({}),
  buildTodayDeck, dateKeyInZone, groupTaskRows, shiftDateKey, useToast: () => ({}),
  useMinuteClock: () => new Date(2026, 9, 21, 13) };
for (const name of new Set([...code.matchAll(/React\.createElement\(([A-Z]\w*)/g)].map(match => match[1]))) {
  if (name !== 'React' && !own.has(name)) deps[name] = () => null;
}
const { TruthBadge, TaskToday, BriefNavigation, FocusSlots, TodaySlots } = new Function(...Object.keys(deps),
  `${code}; return { TruthBadge, TaskToday, BriefNavigation, FocusSlots, TodaySlots };`)(...Object.values(deps));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
function assertNoNamedGeneric(html) {
  for (const [tag] of html.matchAll(/<(?:div|span)\b[^>]*>/g)) {
    if (/aria-label(?:ledby)?=/.test(tag)) assert.match(tag, /role="(?:group|status|alert|img)"/, tag);
  }
}

test('TruthBadge retains state and reason as text without naming generic spans or adding live regions', () => {
  for (const [state, label] of [['live', '실시간'], ['partial', '일부 데이터'], ['syncing', '동기화 중'],
    ['loading', '불러오는 중'], ['preview', 'Preview · 연결 필요'], ['error', '읽기 실패']]) {
    const html = render(TruthBadge, { state, reason: '원장 확인 필요' });
    assertNoNamedGeneric(html);
    assert.ok(html.includes(`${label} · 원장 확인 필요`));
    assert.doesNotMatch(html, /role=|aria-live=/);
  }
  const custom = render(TruthBadge, { state: 'preview', label: 'Shadow · 세션 연결 필요' });
  assertNoNamedGeneric(custom);
  assert.ok(custom.includes('Shadow · 세션 연결 필요'));
});

test('Daily Brief retains its heading, named navigation and focus group without redundant generic names', () => {
  const tasks = render(TaskToday, { taskToday: { state: 'preview', items: [] } });
  assertNoNamedGeneric(tasks);
  assert.match(tasks, /<h3\b[^>]*>오늘 할 일<\/h3>/);
  assert.equal((tasks.match(/aria-live=/g) || []).length, 1, 'only the existing save feedback is live');
  const nav = render(BriefNavigation, {});
  assertNoNamedGeneric(nav);
  assert.match(nav, /<nav aria-label="Daily Brief 빠른 이동"/);
  assert.ok(nav.includes('빠른 바로가기'));
  for (const state of ['preview', 'live', 'error']) {
    const focus = render(FocusSlots, { dailyFocus: { urgentKa: { state, item: null },
      focusCustomers: { state, items: [] }, todayAgenda: { state, items: [] } } });
    assertNoNamedGeneric(focus);
    assert.match(focus, /role="group" aria-label="긴급 KA와 집중 고객"/);
    assert.ok(focus.includes('집중 고객'));
    assert.match(focus, /role="group" aria-label="오늘 일정"/);
    assert.ok(focus.includes('오늘 일정 · 시간 흐름'));
    assert.doesNotMatch(focus, /role="status"|aria-live=/, 'panel naming must not add announcements');
    if (state === 'preview') assert.match(focus, /<button\b[^>]*>Google Calendar 연결<\/button>/);
    else assert.match(focus, /<button\b[^>]*>캘린더 열기<\/button>/);
  }
});


test('TodaySlots names the readable task group without adding announcements or changing unknown states', () => {
  for (const state of ['live', 'partial']) {
    const html = render(TodaySlots, { taskToday: { state, focus: { picked: 1, done: 0 },
      items: [{ id: 'local-slot', title: '합성 오늘 할 일', focusToday: true }] } });
    assertNoNamedGeneric(html);
    assert.match(html, /class="today-slots" role="group" aria-label="오늘 3개"/);
    assert.match(html, /<article\b[^>]*aria-label="1번 자리 · 합성 오늘 할 일"/);
    assert.equal((html.match(/class="today-slot(?: |")/g) || []).length, 3);
    assert.doesNotMatch(html, /role="status"|aria-live=/, 'group naming adds no live announcement');
  }
  for (const state of ['loading', 'preview', 'error']) {
    const html = render(TodaySlots, { taskToday: { state, items: [] } });
    assertNoNamedGeneric(html);
    assert.doesNotMatch(html, /today-slot--empty/, 'unread tasks must not become empty slots');
    if (state === 'loading') assert.match(html, /aria-busy="true"/);
    else {
      assert.match(html, /role="status"/);
      assert.match(html, new RegExp(`data-truth="${state}"`));
    }
  }
});
