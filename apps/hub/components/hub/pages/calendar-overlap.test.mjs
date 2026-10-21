import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { resolveCalendarView } from '../calendar-view.js';
import { CalendarAgenda } from '../calendar-agenda.jsx';
import { resolveCalendarCapabilities } from '../../../lib/calendar-capabilities.js';
import { mapTasksToCalendar } from '../../../lib/calendar-task-view.js';
import { calendarEventCardGeometry, calendarEventWhenLabel, calendarGridRange, mapGoogleEventsToGrid } from '../../../lib/calendar-event-view.js';

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
function mountedCalendar(events, { mode = 'week', compact = false, selectedDate = new Date(2026, 9, 5, 12), calendar = {}, connectionStatus = 'idle', connectionMessage = '' } = {}) {
  const state = [];
  let cursor = 0, compactView = compact;
  const overrides = {
    0: new Date(2026, 9, 5, 12), 1: selectedDate, 2: mode,
    3: connectionStatus, 4: connectionMessage,
    9: { status: 'live', source: 'multi', readOnly: true, message: '', events, ...calendar },
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
  const deps = { React: hooks, resolveCalendarView, useCalendarCompactView: () => compactView, CalendarAgenda, resolveCalendarCapabilities, mapTasksToCalendar, calendarEventCardGeometry, calendarEventWhenLabel, calendarGridRange, mapGoogleEventsToGrid,
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
  return { render, resize: value => { compactView = value; }, buttons, outcomes, state, find, grids: tree => find(tree, node => node.props?.className === 'hub-calendar-grid') };
}

const nodeText = node => Array.isArray(node) ? node.map(nodeText).join('') : node && typeof node === 'object' ? nodeText(node.props?.children) : node == null ? '' : String(node);

test('temporary calendar read failure offers a read retry, not an OAuth reconnect', () => {
  for (const message of ['', 'calendar-read-failed', 'Calendar 일정을 불러오지 못했습니다.']) {
    const harness = mountedCalendar([], { calendar: { status: 'error', source: null, message } });
    const tree = harness.render(), html = renderToStaticMarkup(tree);
    assert.match(html, /캘린더를 읽지 못했습니다/);
    assert.doesNotMatch(html, /Not connected|connection required|Connect Google Calendar/);
    const retry = harness.find(tree, node => node.props?.onClick && nodeText(node) === '일정 다시 불러오기');
    assert.equal(retry.length, 1);
    assert.equal(harness.state[10], 0);
    retry[0].props.onClick();
    assert.equal(harness.state[10], 1, 'retry only increments the existing read hook, not connectGoogleCalendar');
  }
});

test('loading does not claim disconnected or allow an OAuth connection action', () => {
  const harness = mountedCalendar([], { calendar: { status: 'loading', source: null } });
  const tree = harness.render(), html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /Not connected|Connect Google Calendar/);
  const control = harness.find(tree, node => node.props?.onClick && nodeText(node) === '일정 확인 중');
  assert.equal(control.length, 1);
  assert.equal(control[0].props.disabled, true);
});

test('a new read failure outranks stale connection-success copy and color', () => {
  const harness = mountedCalendar([], { calendar: { status: 'error' }, connectionStatus: 'connected', connectionMessage: '이전 연결 성공' });
  const tree = harness.render(), html = renderToStaticMarkup(tree);
  assert.match(html, /캘린더를 읽지 못했습니다/);
  assert.doesNotMatch(html, /이전 연결 성공|synced 2m ago/);
  const status = harness.find(tree, node => node.type === 'span' && nodeText(node) === '● 캘린더 읽기 실패');
  assert.equal(status[0].props.style.color, 'var(--danger)');
  harness.state[8] = '합성 일정 생성 실패';
  assert.match(renderToStaticMarkup(harness.render()), /합성 일정 생성 실패/, 'explicit write failure retains first priority');
});

test('calendar refetch retries only the same event GET and recovers a failed read', async () => {
  const states = [], effects = [], requests = [];
  let cursor = 0, previousDeps;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useCallback: callback => callback,
    useEffect(callback, deps) {
      if (!previousDeps || deps.some((dep, i) => dep !== previousDeps[i])) effects.push(callback);
      previousDeps = deps;
    },
  };
  const read = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) throw new Error('synthetic read failure');
    return { ok: true, json: async () => ({ status: 'live', source: 'oauth', events: [event()] }) };
  };
  const useEvents = new Function('React', 'fetch', `${javascript}; return useCalendarEvents;`)(hooks, read);
  const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 19 + i));
  const render = () => { cursor = 0; return useEvents(days); };
  render(); effects.shift()(); await new Promise(resolve => setImmediate(resolve));
  const failed = render(); assert.equal(failed.status, 'error');
  failed.refetch(); render(); effects.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(render().status, 'live');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, requests[1].url);
  assert.ok(requests.every(request => request.url.startsWith('/api/calendar/google/event?') && !request.options.method));
});

