import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as order from '../../../lib/project-index-order.js';
import * as metrics from './project-pms-metrics.js';
import { readTaskChecklist } from '../../../lib/task-checklist.js';
import { selectUrgentProjectItems } from '../../../lib/project-urgent-items.js';
import { buildCurrentMonthProjectPreview } from '../../../lib/project-monthly-preview.js';

const controlsSource = readFileSync(new URL('./project-index-controls.jsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('./project-portfolio-workspace.jsx', import.meta.url), 'utf8');
const compile = source => ts.transpile(source.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, ''), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
const controlsCode = compile(controlsSource), workspaceCode = compile(workspaceSource);
const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const createElement = (type, props, ...children) => ({ type, key: props?.key, props: { ...props, children } });
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? [node.props?.children || []].flat(Infinity).map(text).join('') : '';
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...[node.props?.children || []].flat(Infinity).flatMap(child => nodes(child, predicate))];
}
const project = (id, done = 0, total = 2) => ({ id, name: id, statusKey: 'active', status: 'active', displayProgress: { value: Math.round(100 * done / total), source: 'tasks', done, total, partial: false } });

// Run actual hooks, effects and event handlers. Browser services are local mocks;
// no copied ordering/completion implementation, live data or transport is used.
function mounted(kind, initial, { storage = new Map(), reduced = false } = {}) {
  const cells = [], pending = [], writes = [], timers = new Map(), listeners = new Map();
  let cursor = 0, dirty = false, output, props = initial, timerId = 0, domRows = [];
  const media = { matches: reduced, addEventListener(_name, callback) { listeners.set('motion', callback); }, removeEventListener() { listeners.delete('motion'); } };
  const browser = { matchMedia: () => media, addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720 };
  const document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { writes.push({ key, value: JSON.parse(value) }); storage.set(key, value); } };
  const list = { scrollTop: 0, querySelectorAll: () => domRows, getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 400 }) };
  function effect(callback, deps) {
    const index = cursor++;
    if (!cells[index] || !same(cells[index].deps, deps)) pending.push({ index, callback, deps });
  }
  const React = { createElement, Fragment: 'fragment',
    useRef(value) { return cells[cursor++] ??= { current: value }; },
    useState(initial) { const index = cursor++; const cell = cells[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [cell.value, next => { const value = typeof next === 'function' ? next(cell.value) : next; if (!Object.is(cell.value, value)) { cell.value = value; dirty = true; } }]; },
    useMemo(callback, deps) { const index = cursor++; if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { value: callback(), deps }; return cells[index].value; },
    useCallback(callback, deps) { return this.useMemo(() => callback, deps); },
    useEffect: effect, useLayoutEffect: effect,
  };
  const styles = new Proxy({}, { get: (_, key) => key });
  const scope = { React, localStorage, window: browser, document, globalThis: { window: browser, document }, ...order, ...metrics,
    styles, indexStyles: styles, workStyles: styles, deliveryStyles: styles,
    Button: 'Button', Badge: 'Badge', Drawer: 'Drawer', EmptyState: 'EmptyState', IconButton: 'IconButton', Input: 'Input', SegmentedControl: 'SegmentedControl', Iconed: 'Iconed', BrandMark: 'BrandMark', ProjectWorkList: 'ProjectWorkList', ProjectDeliverySummary: 'ProjectDeliverySummary',
    projectGenreLabel: () => '', projectGenreTint: () => undefined, projectStatusLabel: value => value,
    readTaskChecklist, selectUrgentProjectItems, buildCurrentMonthProjectPreview,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  };
  const controls = new Function(...Object.keys(scope), `${controlsCode}\nreturn {useProjectIndexControls, ProjectIndexMenu};`)(...Object.values(scope));
  const workspace = new Function(...Object.keys({ ...scope, ...controls }), `${workspaceCode}\nreturn {ProjectPortfolioWorkspace, ProjectIndexRow};`)(...Object.values({ ...scope, ...controls }));
  function rowElement(id, index) {
    const button = { matches: () => true, getBoundingClientRect: () => ({ left: 0, right: 300, top: index * 40, bottom: index * 40 + 40 }), setPointerCapture() {}, releasePointerCapture() {}, focus() { document.activeElement = this; } };
    button.closest = selector => selector === 'button' ? button : null;
    return { dataset: { projectIndexId: id }, style: {}, isConnected: true, button, querySelector: () => button, getBoundingClientRect: () => ({ top: index * 40, height: 40 }) };
  }
  function render(next = props) {
    props = next;
    for (let turn = 0; turn < 12; turn++) {
      cursor = 0; pending.length = 0; dirty = false;
      if (kind === 'controls') {
        const value = controls.useProjectIndexControls(props.projects, props.key, props.allProjects || props.projects);
        output = { controls: value, menu: controls.ProjectIndexMenu({ controls: value, canWrite: false }) };
        value.listRef.current = list;
        const visible = value.doneCollapsed ? value.ordered.filter(item => !order.projectIndexDoneState(item)) : value.ordered;
        domRows = visible.map((item, index) => rowElement(item.id, index));
      } else {
        output = kind === 'row' ? workspace.ProjectIndexRow(props) : workspace.ProjectPortfolioWorkspace(props);
        const listNode = nodes(output, node => node.props?.className?.includes('hub-project-portfolio-index__list'))[0];
        if (listNode) listNode.props.ref.current = list;
        domRows = nodes(output, node => node.type?.name === 'ProjectIndexRow').map((node, index) => rowElement(node.props.project.id, index));
      }
      for (const item of pending.splice(0)) { cells[item.index]?.cleanup?.(); cells[item.index] = { deps: item.deps, cleanup: item.callback() }; }
      if (!dirty) return output;
    }
    throw new Error('hook did not settle');
  }
  render();
  return { render, storage, writes, media, document, listeners, get output() { return output; }, row: id => domRows.find(row => row.dataset.projectIndexId === id), unmount() { for (const cell of cells) cell?.cleanup?.(); }, changeMotion(value) { media.matches = value; listeners.get('motion')?.({ matches: value }); render(); } };
}
function pointer(row, y) { return { button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: y, currentTarget: row.button, target: row.button, preventDefault() {}, stopPropagation() {} }; }
function baseProps(projects, extra = {}) { return { projects, indexProjects: projects, portfolioProjects: projects, todosByProject: new Map(), brandByKey: new Map(), indexStorageKey: 'personal', sourceState: 'live', selectedProjectId: projects[0]?.id, query: '', ...extra }; }
const projectRows = tree => nodes(tree, node => node.type?.name === 'ProjectIndexRow');
const heading = tree => nodes(tree, node => node.key === 'done-group-heading')[0];
const status = tree => nodes(tree, node => node.props?.role === 'status')[0];

