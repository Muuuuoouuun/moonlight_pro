import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { isTopEscLayer, popEscLayer, pushEscLayer } from './esc-layers.js';

const source = readFileSync(new URL('./hub-command-palette.jsx', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source.slice(source.indexOf('const RECORD_RESULT_CAP')).replace('export function CommandPalette', 'function CommandPalette'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount() {
  const effects = [], listeners = new Set(), timers = [];
  let closed = 0;
  const document = { activeElement: null };
  const node = (tabIndex = 0, visible = true) => ({
    tabIndex, isConnected: true, offsetParent: visible ? {} : null,
    matches: () => false, closest: () => null,
    focus() { document.activeElement = this; },
  });
  const opener = node(), input = node(), option = node(-1), hidden = node(0, false), retry = node();
  document.activeElement = opener;
  const panel = { querySelectorAll: () => [input, option, hidden, retry] };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: current => ({ current }), useMemo: compute => compute(),
    useEffect: effect => effects.push(effect),
  };
  const dependencies = {
    React, document, Iconed: 'icon', Button: 'button', Kbd: 'kbd', Skeleton: 'skeleton', TruthBadge: 'badge',
    NAV_TREE: [], LEGACY_TREE: [], navPathForScope: () => '',
    loadPaletteRecords: () => undefined, matchingPaletteRecords: () => [], paletteItemKey: item => item?.action || item?.path,
    isTopEscLayer, popEscLayer, pushEscLayer, getComputedStyle: () => ({ visibility: 'visible' }),
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
    window: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) },
  };
  const Palette = new Function(...Object.keys(dependencies), `${javascript}; return CommandPalette;`)(...Object.values(dependencies));
  const tree = Palette({ open: true, onClose: () => { closed++; } });
  const find = (predicate, element = tree) => {
    if (!element || typeof element !== 'object') return undefined;
    return predicate(element) ? element : element.props?.children.map(child => find(predicate, child)).find(Boolean);
  };
  const search = find(element => element.type === 'input');
  const sheet = tree.props.children[0];
  search.props.ref.current = input;
  if (sheet.props.ref) sheet.props.ref.current = panel;
  const cleanups = effects.map(effect => effect());
  timers.forEach(timer => timer());
  return {
    document, input, retry, opener, search,
    closed: () => closed,
    tab(shiftKey = false) {
      let prevented = false;
      sheet.props.onKeyDown?.({ key: 'Tab', shiftKey, preventDefault() { prevented = true; } });
      return prevented;
    },
    key: overrides => listeners.forEach(listener => listener({ key: 'Escape', preventDefault() {}, ...overrides })),
    unmount: () => cleanups.reverse().forEach(cleanup => cleanup?.()),
  };
}

test('palette Tab wraps only across visible tab stops and closing restores the opener', () => {
  const app = mount();
  assert.equal(app.document.activeElement, app.input);
  assert.equal(app.tab(true), true);
  assert.equal(app.document.activeElement, app.retry, 'hidden controls and arrow-managed options are not Tab destinations');
  assert.equal(app.tab(), true);
  assert.equal(app.document.activeElement, app.input);
  app.unmount();
  assert.equal(app.document.activeElement, app.opener);
});

test('palette Escape is owned once by the window layer and ignores composition', () => {
  const app = mount();
  try {
    app.search.props.onKeyDown({ key: 'Escape', nativeEvent: {}, preventDefault() {} });
    assert.equal(app.closed(), 0, 'input cannot remove the layer before the same event reaches other dialogs');
    app.key({ isComposing: true }); app.key({ keyCode: 229 }); app.key({ defaultPrevented: true });
    assert.equal(app.closed(), 0);
    app.key();
    assert.equal(app.closed(), 1);
  } finally { app.unmount(); }
});
