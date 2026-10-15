import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { resolveCalendarCapabilities } from '../../../lib/calendar-capabilities.js';
import { mapTasksToCalendar } from '../../../lib/calendar-task-view.js';
import { calendarEventWhenLabel, mapGoogleEventsToGrid } from '../../../lib/calendar-event-view.js';

const source = readFileSync(new URL('./work.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('work.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const names = new Set(['startOfWeek', 'sameDate', 'addDays', 'formatWeekRange', 'buildCalendarWeek', 'formatHour', 'useCalendarEvents', 'useCalendarTasks', 'Calendar', 'mapGoogleEventsToGrid']);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
  .map(node => node.getText(ast).replace(/^export /, '')).join('\n');
const javascript = ts.transpileModule(`const DAY_MS = 86400000; const EN_MONTH = new Intl.DateTimeFormat('en-US', {month:'long'});\n${functions}`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

const event = (change = {}) => ({
  id: 'event-a', outcomeKey: 'personal:event-a', title: '로컬 일정 입력', source: 'personal',
  start: '2026-10-05T09:00:00', end: '2026-10-05T10:00:00', allDay: false, ...change,
});

// Real Calendar JSX and click callbacks, with only its hook data and existing
// composites stubbed at the props boundary. No effect or provider call runs.
function mountedCalendar(events, { mode = 'week', selectedDate = new Date(2026, 9, 5, 12) } = {}) {
  const state = [];
  let cursor = 0;
  const overrides = {
    0: new Date(2026, 9, 5, 12), 1: selectedDate, 2: mode,
    9: { status: 'live', source: 'multi', readOnly: true, message: '', events },
    11: { status: 'live', tasks: [], message: '' },
  };
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = Object.hasOwn(overrides, index) ? overrides[index] : typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef: initial => ({ current: initial }), useEffect() {}, useCallback: callback => callback,
  };
  const box = ({ children }) => React.createElement('div', null, children);
  const Outcome = ({ eventKey, whenLabel }) => React.createElement('span', { 'data-event-key': eventKey }, whenLabel);
  const deps = { React: hooks, resolveCalendarCapabilities, mapTasksToCalendar, calendarEventWhenLabel, mapGoogleEventsToGrid,
    useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace() {} }), usePathname: () => '/dashboard/work/calendar',
    CalendarOutcome: Outcome, Card: box, Drawer: box, Button: box, IconButton: box, SegmentedControl: box, SyncBadge: box, TruthBadge: box, Iconed: () => null,
  };
  const Calendar = new Function(...Object.keys(deps), `${javascript}\nreturn Calendar;`)(...Object.values(deps));
  const render = () => { cursor = 0; return Calendar({ onNavigate() {} }); };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(child => find(child, predicate));
    return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)];
  };
  const buttons = tree => find(tree, node => node.type === 'button' && node.props.className === 'hub-card-link');
  const outcomes = tree => find(tree, node => node.type === Outcome);
  return { render, buttons, outcomes, grids: tree => find(tree, node => node.props?.className === 'hub-calendar-grid') };
}


const pixel = (value, width) => {
  if (typeof value === 'number') return value;
  const match = value.match(/^calc\(([\d.]+)% ([+-]) ([\d.]+)px\)$/);
  assert.ok(match, `unexpected CSS dimension: ${value}`);
  return Number(match[1]) * width / 100 + (match[2] === '+' ? 1 : -1) * Number(match[3]);
};
const box = (card, width = 119) => ({
  left: pixel(card.props.style.left, width), width: pixel(card.props.style.width, width),
  top: card.props.style.top, height: card.props.style.height,
});
function assertNoOcclusion(cards, width = 119) {
  for (let a = 0; a < cards.length; a += 1) for (let b = a + 1; b < cards.length; b += 1) {
    const first = box(cards[a], width), second = box(cards[b], width);
    if (first.top >= second.top + second.height || second.top >= first.top + first.height) continue;
    assert.ok(first.left + first.width <= second.left || second.left + second.width <= first.left,
      `overlapping click rectangles: ${JSON.stringify([first, second])}`);
  }
}
const row = (id, start, end, extra = {}) => event({ id, outcomeKey: `personal:${id}`, title: `일정 ${id}`, start: `2026-10-05T${start}:00`, end: `2026-10-05T${end}:00`, ...extra });

test('all-day and overnight segments stay separately clickable with original drawer keys/times', () => {
  const allDay = event({ id: 'all-day', outcomeKey: 'personal:all-day', allDay: true, start: '2026-10-05', end: '2026-10-08' });
  const overnight = event({ id: 'overnight', outcomeKey: 'personal:overnight', start: '2026-10-05T17:00:00', end: '2026-10-06T10:00:00' });
  const harness = mountedCalendar([allDay, overnight]), cards = harness.buttons(harness.render());
  assert.equal(cards.length, 5);
  const tuesday = cards.filter(card => card.key.endsWith('2026-10-06'));
  assert.equal(tuesday.length, 2);
  assertNoOcclusion(tuesday);
  for (const card of tuesday) {
    assert.ok(box(card).width >= 44);
    card.props.onClick();
    const [outcome] = harness.outcomes(harness.render());
    const input = card.key.includes('all-day') ? allDay : overnight;
    assert.equal(outcome.key, input.outcomeKey);
    assert.equal(outcome.props.eventKey, input.outcomeKey);
    assert.equal(outcome.props.whenLabel, input.allDay ? '2026-10-05 – 2026-10-07 · 종일' : '2026-10-05 17:00 – 2026-10-06 10:00');
    assert.ok(renderToStaticMarkup(harness.render()).includes(outcome.props.whenLabel));
  }
});