test('actual reorder/sort preserve collapse and hidden project slots across reload', () => {
  const projects = [project('a'), project('b'), project('done', 2)];
  const storage = new Map([['personal', JSON.stringify({ order: ['a', 'done', 'other-brand', 'b'], sort: 'manual', doneCollapsed: true })]]);
  const view = mounted('controls', { projects, key: 'personal' }, { storage });
  assert.equal(view.output.controls.move('b', 'a', 'before'), true); view.render();
  assert.deepEqual(view.writes.at(-1).value, { order: ['b', 'done', 'other-brand', 'a'], sort: 'manual', doneCollapsed: true });
  view.output.controls.setSort('name-desc'); view.render();
  assert.equal(view.writes.at(-1).value.doneCollapsed, true);
  const reloaded = mounted('controls', { projects, key: 'personal' }, { storage });
  assert.equal(reloaded.output.controls.doneCollapsed, true);
  assert.equal(reloaded.output.controls.preferences.sort, 'name-desc');
  view.unmount(); reloaded.unmount();
});

test('central move and actual menu reject hidden/cross-group targets without a save receipt', () => {
  const projects = [project('a'), project('b'), project('done', 2)];
  const view = mounted('controls', { projects, key: 'personal' });
  assert.equal(view.output.controls.move('b', 'done', 'after'), false);
  assert.equal(view.output.controls.move('done', 'b', 'before'), false);
  const row = view.row('b');
  view.output.controls.openMenu({ ...pointer(row, 0), type: 'contextmenu' }, 'project', projects[1]); view.render();
  assert.equal(nodes(view.output.menu, node => node.type === 'Button' && text(node) === '아래로 이동')[0].props.disabled, true);
  view.output.controls.setDoneCollapsed(true); view.render();
  assert.equal(view.output.controls.move('done', 'a', 'before'), false);
  assert.equal(view.writes.length, 1, 'only the explicit collapse preference was saved');
  view.unmount();
});

