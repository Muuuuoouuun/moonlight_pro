import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { brandInWorkspace } from './workspace-map.js';
import { REACTION_LABEL } from '../../lib/sales-os/followup-scoring.js';

const primitives = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
const daily = readFileSync(new URL('./pages/daily-brief.jsx', import.meta.url), 'utf8');
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} stays findable`);
  return source.slice(from, to).replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
}
const code = ts.transpileModule([
  section(primitives, 'export function Card(', '// Wraps instead'),
  section(primitives, 'export function SectionTitle(', 'export function EmptyState('),
  section(primitives, 'export const Button =', 'export const IconButton ='),
  section(primitives, 'const TRUTH_STATES =', 'export function DateQuickPresets('),
  section(daily, 'const BRIEF_DESTINATIONS =', '// Command Brief priority:'),
  section(daily, 'function TaskToday(', 'const EMPTY_DAILY_BRIEF_STATE ='),
  section(daily, 'function BriefNavigation(', '// The command —'),
  section(daily, '// §2 확정 슬롯', '// 60초 시계를 페이지 루트에서 분리'),
].join('\n'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
// Render the production badge, Card, heading and page slots. Unrelated widgets
// are boundaries; no hook effect, API, business write or browser is executed.
const own = new Set(['Card', 'Button', 'SectionTitle', 'TruthBadge', 'TaskToday', 'BriefNavigation', 'FocusSlots']);
const deps = { React, brandInWorkspace, FOCUS_REACTION_LABEL: REACTION_LABEL,
  MAX_FOCUS_PER_DAY: 3, REVIEW_EVENING_HOUR: 18, useUndoableAction: () => ({}) };
for (const name of new Set([...code.matchAll(/React\.createElement\(([A-Z]\w*)/g)].map(match => match[1]))) {
  if (!own.has(name)) deps[name] = () => null;
}
const { TruthBadge, TaskToday, BriefNavigation, FocusSlots } = new Function(...Object.keys(deps),
  `${code}; return { TruthBadge, TaskToday, BriefNavigation, FocusSlots };`)(...Object.values(deps));
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
    assert.ok(focus.includes('오늘 일정'));
    assert.doesNotMatch(focus, /role="status"|aria-live=/, 'panel naming must not add announcements');
    if (state === 'live') assert.ok(focus.includes('title="캘린더 열기 및 일정 관리"'));
  }
});
