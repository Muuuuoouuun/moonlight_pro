import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { brandInWorkspace } from '../workspace-map.js';
import { collapsedTodayAgendaRows, todayAgendaRows } from './workflow-reading.js';
import { REACTION_LABEL } from '../../../lib/sales-os/followup-scoring.js';
import { buildDailyFocus } from '../../../lib/daily-focus.js';
import { buildTaskToday } from '../../../lib/task-today.js';

// Run the production JSX, with read hooks and unrelated widgets replaced by local
// boundaries. No API, browser effect, model, customer record or save is executed.
const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../hub-tokens.css', import.meta.url), 'utf8');
function section(start, end) {
  const at = source.indexOf(start);
  const to = end ? source.indexOf(end, at) : source.length;
  assert.ok(at >= 0 && to > at, `${start} section must stay findable`);
  return source.slice(at, to);
}
const agendaSource = readFileSync(new URL('./today-time-flow.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule([
  agendaSource.slice(agendaSource.indexOf('export function TodayTimeFlow')).replace('export function', 'function'),
  section('const BRIEF_DESTINATIONS =', '// Command Brief priority:'),
  section('function BriefNavigation(', '// The command —'),
  section('// §2 확정 슬롯', '// 60초 시계를 페이지 루트에서 분리'),
  section('export function DailyBrief(').replace('export function', 'function'),
].join('\n'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;

const routes = [
  'dashboard/work/my', 'dashboard/work/daily-review', 'dashboard/work/calendar',
  'dashboard/work/projects', 'dashboard/revenue/followups', 'dashboard/content/queue',
];
const focusOf = (state = 'live', items = []) => ({
  urgentKa: { state, item: null },
  focusCustomers: { state, items: [] },
  todayAgenda: { state, items },
});
const ledgerOf = (dailyFocus) => ({
  dailyFocus, signals: [], metrics: [], summary: {}, syncState: 'live',
  taskToday: { state: 'live', counts: { missed: 2, today: 3, total: 5 }, laterCount: 0 }, refreshTasks() {},
});
function components(runtime, getLedger, html = false) {
  const deps = {
    React: runtime, collapsedTodayAgendaRows, todayAgendaRows, brandInWorkspace, FOCUS_REACTION_LABEL: REACTION_LABEL,
    REVIEW_EVENING_HOUR: 18, useDailyBriefLedger: getLedger,
    useTodayTaskActions: taskToday => ({ taskToday, pendingIds: [] }),
    useGuruRecommendations: () => ({ reload() {} }), useToast: () => ({}),
    rankSignals: (signals) => signals,
  };
  for (const name of new Set([...compiled.matchAll(/React\.createElement\(([A-Z]\w*)/g)].map((m) => m[1]))) {
    if (name === 'React' || name === 'FocusSlots' || name === 'BriefNavigation' || name === 'TodayTimeFlow') continue;
    deps[name] = html ? () => null : name;
  }
  if (!html) deps.EmptyState = ({ title, description, action }) => runtime.createElement('div', null, title, description, action);
  if (html) {
    deps.Card = ({ children, className, ...props }) => runtime.createElement('div', {
      className, 'aria-label': props['aria-label'],
    }, children);
    deps.Button = ({ children, onClick }) => runtime.createElement('button', { type: 'button', onClick }, children);
    deps.CalendarOutcome = ({ title, whenLabel }) => runtime.createElement('span', null, whenLabel, ' ', title);
  }
  return new Function(...Object.keys(deps), `${compiled}; return { DailyBrief, FocusSlots, BriefNavigation };`)(...Object.values(deps));
}
function findAll(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children || [], predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node == null || typeof node !== 'object') return node == null ? '' : String(node);
  return text(node.props?.children || []);
}
function mount(dailyFocus) {
  let ledger = ledgerOf(dailyFocus);
  let active;
  const slots = new Map();
  const hookCounts = new Map();
  const navigations = [];
  const runtime = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) {
      const index = active.count++;
      if (!(index in active.slots)) active.slots[index] = typeof initial === 'function' ? initial() : initial;
      const ownedSlots = active.slots;
      return [ownedSlots[index], (value) => { ownedSlots[index] = typeof value === 'function' ? value(ownedSlots[index]) : value; }];
    },
    useCallback: (callback) => callback, useMemo: (callback) => callback(), useEffect() {},
  };
  const { DailyBrief } = components(runtime, () => ledger);
  function materialize(node) {
    if (Array.isArray(node)) return node.map(materialize);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const previous = active;
      if (!slots.has(node.type)) slots.set(node.type, []);
      active = { slots: slots.get(node.type), count: 0 };
      const result = node.type(node.props);
      hookCounts.set(node.type.name, active.count);
      active = previous;
      return materialize(result);
    }
    return { ...node, props: { ...node.props, children: materialize(node.props.children) } };
  }
  return {
    render(next = ledger.dailyFocus) {
      ledger = ledgerOf(next);
      return materialize(runtime.createElement(DailyBrief, { onNavigate: (target) => navigations.push(target) }));
    }, hookCounts, navigations,
  };
}

