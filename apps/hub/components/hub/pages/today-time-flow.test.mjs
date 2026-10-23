import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { collapsedTodayAgendaRows, todayAgendaRows } from './workflow-reading.js';
import { buildDailyFocus } from '../../../lib/daily-focus.js';

const source = readFileSync(new URL('./today-time-flow.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(
  source.slice(source.indexOf('export function TodayTimeFlow')).replace('export function', 'function'),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(child => find(child, predicate))
  : node && typeof node === 'object' ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)] : [];

// Execute the production component and commit its effects without a browser, API
// or outcome write. The clock's state is controlled by this isolated test only.
function mount(items, now, agenda = {}) {
  const values = [], effects = new Map();
  let cursor = 0;
  const runtime = {
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity) } }; },
    useState(initial) {
      const key = cursor++;
      if (!(key in values)) values[key] = key === 0 ? new Date(now) : typeof initial === 'function' ? initial() : initial;
      return [values[key], next => { values[key] = typeof next === 'function' ? next(values[key]) : next; }];
    },
    useEffect(callback, dependencies) {
      const key = cursor++, previous = effects.get(key);
      if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
        effects.set(key, { callback, dependencies, pending: true });
      }
    },
  };
  const deps = {
    React: runtime, collapsedTodayAgendaRows, todayAgendaRows,
    window: { setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    Button: 'Button', Card: 'Card', EmptyState: 'EmptyState', Skeleton: 'Skeleton',
    TruthBadge: 'TruthBadge', CalendarOutcome: 'CalendarOutcome',
  };
  const Component = new Function(...Object.keys(deps), `${compiled}; return TodayTimeFlow;`)(...Object.values(deps));
  return {
    render() {
      cursor = 0;
      const tree = Component({ agenda: { state: 'live', items, ...agenda } });
      for (const effect of effects.values()) {
        if (effect.pending) { effect.pending = false; effect.callback(); }
      }
      return tree;
    },
    advance(value) { values[0] = new Date(value); },
  };
}

const items = [9, 10, 11, 16, 17].map(hour => ({
  id: `local-${hour}`, outcomeKey: `original-${hour}`, title: `합성 일정 ${hour}`,
  whenAt: `2026-10-20T${String(hour).padStart(2, '0')}:00:00+09:00`,
}));
const rows = tree => find(tree, node => node.type === 'li');
const visibleKeys = tree => rows(tree).filter(row => !row.props.hidden).map(row => row.props.key);

test('clock advancement keeps exposed outcome editors mounted with their original keys', () => {
  const app = mount(items, '2026-10-20T10:30:00+09:00');
  let tree = app.render();
  assert.deepEqual(visibleKeys(tree), ['original-10', 'original-11', 'original-16']);
  app.advance('2026-10-20T11:30:00+09:00');
  tree = app.render();
  assert.deepEqual(visibleKeys(tree), ['original-11', 'original-16', 'original-17']);
  assert.deepEqual(rows(tree).map(row => row.props.key), ['original-10', 'original-11', 'original-16', 'original-17']);
  assert.equal(rows(tree)[0].props.hidden, true, 'the old editor stays mounted rather than losing an in-flight result');
  assert.deepEqual(find(tree, node => node.type === 'CalendarOutcome').map(node => node.props.eventKey), rows(tree).map(row => row.props.key));
  find(tree, node => node.type === 'Button' && node.props['aria-expanded'] === false)[0].props.onClick();
  tree = app.render();
  assert.deepEqual(visibleKeys(tree), items.map(item => item.outcomeKey), 'expanded timeline shows every supplied event');
  find(tree, node => node.type === 'Button' && node.props['aria-expanded'] === true)[0].props.onClick();
  tree = app.render();
  assert.equal(rows(tree).length, items.length, 'collapse never unmounts visited editors');
  assert.deepEqual(visibleKeys(tree), ['original-11', 'original-16', 'original-17']);
});

test('the compact window does not hide focused content on a clock tick', () => {
  const app = mount(items, '2026-10-20T10:30:00+09:00');
  let tree = app.render();
  find(tree, node => node.type === 'ol')[0].props.onFocusCapture();
  app.advance('2026-10-20T11:30:00+09:00');
  tree = app.render();
  assert.deepEqual(visibleKeys(tree), ['original-10', 'original-11', 'original-16']);
  const list = find(tree, node => node.type === 'ol')[0];
  list.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null });
  tree = app.render();
  assert.deepEqual(visibleKeys(tree), ['original-11', 'original-16', 'original-17']);
});