test('pointer drag preview/drop clamps to its group even when the pointer crosses done rows', () => {
  const projects = [project('a'), project('b'), project('done', 2)];
  const view = mounted('controls', { projects, key: 'personal' });
  const events = view.output.controls.rowEvents('a'), row = view.row('a');
  events.onPointerDown(pointer(row, 20)); events.onPointerMove(pointer(row, 180));
  assert.equal(row.style.transform, 'translate3d(0, 40px, 0)', 'lifted row cannot enter the completed group');
  events.onPointerUp(pointer(row, 180)); view.render();
  assert.deepEqual(view.output.controls.ordered.map(item => item.id), ['b', 'a', 'done']);
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].value.doneCollapsed, false);
  view.unmount();
});

test('mid-drag completion and retired scope handlers cannot save into another group/scope', () => {
  const projects = [project('a'), project('b'), project('done', 2)];
  const view = mounted('controls', { projects, key: 'personal' });
  const old = view.output.controls, events = old.rowEvents('a'), row = view.row('a');
  events.onPointerDown(pointer(row, 20)); events.onPointerMove(pointer(row, 70));
  view.render({ projects: [project('a', 2), projects[1], projects[2]], key: 'personal' });
  events.onPointerUp(pointer(row, 70)); view.render();
  assert.equal(view.writes.length, 0);
  view.render({ projects, key: 'company' });
  assert.equal(old.move('b', 'a', 'before'), false);
  old.setSort('name-desc');
  assert.equal(view.writes.length, 0);
  view.unmount();
});

test('new complete checklist auto-expands, announces once, retains row key/selection and visible keyboard IDs', () => {
  const a = project('a'), b = project('b');
  const storage = new Map([['personal', JSON.stringify({ order: ['a', 'b'], sort: 'manual', doneCollapsed: true })]]);
  const keyboardOrders = [], reviewCalls = [];
  const extra = { onIndexOrderChange: ids => keyboardOrders.push(ids), onReviewCompletion: value => reviewCalls.push(value) };
  const view = mounted('workspace', baseProps([a, b], extra), { storage });
  const oldKey = projectRows(view.output).find(row => row.props.project.id === 'a').key;
  assert.equal(text(status(view.output)), '');
  const props = baseProps([project('a', 2), b], extra); view.render(props);
  assert.equal(heading(view.output).props['aria-expanded'], true);
  assert.match(text(status(view.output)), /프로젝트 1개 할 일 모두 처리 · 결과 확인 전/);
  const row = projectRows(view.output).find(row => row.props.project.id === 'a');
  assert.equal(row.key, oldKey); assert.equal(row.props.selected, true); assert.equal(row.props.celebrating, true);
  assert.deepEqual(keyboardOrders.at(-1), ['b', 'a']);
  const announcementKey = status(view.output).key; view.render(props);
  assert.equal(status(view.output).key, announcementKey);
  row.props.onCelebrationEnd('a'); view.render();
  assert.equal(projectRows(view.output).find(row => row.props.project.id === 'a').props.celebrating, false);
  assert.equal(reviewCalls.length, 0, 'result completion still needs an explicit user action');
  view.unmount();
});