test('partial OAuth keeps read event cards visible without a complete/live caption', () => {
  const harness = mountedCalendar([event()], { calendar: { status: 'partial', source: 'oauth', readOnly: false } });
  const tree = harness.render();
  assert.equal(harness.buttons(tree).length, 1);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /일부 일정만 확인/);
  assert.doesNotMatch(html, /Google Calendar live|Not connected/);
});

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

test('00–01 multi-day segments are visible and never narrow a non-overlapping all-day marker', () => {
  const harness = mountedCalendar([
    event({ id: 'all-day', outcomeKey: 'personal:all-day', allDay: true, start: '2026-10-06', end: '2026-10-07' }),
    ...['a', 'b', 'c'].map(id => event({ id, outcomeKey: `personal:${id}`, start: '2026-10-05T23:00:00', end: '2026-10-06T01:00:00' })),
  ]);
  const tree = harness.render(), cards = harness.buttons(tree);
  assert.equal(cards.length, 7);
  const allDayCard = cards.find(card => card.key.includes('personal:all-day:'));
  assert.equal(allDayCard.props.style.width, 'calc(100% - 8px)');
  assert.equal(allDayCard.props.style.left, 4);
  for (const day of ['2026-10-05', '2026-10-06']) assertNoOcclusion(cards.filter(card => card.key.endsWith(day)), 148);
  assert.ok(harness.grids(tree).every(grid => grid.props.style.gridTemplateColumns.includes('minmax(149px, 1fr)')));
});

test('day view divides overlapping cards inside the existing 320px day track', () => {
  const harness = mountedCalendar([row('first', '09:00', '11:00'), row('second', '10:00', '12:00')], { mode: 'day' });
  const tree = harness.render(), cards = harness.buttons(tree);
  assertNoOcclusion(cards, 319);
  assert.ok(harness.grids(tree).every(grid => grid.props.style.gridTemplateColumns === '56px repeat(1, minmax(320px, 1fr))'));
});


test('single-day 01–02 cards extend the time origin and retain distinct touch columns', () => {
  const harness = mountedCalendar(['a', 'b', 'c'].map(id => row(id, '01:00', '02:00')));
  const tree = harness.render(), cards = harness.buttons(tree);
  assert.equal(cards.length, 3);
  assert.ok(cards.every(card => card.props.style.top === 0 && card.props.style.height === 50));
  assertNoOcclusion(cards, 148);
  assert.ok(harness.grids(tree).every(grid => grid.props.style.gridTemplateColumns.includes('minmax(149px, 1fr)')));
});

test('consecutive 15-minute cards do not occlude their 44px mobile touch rectangles', () => {
  const harness = mountedCalendar([
    row('short-a', '09:00', '09:15'), row('short-b', '09:15', '09:30'),
    row('short-c', '09:30', '09:45'), row('short-d', '09:45', '10:00'),
  ]);
  const cards = harness.buttons(harness.render());
  // At 390px the existing touch CSS increases the rendered height to 44px.
  const touchCards = cards.map(card => ({ ...card, props: { ...card.props, style: { ...card.props.style, height: Math.max(44, card.props.style.height) } } }));
  assertNoOcclusion(touchCards, 196);
  assert.ok(cards.every(card => card.props.style.height >= 44));
});

test('all-day card copy is truthful rather than its synthetic 08–09 grid marker', () => {
  const harness = mountedCalendar([event({ allDay: true, start: '2026-10-05', end: '2026-10-06' })]);
  const [card] = harness.buttons(harness.render());
  const html = renderToStaticMarkup(card);
  assert.match(html, /종일/);
  assert.doesNotMatch(html, /8:00.*9:00/);
});

test('received 07:00 cards are inside the visible grid, never above its scroll origin', () => {
  const harness = mountedCalendar([row('early', '07:00', '07:30'), row('ordinary', '09:00', '10:00')]);
  const cards = harness.buttons(harness.render());
  assert.equal(cards.length, 2);
  assert.ok(cards.every(card => card.props.style.top >= 0));
});