test('production DailyBrief renders one navigable shortcut set for missing/live/error focus and transitions', () => {
  const app = mount(null);
  for (const focus of [null, focusOf(), focusOf('error'), null, focusOf('preview')]) {
    const tree = app.render(focus);
    const navs = findAll(tree, (n) => n.type === 'nav' && n.props['aria-label'] === 'Daily Brief 빠른 이동');
    assert.equal(navs.length, 1, 'the same shortcut set must remain visible exactly once');
    const jumps = findAll(navs[0], (n) => n.type === 'button');
    assert.equal(jumps.length, routes.length);
    for (const jump of jumps) assert.equal(jump.props['aria-label'], undefined, 'native button names follow their visible label and detail');
    assert.equal(text(jumps[0]), '내 작업열린 할 일 5건');
    app.navigations.length = 0;
    jumps.forEach((button) => button.props.onClick());
    assert.deepEqual(app.navigations, routes);
    const decks = findAll(tree, (n) => n.props.className === 'daily-brief__side-deck');
    assert.equal(decks.length, focus ? 1 : 0);
    if (focus) assert.equal(findAll(decks[0], (n) => n.type === 'nav').length, 1);
  }
});

test('FocusSlots keeps its state hooks stable when focus changes between absent and present', () => {
  const app = mount(null);
  for (const focus of [null, focusOf(), focusOf('error'), null, focusOf('preview')]) {
    app.render(focus);
    assert.equal(app.hookCounts.get('FocusSlots'), 2, 'conditional early return must follow both state hooks');
  }
});

test('compact calendar keeps one state-appropriate CTA and truthful error/preview/live empty states', () => {
  const app = mount(null);
  for (const [state, label, message] of [
    ['preview', 'Google Calendar 연결', 'Google Calendar 미연결'],
    ['error', '캘린더 열기', '캘린더를 읽지 못했습니다'],
    ['live', '캘린더 열기', '오늘 예정된 일정이 없습니다'],
  ]) {
    const tree = app.render(focusOf(state));
    const card = findAll(tree, (n) => n.type === 'Card' && text(n).includes('오늘 일정'))[0];
    const buttons = findAll(card, (n) => n.type === 'Button');
    assert.equal(buttons.length, 1, `${state}: calendar card has one CTA`);
    assert.equal(text(buttons[0]), label);
    assert.ok(text(card).includes(message));
    assert.equal(findAll(card, (n) => n.props.role === 'alert').length, state === 'error' ? 1 : 0);
    buttons[0].props.onClick();
    assert.equal(app.navigations.at(-1), 'dashboard/work/calendar');
  }
});

test('compact agenda exposes three events and an honest count for remaining events', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `local-${i}`, outcomeKey: `original-${i}`, title: `합성 일정 ${i + 1}`, whenLabel: '09:00' }));
  const app = mount(focusOf('live', items));
  const tree = app.render();
  const card = findAll(tree, (n) => n.type === 'Card' && text(n).includes('오늘 일정'))[0];
  assert.deepEqual(findAll(card, (n) => n.type === 'CalendarOutcome').map((n) => n.props.title), items.slice(0, 3).map((n) => n.title));
  assert.ok(text(card).includes('일정 2건 더 보기'));
  const expand = findAll(card, node => node.type === 'Button' && node.props['aria-expanded'] === false)[0];
  expand.props.onClick();
  const expanded = app.render();
  assert.deepEqual(findAll(expanded, node => node.type === 'CalendarOutcome').map(node => node.props.eventKey), items.map(item => item.outcomeKey));
  const collapse = findAll(expanded, node => node.type === 'Button' && node.props['aria-expanded'] === true)[0];
  collapse.props.onClick();
  const collapsed = app.render();
  const rows = findAll(collapsed, node => node.type === 'li' && node.props.className === 'workflow-agenda__item');
  assert.equal(rows.filter(node => !node.props.hidden).length, 3, 'only three events remain visible');
  assert.equal(rows.filter(node => node.props.hidden).length, 2, 'visited editors stay mounted while collapsed');
  assert.deepEqual(findAll(collapsed, node => node.type === 'CalendarOutcome').map(node => node.props.eventKey), items.map(item => item.outcomeKey), 'the same keyed editors retain pending save/conflict state');
  findAll(collapsed, node => node.type === 'Button' && node.props['aria-expanded'] === false)[0].props.onClick();
  assert.equal(findAll(app.render(), node => node.type === 'li' && node.props.hidden).length, 0);
});