test('first load, scope replacement and unknown/partial progress never celebrate completion', () => {
  const view = mounted('workspace', baseProps([project('a', 2)]));
  assert.equal(text(status(view.output)), '');
  assert.equal(projectRows(view.output)[0].props.celebrating, false);
  view.render(baseProps([project('a')], { indexStorageKey: 'company' }));
  view.render(baseProps([project('a', 2)], { indexStorageKey: 'personal' }));
  assert.equal(text(status(view.output)), '');
  const partial = { ...project('a', 2), displayProgress: { ...project('a', 2).displayProgress, partial: true } };
  view.render(baseProps([partial])); view.render(baseProps([project('a', 2)]));
  assert.equal(text(status(view.output)), '');
  view.unmount();
});

test('reduced motion preserves expansion/announcement and stops an in-flight one-shot', () => {
  const storage = new Map([['personal', JSON.stringify({ doneCollapsed: true })]]);
  const view = mounted('workspace', baseProps([project('a')]), { storage, reduced: true });
  view.render(baseProps([project('a', 2)]));
  assert.equal(heading(view.output).props['aria-expanded'], true);
  assert.match(text(status(view.output)), /할 일 모두 처리/);
  assert.equal(projectRows(view.output)[0].props.celebrating, false);
  view.changeMotion(false); view.render(baseProps([project('a')])); view.render(baseProps([project('a', 2)]));
  assert.equal(projectRows(view.output)[0].props.celebrating, true);
  view.changeMotion(true);
  assert.equal(projectRows(view.output)[0].props.celebrating, false);
  view.unmount(); assert.equal(view.listeners.has('motion'), false);
});

test('collapse/filter interruption never replays celebration, and loading in a new scope hides retired UI', () => {
  const a = project('a'), b = project('b');
  const view = mounted('workspace', baseProps([a, b]));
  const completed = [project('a', 2), b]; view.render(baseProps(completed));
  assert.equal(projectRows(view.output).find(row => row.props.project.id === 'a').props.celebrating, true);
  heading(view.output).props.onClick(); view.render();
  assert.deepEqual(projectRows(view.output).map(row => row.props.project.id), ['b']);
  heading(view.output).props.onClick(); view.render();
  assert.equal(projectRows(view.output).find(row => row.props.project.id === 'a').props.celebrating, false);
  view.render(baseProps([a, b])); view.render(baseProps(completed));
  view.render(baseProps([b], { indexProjects: completed }));
  view.render(baseProps(completed));
  assert.equal(projectRows(view.output).find(row => row.props.project.id === 'a').props.celebrating, false);
  view.render(baseProps(completed, { indexStorageKey: 'company', sourceState: 'loading' }));
  assert.equal(text(status(view.output)), '');
  assert.equal(projectRows(view.output).find(row => row.props.project.id === 'a').props.celebrating, false);
  view.unmount();
});

test('selected or focused row scrolls into view on exact completion even without animation', () => {
  const props = { project: project('a'), window: metrics.portfolioWindow(), controls: { rowEvents: () => ({}) }, selected: true, done: false };
  const view = mounted('row', props, { reduced: true });
  let scrolls = 0;
  const element = { scrollIntoView: () => { scrolls++; }, contains: value => value === 'focused-child' };
  view.output.props.ref.current = element;
  view.render({ ...props, project: project('a', 2), done: true }); assert.equal(scrolls, 1);
  view.render({ ...props, done: false, selected: false });
  view.document.activeElement = 'focused-child';
  view.render({ ...props, project: project('a', 2), done: true, selected: false }); assert.equal(scrolls, 2);
  view.unmount();
});

test('project group uses token motion, 44px touch controls and reduced-motion final state', () => {
  const css = readFileSync(new URL('./project-index-controls.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.doneHead\s*\{\s*min-height:\s*44px/);
  assert.match(css, /\.doneHead:focus-visible\s*\{\s*outline:\s*1px solid var\(--moon-300\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.doesNotMatch(css, /\d+(?:ms|s)\b/);
  assert.doesNotMatch(workspaceSource, /DONE_CELEBRATION_MS|setTimeout\([^]*DONE/);
});
