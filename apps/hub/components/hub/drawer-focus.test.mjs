import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { isTopEscLayer, popEscLayer, pushEscLayer } from './esc-layers.js';

// Execute the production Drawer handlers with an isolated DOM model. This checks
// target selection and callbacks, not browser tab order or rendered focus rings.
const source = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('drawer.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declarations = ast.statements.filter(node => (ts.isFunctionDeclaration(node) && ['Drawer', 'isDrawerFocusTarget'].includes(node.name?.text))
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(ast) === 'DRAWER_FOCUSABLE')))
  .map(node => node.getText(ast).replace(/^export /, '')).join('\n');
const javascript = ts.transpileModule(declarations, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(child => find(child, predicate))
  : node && typeof node === 'object' ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)] : [];

function mount({ bodyControls = ['disabled', 'edit'], preferred = null, headerControl = true } = {}) {
  const document = { activeElement: null }, effects = [], frames = [], cleanups = [], listeners = new Set();
  let closed = 0;
  const control = (name, options = {}) => ({
    name, disabled: name === 'disabled', inert: false, offsetParent: {}, visibility: 'visible', focused: 0, ...options,
    focus() { this.focused++; if (!this.disabled) document.activeElement = this; },
    matches(selector) { return selector === ':disabled' && this.disabled; },
    closest() { return this.inert ? {} : null; },
  });
  const opener = control('opener'), close = control('close');
  const controls = bodyControls.map(value => typeof value === 'string' ? control(value) : control(value.name, value));
  const body = { contains: target => controls.includes(target), querySelectorAll: () => controls, querySelector: () => controls[0] || null };
  const all = headerControl ? [close, ...controls] : controls;
  const aside = { contains: target => target === aside || all.includes(target), querySelectorAll: () => all, focus() { document.activeElement = aside; } };
  document.activeElement = opener;
  const React = {
    Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useRef: value => ({ current: value }), useEffect: effect => effects.push(effect),
  };
  const dependencies = {
    React, IconButton: 'IconButton', useKeyboardInset() {}, isTopEscLayer, popEscLayer, pushEscLayer, document,
    window: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, cancelAnimationFrame() {},
    getComputedStyle: element => ({ visibility: element.visibility }),
  };
  const Drawer = new Function(...Object.keys(dependencies), `${javascript}; return Drawer;`)(...Object.values(dependencies));
  const preferredTarget = preferred === 'outside' ? opener : controls.find(element => element.name === preferred);
  const tree = Drawer({ title: '일정 기록', onClose: () => { closed++; }, initialFocusRef: preferred ? { current: preferredTarget } : undefined });
  const dialog = find(tree, node => node.type === 'aside')[0];
  dialog.props.ref.current = aside;
  find(tree, node => node.props.className === 'hub-drawer__body scroll-y')[0].props.ref.current = body;
  effects.forEach(effect => cleanups.push(effect()));
  return { document, opener, close, controls, aside, tree, dialog, closed: () => closed,
    enter: () => frames.forEach(callback => callback()),
    key(value, shiftKey = false) {
      let prevented = false;
      listeners.forEach(listener => listener({ key: value, shiftKey, preventDefault() { prevented = true; } }));
      return prevented;
    },
    tab(shiftKey = false) { let prevented = false; dialog.props.onKeyDown({ key: 'Tab', shiftKey, preventDefault() { prevented = true; } }); return prevented; },
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

test('initial focus skips disabled, hidden and inert body controls', () => {
  const app = mount({ bodyControls: ['disabled', { name: 'hidden', offsetParent: null }, { name: 'inert', inert: true }, { name: 'invisible', visibility: 'hidden' }, 'edit'] });
  app.enter();
  assert.equal(app.document.activeElement.name, 'edit');
  assert.ok(app.controls.slice(0, 4).every(control => control.focused === 0));
  app.unmount(); assert.equal(app.document.activeElement, app.opener);
});

test('an enabled preferred body field wins; disabled or outside preferred targets fall back', () => {
  for (const preferred of ['second', 'disabled', 'outside']) {
    const app = mount({ bodyControls: ['disabled', 'first', 'second'], preferred });
    app.enter(); assert.equal(app.document.activeElement.name, preferred === 'second' ? 'second' : 'first'); app.unmount();
  }
});

test('a loading-only body focuses the enabled close button; an empty drawer has a safe focus fallback', () => {
  const app = mount({ bodyControls: ['disabled'] }); app.enter(); assert.equal(app.document.activeElement, app.close); app.unmount();
  const empty = mount({ bodyControls: [], headerControl: false }); empty.enter();
  assert.equal(empty.document.activeElement, empty.aside); assert.equal(empty.dialog.props.tabIndex, -1);
  empty.document.activeElement = empty.opener; assert.equal(empty.tab(), true); assert.equal(empty.document.activeElement, empty.aside); empty.unmount();
});

test('Tab recovers escaped focus in both directions and retains normal endpoint wrapping', () => {
  const app = mount();
  // Outside key events reach window, not the aside's bubbling handler.
  assert.equal(app.key('Tab'), true); assert.equal(app.document.activeElement, app.close);
  assert.equal(app.tab(true), true); assert.equal(app.document.activeElement.name, 'edit');
  assert.equal(app.tab(), true); assert.equal(app.document.activeElement, app.close);
  app.document.activeElement = app.opener; assert.equal(app.key('Tab', true), true); assert.equal(app.document.activeElement.name, 'edit');
  app.unmount();
});

test('window Tab recovery leaves a higher layer and ordinary inside focus alone', () => {
  const app = mount(), upper = pushEscLayer();
  assert.equal(app.key('Tab'), false); assert.equal(app.document.activeElement, app.opener);
  popEscLayer(upper); app.document.activeElement = app.close;
  assert.equal(app.key('Tab'), false); assert.equal(app.document.activeElement, app.close);
  app.unmount();
});

test('a sole enabled target remains trapped without admitting disabled controls', () => {
  const app = mount({ bodyControls: ['disabled'] });
  assert.equal(app.tab(), true); assert.equal(app.document.activeElement, app.close);
  assert.equal(app.tab(true), true); assert.equal(app.document.activeElement, app.close); app.unmount();
});

test('dialog semantics, top-layer Escape and three dismissal paths stay unchanged', () => {
  const app = mount(); assert.equal(app.dialog.props.role, 'dialog'); assert.equal(app.dialog.props['aria-modal'], 'true'); assert.equal(app.dialog.props['aria-label'], '일정 기록');
  const upper = pushEscLayer(); app.key('Escape'); assert.equal(app.closed(), 0); popEscLayer(upper);
  app.key('Escape'); find(app.tree, node => node.props.className === 'hub-drawer-overlay')[0].props.onClick();
  find(app.tree, node => node.type === 'IconButton')[0].props.onClick(); assert.equal(app.closed(), 3); app.unmount();
});
