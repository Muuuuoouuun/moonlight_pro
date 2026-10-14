import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectIndexDoneState, sinkDoneProjects } from '../../../lib/project-index-order.js';

const page = readFileSync(new URL('./projects.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('./project-portfolio-workspace.jsx', import.meta.url), 'utf8');
const keyboard = readFileSync(new URL('../use-crm-keyboard.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function between(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Actual source anchors exist: ${start}`);
  return source.slice(from, to);
}
const workspaceCode = between(workspace, '  const openProjects = React.useMemo', '  const [focusProjectId');
const parentCode = between(page, '  const kbRows = React.useMemo', '  // 브랜드가 속한 폴더 id');
const project = (id, done = 1, total = 2) => ({ id, displayProgress: { source: 'tasks', total, done, value: Math.round(100 * done / total), partial: false } });

// Execute the real workspace publication and parent row/selection/edit wiring,
// including the real CRM keyboard hooks. Only browser services are local stubs.
function displayedIds(projects, doneCollapsed) {
  let ids;
  new Function('React', 'indexControls', 'onIndexOrderChange', 'projectIndexDoneState', workspaceCode)(
    { useMemo: callback => callback(), useEffect: callback => callback() },
    { ordered: sinkDoneProjects(projects), doneCollapsed }, value => { ids = value; }, projectIndexDoneState,
  );
  return ids;
}
function mount(initial) {
  const slots = [], pending = [], listeners = new Set(), opened = [], edited = [];
  let cursor = 0, dirty = false, output;
  let props = { view: 'tree', visibleProjects: [], indexKeyboardOrder: [], listSections: [], brandSectionsCollapsed: {}, visibleColumns: [], todos: [], drawerOpen: false, ...initial };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = {
    useState(initial) {
      const index = cursor++, slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(slot.value, value)) { slot.value = value; dirty = true; } }];
    },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback(), deps };
      return slots[index].value;
    },
    useCallback(callback, deps) { return this.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) pending.push({ index, callback, deps });
    },
  };
  const window = { addEventListener: (_name, callback) => listeners.add(callback), removeEventListener: (_name, callback) => listeners.delete(callback) };
  const document = { activeElement: { tagName: 'BODY' }, querySelector: () => null };
  const hooks = new Function('React', 'window', 'document', `${keyboard}\nreturn { useCrmSelection, useCrmKeyboard };`)(React, window, document);
  const scope = { React, ...hooks, document, CSS: { escape: String }, searchInputRef: { current: null },
    openProjectDetail: id => opened.push(id), editTodo: task => edited.push(task.id),
  };
  const runParent = new Function(...Object.keys(scope), ...Object.keys(props), `${parentCode}\nreturn { rows: kbRows, selection: kbSelection };`);
  function render(next = {}) {
    props = { ...props, ...next };
    for (let turn = 0; turn < 10; turn++) {
      cursor = 0; pending.length = 0; dirty = false;
      output = runParent(...Object.values(scope), ...Object.values(props));
      for (const effect of pending.splice(0)) {
        slots[effect.index]?.cleanup?.();
        slots[effect.index] = { deps: effect.deps, cleanup: effect.callback() };
      }
      if (!dirty) return output;
    }
    throw new Error('Parent keyboard hooks did not settle');
  }
  render();
  return { render, opened, edited, document, get output() { return output; },
    press(key) { for (const listener of [...listeners]) listener({ key, preventDefault() {} }); return render().selection.selectedId; },
    unmount() { for (const slot of slots) slot?.cleanup?.(); assert.equal(listeners.size, 0); },
  };
}

test('collapsed workspace publication restricts actual parent j/k/e to displayed rows', () => {
  const projects = [project('open'), project('done', 2), project('rounded', 200, 201), { id: 'reported', displayProgress: { source: 'reported', value: 100 } }];
  const ids = displayedIds(projects, true);
  assert.deepEqual(ids, ['open', 'rounded', 'reported']);
  const view = mount({ visibleProjects: projects, indexKeyboardOrder: ids });
  assert.deepEqual(view.output.rows.map(row => row.id), ids);
  for (const id of ['open', 'rounded', 'reported', 'reported']) assert.equal(view.press('j'), id);
  assert.equal(view.press('k'), 'rounded'); view.press('e');
  assert.deepEqual(view.opened, ['rounded']);
  view.unmount();
});