test('100 supplied appointments reach disclosure while the initial component mounts only three editors', () => {
  const input = Array.from({ length: 100 }, (_, index) => ({
    id: `event-${index}`, outcomeKey: `outcome-${index}`, summary: `합성 일정 ${index}`,
    start: { dateTime: new Date(Date.parse('2026-10-20T08:00:00+09:00') + index * 5 * 60_000).toISOString() },
  }));
  const now = '2026-10-20T15:30:00+09:00';
  const agenda = buildDailyFocus({ calendar: { ok: true, items: input }, now: new Date(now) }).todayAgenda;
  const app = mount(agenda.items, now);
  let tree = app.render();
  assert.equal(agenda.items.length, 100);
  assert.equal(rows(tree).length, 3, 'initial mounting is bounded, not all 100 outcome editors');
  assert.deepEqual(visibleKeys(tree), ['outcome-89', 'outcome-90', 'outcome-91']);
  assert.deepEqual(find(tree, node => node.type === 'Button' && node.props['aria-expanded'] === false)[0].props.children, ['일정 97건 더 보기']);

  find(tree, node => node.type === 'ol')[0].props.onFocusCapture();
  app.advance('2026-10-20T15:36:00+09:00');
  tree = app.render();
  assert.deepEqual(visibleKeys(tree), ['outcome-89', 'outcome-90', 'outcome-91'], 'focused editor window stays stable');
  find(tree, node => node.type === 'ol')[0].props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null });
  tree = app.render();
  assert.deepEqual(visibleKeys(tree), ['outcome-91', 'outcome-92', 'outcome-93']);
  assert.equal(rows(tree).length, 5, 'previously exposed editors stay mounted');

  find(tree, node => node.type === 'Button' && node.props['aria-expanded'] === false)[0].props.onClick();
  tree = app.render();
  assert.deepEqual(visibleKeys(tree), input.map(item => item.outcomeKey), 'expansion exposes every supplied same-day appointment');
  find(tree, node => node.type === 'Button' && node.props['aria-expanded'] === true)[0].props.onClick();
  tree = app.render();
  assert.equal(rows(tree).length, 100, 'visited editors remain mounted after collapsing');
  assert.deepEqual(visibleKeys(tree), ['outcome-91', 'outcome-92', 'outcome-93']);
});

test('partial source reads expose the existing warning and never claim an empty day', () => {
  const agenda = buildDailyFocus({
    calendar: { ok: true, reason: 'partial-source-failure', items: [] }, now: new Date('2026-10-20T15:30:00+09:00'),
  }).todayAgenda;
  const tree = mount(agenda.items, '2026-10-20T15:30:00+09:00', agenda).render();
  assert.equal(find(tree, node => node.type === 'TruthBadge')[0].props.state, 'partial');
  assert.equal(find(tree, node => node.props?.role === 'status').length, 1);
  const original = find(tree, node => node.type === 'a')[0];
  assert.equal(original.props.href, 'https://calendar.google.com/');
  assert.equal(original.props.style.minHeight, 44);
  assert.equal(original.props.rel, 'noopener noreferrer');
  const copy = find(tree, node => node.type === 'p').flatMap(node => node.props.children).join(' ');
  assert.match(copy, /오늘 일정이 없다고 확정할 수 없습니다/);
  assert.doesNotMatch(copy, /오늘 예정된 일정이 없습니다/);
});


test('partial timeline labels the next known start rather than claiming the true next appointment', () => {
  const tree = mount(items, '2026-10-20T10:30:00+09:00', { state: 'partial', coverage: { truncated: true } }).render();
  assert.match(find(tree, node => node.props?.role === 'status')[0].props.children.join(' '), /읽기 제한 적용/);
  const next = rows(tree).find(row => row.props['data-next']);
  assert.equal(find(next, node => node.type === 'span')[0].props.children[0], '읽힌 일정 중 다음 시작');
});


test('the named schedule card exposes group semantics for its accessible name', () => {
  const tree = mount([], '2026-10-20T10:30:00+09:00').render();
  const card = find(tree, node => node.type === 'Card')[0];
  assert.equal(card.props.role, 'group');
  assert.equal(card.props['aria-label'], '오늘 일정');
});