test('short-card title cannot wrap over the truthful time row, and accessible copy preserves the full value', () => {
  const harness = mountedCalendar([row('short-title', '09:00', '09:05', { title: '아주 긴 일정 제목 '.repeat(8) })]);
  const [card] = harness.buttons(harness.render());
  const html = renderToStaticMarkup(card);
  assert.match(html, /white-space:nowrap/);
  assert.match(html, /9:00 – 9:05/);
  assert.doesNotMatch(html, /9:00 – 9:15/);
  assert.match(card.props['aria-label'], /9:00 – 9:05/);
  assert.equal(card.props.title, `${'아주 긴 일정 제목 '.repeat(8)} · 9:00 – 9:05`);
});

test('late cards and their full touch rectangles fit the grid content height in week and day views', () => {
  for (const mode of ['week', 'day']) {
    const harness = mountedCalendar([row('late', '23:55', '23:59')], { mode });
    const tree = harness.render(), [card] = harness.buttons(tree);
    const timeGrid = harness.grids(tree).find(grid => grid.props.style.position === 'relative');
    assert.ok(card.props.style.top >= 0);
    assert.ok(card.props.style.top + card.props.style.height <= timeGrid.props.style.minHeight);
    card.props.onClick();
    assert.equal(harness.outcomes(harness.render())[0].props.whenLabel, '23:55 – 23:59');
  }
});


test('the reported 09:00/09:15 pair has distinct 44px touch rectangles in both Week and Day', () => {
  for (const mode of ['week', 'day']) {
    const harness = mountedCalendar([row('A', '09:00', '09:15'), row('B', '09:15', '09:30')], { mode });
    const cards = harness.buttons(harness.render());
    assert.deepEqual(cards.map(card => [card.props.style.top, card.props.style.height]), [[52, 44], [65, 44]]);
    assertNoOcclusion(cards, mode === 'day' ? 319 : 119);
    assert.ok(cards.every(card => box(card, mode === 'day' ? 319 : 119).width >= 44));
  }
});


test('Calendar defaults to Agenda on compact viewports and Week on desktop without changing the selected date', () => {
  for (const compact of [true, false]) {
    const app = mountedCalendar([], { mode: null, compact });
    const tree = app.render();
    const control = app.find(tree, node => node.props?.label === '캘린더 보기')[0];
    assert.equal(control.props.value, compact ? 'agenda' : 'week');
    assert.deepEqual(control.props.options.map(option => option.key), ['agenda', 'day', 'week']);
    assert.equal(app.find(tree, node => node.type === CalendarAgenda).length, compact ? 1 : 0);
    assert.equal(app.state[1].getDate(), 5);
  }
});

test('responsive default follows viewport only until an explicit view choice, then preserves that choice', () => {
  const app = mountedCalendar([], { mode: null, compact: true });
  const view = () => app.find(app.render(), node => node.props?.label === '캘린더 보기')[0];
  assert.equal(view().props.value, 'agenda');
  app.resize(false); assert.equal(view().props.value, 'week');
  app.resize(true); assert.equal(view().props.value, 'agenda');
  for (const mode of ['week', 'day', 'agenda']) {
    view().props.onChange(mode);
    for (const compact of [false, true, false]) { app.resize(compact); assert.equal(view().props.value, mode); }
  }
});

test('Agenda keeps day navigation and original event drawer identity, not a different write workflow', () => {
  const input = event({ allDay: true, start: '2026-10-04', end: '2026-10-07' });
  const app = mountedCalendar([input], { mode: null, compact: true });
  let tree = app.render();
  const agenda = app.find(tree, node => node.type === CalendarAgenda)[0];
  assert.equal(agenda.props.events.length, 1);
  assert.equal(agenda.props.events[0].originalStart, input.start);
  agenda.props.onSelectEvent(agenda.props.events[0]);
  assert.equal(app.outcomes(app.render())[0].props.eventKey, input.outcomeKey);
  const next = app.find(tree, node => node.props?.tooltip === 'Next day')[0];
  next.props.onClick();
  assert.equal(app.state[1].getDate(), 6);
  assert.equal(app.find(app.render(), node => node.type === CalendarAgenda)[0].props.events.length, 1);
  next.props.onClick();
  assert.equal(app.state[1].getDate(), 7);
  assert.equal(app.find(app.render(), node => node.type === CalendarAgenda)[0].props.events.length, 0, 'all-day end is exclusive');
});