test('overlapping single-day cards divide only horizontal geometry', () => {
  const harness = mountedCalendar([row('first', '09:00', '11:00'), row('second', '10:00', '12:00')]);
  const cards = harness.buttons(harness.render());
  assert.deepEqual(cards.map(card => [card.props.style.top, card.props.style.height]), [[52, 102], [104, 102]]);
  assertNoOcclusion(cards);
  cards[0].props.onClick();
  assert.equal(harness.outcomes(harness.render())[0].props.whenLabel, '9:00 – 11:00');
});

test('adjacent or separated events keep their existing full width and left inset', () => {
  const harness = mountedCalendar([row('first', '09:00', '10:00'), row('second', '10:00', '11:00'), row('third', '13:00', '14:00')]);
  const tree = harness.render(), cards = harness.buttons(tree);
  assert.ok(cards.every(card => card.props.style.width === 'calc(100% - 8px)' && card.props.style.left === 4));
  assert.ok(harness.grids(tree).every(grid => grid.props.style.gridTemplateColumns === '56px repeat(7, minmax(120px, 1fr))'));
});

test('connected overlap chains reuse an available column and later groups regain full width', () => {
  const harness = mountedCalendar([row('first', '09:00', '10:00'), row('middle', '09:30', '10:30'), row('last', '10:00', '11:00'), row('separate', '13:00', '14:00')]);
  const cards = harness.buttons(harness.render());
  assertNoOcclusion(cards);
  assert.equal(cards[0].props.style.left, cards[2].props.style.left);
  assert.equal(cards[0].props.style.width, cards[2].props.style.width);
  assert.equal(cards[3].props.style.width, 'calc(100% - 8px)');
});

test('three-way overlap widens only its day track to retain 44px clicks and shared grid alignment', () => {
  const harness = mountedCalendar(['a', 'b', 'c'].map(id => row(id, '09:00', '10:00')));
  const tree = harness.render(), cards = harness.buttons(tree), grids = harness.grids(tree);
  assert.equal(grids.length, 3);
  const template = grids[0].props.style.gridTemplateColumns;
  assert.ok(grids.every(grid => grid.props.style.gridTemplateColumns === template));
  assert.match(template, /^56px minmax\(149px, 1fr\) (minmax\(120px, 1fr\) ?){6}$/);
  assertNoOcclusion(cards, 148); // 149px grid track minus the existing 1px day border.
  assert.ok(cards.every(card => box(card, 148).width >= 44));
  assert.ok(cards.every(card => box(card, 148).left >= 4 && box(card, 148).left + box(card, 148).width <= 144.000001));
});

test('hidden 00–01 multi-day segments never narrow or widen a visible all-day marker', () => {
  const harness = mountedCalendar([
    event({ id: 'all-day', outcomeKey: 'personal:all-day', allDay: true, start: '2026-10-06', end: '2026-10-07' }),
    ...['a', 'b', 'c'].map(id => event({ id, outcomeKey: `personal:${id}`, start: '2026-10-05T23:00:00', end: '2026-10-06T01:00:00' })),
  ]);
  const tree = harness.render(), cards = harness.buttons(tree);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].props.style.width, 'calc(100% - 8px)');
  assert.equal(cards[0].props.style.left, 4);
  assert.ok(harness.grids(tree).every(grid => grid.props.style.gridTemplateColumns === '56px repeat(7, minmax(120px, 1fr))'));
});

test('day view divides overlapping cards inside the existing 320px day track', () => {
  const harness = mountedCalendar([row('first', '09:00', '11:00'), row('second', '10:00', '12:00')], { mode: 'day' });
  const tree = harness.render(), cards = harness.buttons(tree);
  assertNoOcclusion(cards, 319);
  assert.ok(harness.grids(tree).every(grid => grid.props.style.gridTemplateColumns === '56px repeat(1, minmax(320px, 1fr))'));
});


test('single-day 01–02 cards preserve old geometry without widening visible day tracks', () => {
  const harness = mountedCalendar(['a', 'b', 'c'].map(id => row(id, '01:00', '02:00')));
  const tree = harness.render(), cards = harness.buttons(tree);
  assert.equal(cards.length, 3);
  assert.ok(cards.every(card => card.props.style.top === -364 && card.props.style.height === 50 && card.props.style.width === 'calc(100% - 8px)' && card.props.style.left === 4));
  assert.ok(harness.grids(tree).every(grid => grid.props.style.gridTemplateColumns === '56px repeat(7, minmax(120px, 1fr))'));
});
