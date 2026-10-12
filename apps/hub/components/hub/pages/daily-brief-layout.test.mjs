import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { brandInWorkspace } from '../workspace-map.js';
import { REACTION_LABEL } from '../../../lib/sales-os/followup-scoring.js';

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
const compiled = ts.transpileModule([
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
  taskToday: { state: 'live', counts: { missed: 2, today: 3 } }, refreshTasks() {},
});
function components(runtime, getLedger, html = false) {
  const deps = {
    React: runtime, brandInWorkspace, FOCUS_REACTION_LABEL: REACTION_LABEL,
    REVIEW_EVENING_HOUR: 18, useDailyBriefLedger: getLedger,
    useGuruRecommendations: () => ({ reload() {} }), useToast: () => ({}),
    rankSignals: (signals) => signals,
  };
  for (const name of new Set([...compiled.matchAll(/React\.createElement\(([A-Z]\w*)/g)].map((m) => m[1]))) {
    if (name === 'FocusSlots' || name === 'BriefNavigation') continue;
    deps[name] = html ? () => null : name;
  }
  if (html) {
    deps.Card = ({ children, className, ...props }) => runtime.createElement('div', {
      className, 'aria-label': props['aria-label'],
    }, children);
    deps.Button = ({ children, onClick }) => runtime.createElement('button', { type: 'button', onClick }, children);
    deps.CalendarOutcome = ({ title }) => runtime.createElement('span', null, title);
  }
  return new Function(...Object.keys(deps), `${compiled}; return { DailyBrief, FocusSlots };`)(...Object.values(deps));
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
    assert.equal(jumps[0].props['aria-label'], '내 작업: 5건 확인');
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
    const card = findAll(tree, (n) => n.type === 'Card' && n.props['aria-label'] === '오늘 일정')[0];
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
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `local-${i}`, title: `합성 일정 ${i + 1}`, whenLabel: '09:00' }));
  const app = mount(focusOf('live', items));
  const tree = app.render();
  const card = findAll(tree, (n) => n.type === 'Card' && n.props['aria-label'] === '오늘 일정')[0];
  assert.deepEqual(findAll(card, (n) => n.type === 'CalendarOutcome').map((n) => n.props.title), items.slice(0, 3).map((n) => n.title));
  assert.ok(text(card).includes('외 2건 더 있음'));
});

test('real React server render retains the accessible nav for every read state', () => {
  for (const focus of [null, focusOf(), focusOf('error'), focusOf('preview')]) {
    const { DailyBrief } = components(React, () => ledgerOf(focus), true);
    const html = renderToStaticMarkup(React.createElement(DailyBrief, { onNavigate() {} }));
    assert.equal((html.match(/aria-label="Daily Brief 빠른 이동"/g) || []).length, 1);
    assert.equal((html.match(/class="daily-brief__jump"/g) || []).length, routes.length);
    assert.match(html, /aria-label="내 작업: 5건 확인"/);
  }
});

test('desktop shortcuts are visible while touch hitboxes and mobile input floors remain intact', () => {
  assert.doesNotMatch(css, /\.daily-brief__nav\s*\{\s*display:\s*none/);
  assert.match(css, /\.daily-brief__side-deck\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.daily-brief__nav-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(css, /\.daily-brief__jump\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 720px\)[\s\S]*min-height:\s*44px !important/);
  assert.match(css, /font-size:\s*max\(16px, 1em\) !important/);
});