test('time flow preserves partial truth and never shows failed or preview rows as real events', () => {
  const items = [{ id: 'local-only', outcomeKey: 'original', title: '합성 일정', whenLabel: '10:00' }];
  const app = mount(focusOf('partial', items));
  let tree = app.render();
  assert.match(text(tree), /일부 일정만 확인했습니다/);
  assert.equal(findAll(tree, node => node.type === 'CalendarOutcome').length, 1);
  tree = app.render(focusOf('partial'));
  assert.match(text(tree), /오늘 일정이 없다고 확정할 수 없습니다/);
  for (const state of ['error', 'preview']) {
    tree = app.render(focusOf(state, items));
    assert.equal(findAll(tree, node => node.type === 'CalendarOutcome').length, 0);
    assert.doesNotMatch(text(tree), /오늘 예정된 일정이 없습니다/);
  }
});

test('real React server render retains the accessible nav for every read state', () => {
  for (const focus of [null, focusOf(), focusOf('error'), focusOf('preview')]) {
    const { DailyBrief } = components(React, () => ledgerOf(focus), true);
    const html = renderToStaticMarkup(React.createElement(DailyBrief, { onNavigate() {} }));
    assert.equal((html.match(/aria-label="Daily Brief 빠른 이동"/g) || []).length, 1);
    assert.equal((html.match(/class="daily-brief__jump"/g) || []).length, routes.length);
    assert.doesNotMatch(html, /class="daily-brief__jump"[^>]*aria-label=/);
    assert.match(html, /<strong>내 작업<\/strong><small>열린 할 일 5건<\/small>/);
  }
});

test('quick navigation counts every open task before and after focus selection, completion and deletion', () => {
  const now = new Date('2026-10-27T03:00:00Z'), date = '2026-10-27';
  const tasks = Array.from({ length: 6 }, (_, i) => ({ id: `open-${i}`, title: `할 일 ${i}`, status: 'todo', focusDates: [] }));
  const { BriefNavigation } = components(React, () => ledgerOf(null), true);
  const detail = rows => renderToStaticMarkup(React.createElement(BriefNavigation, { taskToday: { ...buildTaskToday(rows, { now }), state: 'live' } }));
  assert.match(detail(tasks), /열린 할 일 6건/);
  const selected = tasks.map((task, i) => i === 0 ? { ...task, focusDates: [date] } : task);
  assert.match(detail(selected), /열린 할 일 6건/, 'putting a task in a slot never completes or removes it');
  const completed = selected.map((task, i) => i === 0 ? { ...task, status: 'done', completedAt: now.toISOString() } : task);
  assert.match(detail(completed), /열린 할 일 5건/);
  assert.match(detail(completed.filter(task => task.id !== 'open-1')), /열린 할 일 4건/);
});

test('carry-over projection reaches Today with original dated start, not false live-empty copy', () => {
  const focus = buildDailyFocus({ now: new Date('2026-10-20T07:00:00+09:00'), calendar: { ok: true, items: [
    { id: 'trip', summary: '합성 출장', start: { date: '2026-10-19' }, end: { date: '2026-10-22' }, outcomeKey: 'trip-key' },
    { id: 'travel', summary: '합성 이동', start: { dateTime: '2026-10-19T23:00:00+09:00' }, end: { dateTime: '2026-10-20T07:30:00+09:00' }, outcomeKey: 'travel-key' },
  ] } });
  const outcomes = findAll(mount(focus).render(), node => node.type === 'CalendarOutcome');
  assert.deepEqual(outcomes.map(node => [node.props.eventKey, node.props.whenLabel]), [
    ['trip-key', '종일'], ['travel-key', '2026-10-19 23:00 시작'],
  ]);
  const { DailyBrief } = components(React, () => ledgerOf(focus), true);
  const html = renderToStaticMarkup(React.createElement(DailyBrief, { onNavigate() {} }));
  assert.match(html, /2026-10-19 23:00 시작/);
  assert.match(html, /종일/);
  assert.doesNotMatch(html, /오늘 예정된 일정이 없습니다|진행 중/);
});

test('desktop shortcuts are visible while touch hitboxes and mobile input floors remain intact', () => {
  assert.doesNotMatch(css, /\.daily-brief__nav\s*\{\s*display:\s*none/);
  assert.match(css, /\.daily-brief__side-deck\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.daily-brief__nav-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(css, /\.daily-brief__jump\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 720px\)[\s\S]*min-height:\s*44px !important/);
  assert.match(css, /font-size:\s*max\(16px, 1em\) !important/);
});
