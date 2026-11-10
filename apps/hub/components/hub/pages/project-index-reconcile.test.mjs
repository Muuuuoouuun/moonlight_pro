import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as order from '../../../lib/project-index-order.js';
import * as actionState from '../../../lib/project-action-state.js';
import * as metrics from './project-pms-metrics.js';
import { readTaskChecklist } from '../../../lib/task-checklist.js';
import { selectUrgentProjectItems } from '../../../lib/project-urgent-items.js';
import { selectProjectNextStep } from '../../../lib/project-next-step.js';
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
function mounted(kind, initial, { storage = new Map(), reduced = false, mobile = false } = {}) {
  const cells = [], pending = [], writes = [], timers = new Map(), listeners = new Map();
  const frames = [], focusCounts = { search: 0, picker: 0 };
  let cursor = 0, dirty = false, output, props = initial, timerId = 0, domRows = [];
  const media = { matches: reduced, addEventListener(_name, callback) { listeners.set('motion', callback); }, removeEventListener() { listeners.delete('motion'); } };
  const browser = { matchMedia: query => query.includes('max-width') ? { matches: mobile } : media, addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720 };
  const document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { writes.push({ key, value: JSON.parse(value) }); storage.set(key, value); } };
  const list = { scrollTop: 0, querySelectorAll: () => domRows, querySelector: () => domRows[0]?.button, getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 400 }) };
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
  const scope = { React, localStorage, window: browser, document, globalThis: { window: browser, document }, ...order, ...metrics, ...actionState,
    styles, indexStyles: styles, workStyles: styles, deliveryStyles: styles, stageStyles: styles,
    Button: 'Button', Badge: 'Badge', Drawer: 'Drawer', EmptyState: 'EmptyState', IconButton: 'IconButton', Input: 'Input', SegmentedControl: 'SegmentedControl', Iconed: 'Iconed', BrandMark: 'BrandMark', ProjectWorkList: 'ProjectWorkList', ProjectDeliverySummary: 'ProjectDeliverySummary',
    projectGenreLabel: () => '', projectGenreTint: () => undefined, projectStatusLabel: value => value,
    readTaskChecklist, selectUrgentProjectItems, selectProjectNextStep, buildCurrentMonthProjectPreview,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; }, cancelAnimationFrame(id) { frames[id - 1] = null; },
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
        const search = nodes(output, node => node.type === 'Input' && node.props.ariaLabel === '프로젝트 검색')[0];
        if (search?.props.ref) search.props.ref.current = { focus() { focusCounts.search++; } };
        const picker = nodes(output, node => node.type === 'Button' && text(node) === '프로젝트 바꾸기')[0];
        if (picker?.props.ref) picker.props.ref.current = { focus() { focusCounts.picker++; } };
        domRows = nodes(output, node => node.type?.name === 'ProjectIndexRow').map((node, index) => rowElement(node.props.project.id, index));
      }
      for (const item of pending.splice(0)) { cells[item.index]?.cleanup?.(); cells[item.index] = { deps: item.deps, cleanup: item.callback() }; }
      if (!dirty) return output;
    }
    throw new Error('hook did not settle');
  }
  render();
  return { render, storage, writes, media, document, listeners, focusCounts, flushFrames() { frames.splice(0).forEach(callback => callback?.()); }, get output() { return output; }, row: id => domRows.find(row => row.dataset.projectIndexId === id), unmount() { for (const cell of cells) cell?.cleanup?.(); }, changeMotion(value) { media.matches = value; listeners.get('motion')?.({ matches: value }); render(); } };
}
function pointer(row, y) { return { button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: y, currentTarget: row.button, target: row.button, preventDefault() {}, stopPropagation() {} }; }
function baseProps(projects, extra = {}) { return { projects, indexProjects: projects, portfolioProjects: projects, todosByProject: new Map(), brandByKey: new Map(), indexStorageKey: 'personal', sourceState: 'live', selectedProjectId: projects[0]?.id, query: '', ...extra }; }
const projectRows = tree => nodes(tree, node => node.type?.name === 'ProjectIndexRow');
const heading = tree => nodes(tree, node => node.key === 'done-group-heading')[0];
const status = tree => nodes(tree, node => node.props?.role === 'status')[0];