test('collapsing an already keyboard-selected done row blocks stale e until a displayed row is selected', () => {
  const projects = [project('open'), project('done', 2)];
  const view = mount({ visibleProjects: projects, indexKeyboardOrder: displayedIds(projects, false) });
  assert.equal(view.press('j'), 'open'); assert.equal(view.press('j'), 'done');
  view.render({ indexKeyboardOrder: displayedIds(projects, true) });
  assert.equal(view.output.selection.selectedId, 'done', 'Shared selection retention remains unchanged');
  view.press('e'); assert.deepEqual(view.opened, []);
  assert.equal(view.press('j'), 'open'); view.press('e'); assert.deepEqual(view.opened, ['open']);
  view.render({ indexKeyboardOrder: displayedIds(projects, false) });
  assert.equal(view.press('j'), 'done'); view.press('e'); assert.deepEqual(view.opened, ['open', 'done']);
  view.unmount();
});

test('parent follows displayed sort/reorder and excludes filtered, terminal and retired IDs', () => {
  const projects = [project('a'), project('b'), project('done', 2)];
  const view = mount({ visibleProjects: projects, indexKeyboardOrder: ['b', 'other-brand', 'a', 'terminal'] });
  assert.deepEqual(view.output.rows.map(row => row.id), ['b', 'a']);
  assert.equal(view.press('j'), 'b');
  view.render({ indexKeyboardOrder: ['a', 'b'] }); assert.equal(view.press('k'), 'a');
  view.render({ visibleProjects: [projects[1]], indexKeyboardOrder: ['b'] });
  view.press('e'); assert.deepEqual(view.opened, []);
  assert.equal(view.press('j'), 'b'); view.press('e'); assert.deepEqual(view.opened, ['b']);
  view.unmount();
});

test('empty displayed index and initial unpublished order expose no hidden keyboard target', () => {
  const projects = [project('done', 2)];
  const view = mount({ visibleProjects: projects });
  assert.deepEqual(view.output.rows, []); assert.equal(view.press('j'), null);
  view.render({ indexKeyboardOrder: displayedIds(projects, false) }); assert.equal(view.press('j'), 'done');
  view.render({ indexKeyboardOrder: displayedIds(projects, true) });
  view.press('e'); assert.deepEqual(view.opened, []); assert.equal(view.press('k'), null);
  view.unmount();
});

test('table section visibility and board task/project edit dispatch keep their existing keyboard flow', () => {
  const view = mount({ view: 'table', listSections: [
    { kind: 'brand', id: 'collapsed', items: [project('hidden')] },
    { kind: 'brand', id: 'shown', items: [project('shown')] },
  ], brandSectionsCollapsed: { collapsed: true } });
  assert.deepEqual(view.output.rows, [{ id: 'shown' }]);
  assert.equal(view.press('j'), 'shown'); view.press('e'); assert.deepEqual(view.opened, ['shown']);
  view.render({ view: 'board', visibleColumns: [{ cards: [{ id: 'task' }, { id: 'project-board' }] }], todos: [{ id: 'task' }] });
  assert.equal(view.press('j'), 'task'); view.press('e'); assert.deepEqual(view.edited, ['task']);
  assert.equal(view.press('j'), 'project-board'); view.press('e'); assert.deepEqual(view.opened, ['shown', 'board']);
  view.unmount();
});

test('actual keyboard keeps yielding to input, drawer and views with their own shortcuts', () => {
  const view = mount({ visibleProjects: [project('open')], indexKeyboardOrder: ['open'] });
  view.document.activeElement = { tagName: 'INPUT' }; assert.equal(view.press('j'), null);
  view.document.activeElement = { tagName: 'BODY' };
  view.render({ drawerOpen: true }); assert.equal(view.press('j'), null);
  view.render({ drawerOpen: false, view: 'timeline' }); assert.equal(view.press('j'), null);
  view.render({ view: 'tree' }); assert.equal(view.press('j'), 'open');
  view.unmount();
});
