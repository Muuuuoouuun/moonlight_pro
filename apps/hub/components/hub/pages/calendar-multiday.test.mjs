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
  return { render, buttons, outcomes };
}

test('Calendar renders one keyed marker on every day of a multi-day all-day event', () => {
  const input = event({ allDay: true, start: '2026-10-05', end: '2026-10-08' });
  const harness = mountedCalendar([input]), tree = harness.render(), cards = harness.buttons(tree);
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map(card => card.key)).size, 3);
  assert.ok(cards.every(card => card.props.style.top === 0 && card.props.style.height === 50));
  cards[2].props.onClick();
  const expanded = harness.render(), [outcome] = harness.outcomes(expanded);
  assert.equal(outcome.key, input.outcomeKey);
  assert.equal(outcome.props.eventKey, input.outcomeKey);
  assert.equal(outcome.props.whenLabel, '2026-10-05 – 2026-10-07 · 종일');
  assert.match(renderToStaticMarkup(expanded), /2026-10-05 – 2026-10-07 · 종일/);
});

test('Calendar keeps prior-week overlap and excludes an all-day end on the first visible day', () => {
  const harness = mountedCalendar([event({ allDay: true, start: '2026-10-04', end: '2026-10-07' })]);
  assert.equal(harness.buttons(harness.render()).length, 2);
  const excluded = mountedCalendar([event({ allDay: true, start: '2026-10-03', end: '2026-10-05' })]);
  assert.equal(excluded.buttons(excluded.render()).length, 0);
});

test('Calendar day view keeps an event that began before the selected day', () => {
  const harness = mountedCalendar([event({ allDay: true, start: '2026-10-04', end: '2026-10-07' })], { mode: 'day', selectedDate: new Date(2026, 9, 6, 12) });
  assert.equal(harness.buttons(harness.render()).length, 1);
});

test('multi-day timed cards stay inside the existing grid while the drawer keeps original dates', () => {
  const input = event({ start: '2026-10-05T17:00:00', end: '2026-10-06T10:00:00' });
  const harness = mountedCalendar([input]), cards = harness.buttons(harness.render());
  assert.deepEqual(cards.map(card => ({ top: card.props.style.top, height: card.props.style.height })), [{ top: 468, height: 154 }, { top: 0, height: 102 }]);
  cards[1].props.onClick();
  const [outcome] = harness.outcomes(harness.render());
  assert.equal(outcome.props.eventKey, input.outcomeKey);
  assert.equal(outcome.props.whenLabel, '2026-10-05 17:00 – 2026-10-06 10:00');
});

test('single-day timed and all-day rendering positions and drawer copy remain compatible', () => {
  const harness = mountedCalendar([event(), event({ id: 'all-day', outcomeKey: 'personal:all-day', allDay: true, start: '2026-10-05', end: '2026-10-06' })]);
  let cards = harness.buttons(harness.render());
  assert.deepEqual(cards.map(card => ({ top: card.props.style.top, height: card.props.style.height })), [{ top: 52, height: 50 }, { top: 0, height: 50 }]);
  cards[0].props.onClick();
  assert.equal(harness.outcomes(harness.render())[0].props.whenLabel, '9:00 – 10:00');
  cards = harness.buttons(harness.render());
  cards[1].props.onClick();
  assert.equal(harness.outcomes(harness.render())[0].props.whenLabel, '종일');
});

test('a single-day 01:00-only event keeps its existing position without widening the grid', () => {
  const harness = mountedCalendar([event({ start: '2026-10-05T01:00:00', end: '2026-10-05T02:00:00' })]);
  const [card] = harness.buttons(harness.render());
  assert.equal(card.props.style.top, -364);
  assert.equal(card.props.style.height, 50);
  card.props.onClick();
  assert.equal(harness.outcomes(harness.render())[0].props.whenLabel, '1:00 – 2:00');
});

test('midnight/01:00 ends do not create an extra full-day card', () => {
  const midnight = mountedCalendar([event({ start: '2026-10-05T17:00:00', end: '2026-10-06T00:00:00' })]);
  assert.equal(midnight.buttons(midnight.render()).length, 1);
  const early = mountedCalendar([event({ start: '2026-10-05T17:00:00', end: '2026-10-06T01:00:00' })]);
  assert.equal(early.buttons(early.render()).length, 1, 'the 00–01 segment stays outside the current 08–20 time grid');
});
