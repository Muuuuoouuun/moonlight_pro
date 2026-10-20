import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { collapsedTodayAgendaRows, todayAgendaRows } from './workflow-reading.js';

const source = readFileSync(new URL('./today-time-flow.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(
  source.slice(source.indexOf('export function TodayTimeFlow')).replace('export function', 'function'),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(child => find(child, predicate))
  : node && typeof node === 'object' ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)] : [];

// Execute the production component and commit its effects without a browser, API
// or outcome write. The clock's state is controlled by this isolated test only.
function mount(items, now) {
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
      const tree = Component({ agenda: { state: 'live', items } });
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