test('mobile search request reveals and focuses the index, and Enter selects a result without losing task drafts', () => {
  const projects = [project('a'), project('b')], selected = [];
  const searchInputRef = { current: null };
  const props = baseProps(projects, { searchInputRef, onSelectProject: id => selected.push(id) });
  const view = mounted('workspace', props, { mobile: true });
  const work = () => nodes(view.output, node => node.type === 'ProjectWorkList')[0];
  const draft = { a: { title: 'Unsent next task' } };
  work().props.draftStore.setDrafts(draft); view.render();
  view.render({ ...props, searchRequest: 1 }); view.flushFrames();
  assert.equal(view.output.props['data-mobile-picker'], 'true');
  assert.ok(view.focusCounts.search > 0);
  const search = () => nodes(view.output, node => node.type === 'Input' && node.props.ariaLabel === '프로젝트 검색')[0];
  search().props.onKeyDown({ key: 'Enter', isComposing: true });
  assert.deepEqual(selected, [], 'IME composition must not select a project');
  let prevented = false;
  search().props.onKeyDown({ key: 'ArrowDown', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(view.document.activeElement, view.row('a').button);
  search().props.onKeyDown({ key: 'Enter', preventDefault() {} }); view.render(); view.flushFrames();
  assert.deepEqual(selected, ['a']); assert.equal(view.output.props['data-mobile-picker'], 'false');
  assert.equal(view.focusCounts.picker, 1); assert.equal(work().props.draftStore.drafts, draft);
  view.unmount();
});

test('starting an inline project from the mobile picker always reveals its create surface', () => {
  const props = baseProps([project('a')], { searchInputRef: { current: null } });
  const view = mounted('workspace', props, { mobile: true });
  nodes(view.output, node => node.type === 'Button' && text(node) === '프로젝트 바꾸기')[0].props.onClick();
  view.render(); assert.equal(view.output.props['data-mobile-picker'], 'true');
  const createSurface = { type: 'create-form', props: { children: 'Unsent project title' } };
  view.render({ ...props, createSurface });
  assert.equal(view.output.props['data-create-open'], 'true');
  assert.equal(view.output.props['data-mobile-picker'], 'false', 'the stage must not be hidden together with the index');
  assert.equal(nodes(view.output, node => node.type === 'create-form')[0], createSurface);
  view.render(props);
  assert.equal(view.output.props['data-mobile-picker'], 'false', 'canceling creation returns to the selected project');
  view.unmount();
});

test('mobile picker Escape respects a consumed search Escape and returns focus on close', () => {
  const view = mounted('workspace', baseProps([project('a')], { searchInputRef: { current: null } }), { mobile: true });
  nodes(view.output, node => node.type === 'Button' && text(node) === '프로젝트 바꾸기')[0].props.onClick(); view.render();
  view.output.props.onKeyDown({ key: 'Escape', defaultPrevented: true }); view.render();
  assert.equal(view.output.props['data-mobile-picker'], 'true');
  view.output.props.onKeyDown({ key: 'Escape', defaultPrevented: false, preventDefault() {}, stopPropagation() {} }); view.render(); view.flushFrames();
  assert.equal(view.output.props['data-mobile-picker'], 'false'); assert.equal(view.focusCounts.picker, 1);
  view.unmount();
});

test('the same additional filters remain operable outside desktop width', () => {
  const selected = [];
  const props = baseProps([project('a')], { onFilterChange: value => selected.push(value) });
  const view = mounted('workspace', props, { mobile: true });
  nodes(view.output, node => node.type === 'IconButton' && node.props.tooltip === '추가 프로젝트 필터')[0].props.onClick(); view.render();
  const metrics = nodes(view.output, node => node.type?.name === 'PortfolioMetric');
  assert.deepEqual(metrics.map(node => node.props.metric.key), ['active', 'blockedOrOverdue', 'dueSoon', 'unmeasured']);
  metrics.find(node => node.props.metric.key === 'dueSoon').type(metrics.find(node => node.props.metric.key === 'dueSoon').props).props.onClick();
  assert.deepEqual(selected, ['dueSoon']);
  const css = readFileSync(new URL('./project-index-controls.module.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.extraFilter, \.filterOptions \{ display: none/);
  assert.match(css, /\.index \.extraFilter, \.filterOptions button \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(css, /@media \(max-width: 900px\) \{\s*\.index \.compactMeta \{ display: grid/);
  view.unmount();
});

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
  // 선택 행은 레일이 아니라 떠 있는 카드다(2026-10-19 Projects B Focus) — 굵은 레일은 어디에도 없다.
  assert.match(css, /\.row\[data-selected="true"\][^{]*\{[^}]*var\(--shadow-card\)/);
  assert.doesNotMatch(css, /inset\s+(?:[2-9]|1\.\d)\S*px\s+0\s+0/);
  assert.match(css, /\.doneHead:focus-visible\s*\{\s*outline:\s*1px solid var\(--moon-300\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.doesNotMatch(css, /\d+(?:ms|s)\b/);
  assert.doesNotMatch(workspaceSource, /DONE_CELEBRATION_MS|setTimeout\([^]*DONE/);
});

test('all-task-done group truthfully awaits results and stale snapshots do not promote review', () => {
  const p = project('a', 1, 1), tasks = [{ id: 'one', title: '데모', done: true }];
  const props = baseProps([p], { todosByProject: new Map([['a', tasks]]) });
  const view = mounted('workspace', props);
  assert.match(text(heading(view.output)), /결과 확인 대기/);
  assert.doesNotMatch(text(heading(view.output)), /완료됨/);
  assert.ok(nodes(view.output, n => n.type === 'Button' && text(n) === '완료 검토').length);
  for (const sourceState of ['error', 'loading', 'preview']) {
    view.render({ ...props, sourceState });
    assert.equal(nodes(view.output, n => n.type === 'Button' && text(n) === '완료 검토').length, 0);
  }
  view.unmount();
});

test('next-action callbacks focus existing tasks, disambiguate duplicates and keep unmatched text an explicit draft', () => {
  const cases = [
    // B Focus `다음` 띠(2026-10-19): 맞는 열린 할 일은 제목 단추가 목록에서 보여 준다.
    { title: '제안서 전달', tasks: [{ id: 'a', title: '제안서  전달', done: false }], titleButton: '목록에서 보기', expect: ['task', 'a'] },
    // 이미 처리한 할 일과 같은 제목이면 같은 할 일을 다시 만들지 않는다.
    { title: '촬영', tasks: [{ id: 'a', title: '촬영', done: true }, { id: 'b', title: '검토', done: false }], label: '처리한 할 일 확인', expect: ['task', 'a'] },
    // 같은 제목이 둘이면 어느 것을 처리할지 고르지 않는다.
    { title: '고객 확인', tasks: [{ id: 'a', title: '고객 확인', done: false }, { id: 'b', title: '고객 확인', done: false }], label: '같은 제목 · 목록에서 선택', expect: ['list'] },
    // F6: renaming a task does not create a guessed ID relationship to old project text.
    { title: '고객 데모 준비', tasks: [{ id: 'a', title: '고객 데모 자료·계정 준비', done: false }], label: '할 일로 추가', expect: ['draft', '고객 데모 준비'] },
  ];
  for (const item of cases) {
    const p = { ...project('p'), displayNextAction: item.title };
    const view = mounted('workspace', baseProps([p], { todosByProject: new Map([['p', item.tasks]]) }));
    const calls = [];
    nodes(view.output, node => node.type === 'ProjectWorkList')[0].props.ref.current = {
      focusTask: id => calls.push(['task', id]), focusList: () => calls.push(['list']), focusNewTask: title => calls.push(['draft', title]),
    };
    const target = item.titleButton
      ? nodes(view.output, node => node.type === 'button' && node.props.title === item.titleButton)[0]
      : nodes(view.output, node => node.type === 'Button' && text(node) === item.label)[0];
    target.props.onClick();
    assert.deepEqual(calls, [item.expect]);
    if (item.label === '할 일로 추가') {
      assert.match(text(view.output), /제목을 바꾼 할 일이 있는지/);
      nodes(view.output, node => node.type === 'Button' && text(node) === '기존 목록 확인')[0].props.onClick();
      assert.deepEqual(calls.at(-1), ['list']);
    }
    view.unmount();
  }
});
