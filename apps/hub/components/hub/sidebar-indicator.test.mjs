import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./hub-sidebar.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hub-sidebar.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const hook = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useNavIndicator');
assert.ok(hook, 'exercise the production indicator hook');

// Only DOM geometry and React's effect scheduling are supplied here. The production
// hook owns placement, click handling, distance, visibility, and observer cleanup.
function mountIndicator(top = 2) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  let observer;
  let handler;
  const indicator = { style: {}, dataset: {}, offsetWidth: 216 };
  const rows = [top, top + 216].map(offsetTop => ({ offsetTop, offsetLeft: 8, offsetWidth: 216, offsetHeight: 34 }));
  const region = {
    currentRow: rows[0], dataset: {}, vars: {},
    style: { setProperty: (name, value) => { region.vars[name] = value; } },
    querySelector: selector => selector.includes('hub-nav-indicator') ? indicator : region.currentRow,
    querySelectorAll: () => rows,
  };
  for (const row of rows) row.parentElement = region;
  const ref = { current: region };
  const changed = (slot, deps) => !slot || deps.some((value, index) => !Object.is(value, slot.deps[index]));
  const effect = (run, deps) => {
    const index = cursor++;
    if (changed(slots[index], deps)) {
      effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: run() }; });
    }
  };
  const React = {
    useRef: value => (slots[cursor++] ??= { current: value }),
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index], deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useLayoutEffect: effect,
    useEffect: effect,
  };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = []; observer = this; }
    observe(node) { this.observed.push(node); }
    disconnect() { this.disconnected = true; }
  }
  const useIndicator = new Function('React', 'ResizeObserver', `${hook.getText()}; return useNavIndicator;`)(React, ResizeObserver);
  const render = key => {
    cursor = 0;
    handler = useIndicator(ref, key);
    for (const run of effects.splice(0)) run();
  };
  return {
    region, indicator, rows, render,
    click: row => handler?.({ target: { closest: () => row } }),
    resize: () => observer.callback(),
    observer: () => observer,
    unmount: () => { for (const slot of slots) slot.cleanup?.(); },
  };
}

test('a delayed route keeps the pill on the committed row until the route changes', () => {
  const view = mountIndicator();
  view.render('home');
  assert.equal(view.indicator.style.transform, 'translate(8px, 2px)');
  view.click(view.rows[1]);
  assert.equal(view.indicator.style.transform, 'translate(8px, 2px)', 'click alone must not move the current-page background');
  view.region.currentRow = view.rows[1];
  view.render('projects');
  assert.equal(view.indicator.style.transform, 'translate(8px, 218px)');
  assert.equal(view.region.vars['--slide-dist'], '216', 'committed navigation keeps distance-proportional motion');
});

test('failed or cancelled navigation cannot leave a stray pill on an uncommitted row', () => {
  const view = mountIndicator();
  view.render('home');
  view.click(view.rows[1]);
  view.render('home');
  assert.equal(view.indicator.style.transform, 'translate(8px, 2px)');
  view.resize();
  assert.equal(view.indicator.style.transform, 'translate(8px, 2px)', 'resize does not cause a rollback jump');
});

test('crossing between primary and utility navigation never selects two regions', () => {
  const primary = mountIndicator();
  const utility = mountIndicator(6);
  utility.region.currentRow = null;
  primary.render('home'); utility.render('home');
  utility.click(utility.rows[0]);
  assert.deepEqual([primary.region.dataset.indicator, utility.region.dataset.indicator], ['on', 'off']);
  primary.region.currentRow = null;
  utility.region.currentRow = utility.rows[0];
  primary.render('settings'); utility.render('settings');
  assert.deepEqual([primary.region.dataset.indicator, utility.region.dataset.indicator], ['off', 'on']);
  primary.click(primary.rows[1]);
  assert.deepEqual([primary.region.dataset.indicator, utility.region.dataset.indicator], ['off', 'on']);
});

test('rapid clicks and history navigation follow the committed route only', () => {
  const view = mountIndicator();
  view.render('home');
  view.click(view.rows[1]); view.click(view.rows[0]); view.click(view.rows[1]);
  assert.equal(view.indicator.style.transform, 'translate(8px, 2px)');
  view.region.currentRow = view.rows[1]; view.render('projects');
  view.region.currentRow = view.rows[0]; view.render('home');
  assert.equal(view.indicator.style.transform, 'translate(8px, 2px)');
});

test('resizing or collapsing realigns the current row and unmount disconnects the observer', () => {
  const view = mountIndicator();
  view.render('home|full');
  assert.deepEqual(view.observer().observed, [view.region, ...view.rows]);
  view.rows[0].offsetWidth = 40;
  view.rows[0].offsetHeight = 44;
  view.rows[0].offsetLeft = 0;
  view.resize();
  assert.equal(view.indicator.style.width, '40px');
  assert.equal(view.indicator.style.height, '44px');
  assert.equal(view.indicator.style.transform, 'translate(0px, 2px)');
  view.rows[0].offsetTop = 6;
  view.render('home|rail');
  assert.equal(view.indicator.style.transform, 'translate(0px, 6px)');
  view.unmount();
  assert.equal(view.observer().disconnected, true);
});

test('unknown routes and hidden rows do not display a stale selection', () => {
  const view = mountIndicator();
  view.render('home');
  view.region.currentRow = null;
  view.render('unknown');
  assert.equal(view.region.dataset.indicator, 'off');
  view.region.currentRow = view.rows[0];
  view.rows[0].offsetHeight = 0;
  view.render('home|hidden');
  assert.equal(view.region.dataset.indicator, 'off');
  view.rows[0].offsetHeight = 44;
  view.resize();
  assert.equal(view.region.dataset.indicator, 'on');
});
