import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('hub-primitives.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Tabs');
const javascript = ts.transpileModule(declaration.getText(parsed).replace('export function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function render(active = 'middle', reduced = false) {
  const effects = [], changes = [], scrolls = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: current => ({ current }),
    useEffect: effect => effects.push(effect),
  };
  const Tabs = new Function('React', 'window', `${javascript}; return Tabs;`)(React, {
    matchMedia: () => ({ matches: reduced }),
  });
  const tree = Tabs({
    tabs: ['first', 'middle', 'last'].map(key => ({ key, label: key })),
    active, onChange: key => changes.push(key), ariaLabel: '보기',
  });
  const buttons = tree.props.children.flat();
  let focused = active;
  const nodes = buttons.map(button => ({
    focus: () => { focused = button.props.children[0]; },
    scrollIntoView: options => scrolls.push(options),
  }));
  buttons.forEach((button, index) => { if (button.props.ref) button.props.ref.current = nodes[index]; });
  return {
    buttons, changes, scrolls, effects, focused: () => focused,
    press(index, key, extras = {}) {
      let prevented = false;
      buttons[index].props.onKeyDown?.({
        key, currentTarget: { parentElement: { querySelectorAll: () => nodes } },
        preventDefault: () => { prevented = true; }, ...extras,
      });
      return prevented;
    },
  };
}

test('Tabs exposes one sequential keyboard entry at the selected tab', () => {
  assert.deepEqual(render().buttons.map(button => button.props.tabIndex), [-1, 0, -1]);
  assert.deepEqual(render('removed').buttons.map(button => button.props.tabIndex), [0, -1, -1]);
});

test('Tabs arrows and Home/End move focus and activate the requested tab, wrapping at the ends', () => {
  for (const [index, key, expected] of [
    [1, 'ArrowRight', 'last'], [1, 'ArrowLeft', 'first'],
    [2, 'ArrowRight', 'first'], [0, 'ArrowLeft', 'last'],
    [1, 'Home', 'first'], [1, 'End', 'last'],
  ]) {
    const tabs = render();
    assert.equal(tabs.press(index, key), true, key);
    assert.deepEqual(tabs.changes, [expected]);
    assert.equal(tabs.focused(), expected);
  }
});

test('Tabs leaves page scrolling, browser shortcuts and IME composition alone', () => {
  for (const [key, extras] of [
    ['ArrowDown', {}], ['Tab', {}], ['Enter', {}],
    ['ArrowRight', { altKey: true }], ['ArrowRight', { ctrlKey: true }],
    ['ArrowRight', { metaKey: true }], ['ArrowRight', { shiftKey: true }],
    ['ArrowRight', { isComposing: true }], ['ArrowRight', { keyCode: 229 }],
    ['ArrowRight', { nativeEvent: { isComposing: true } }],
    ['ArrowRight', { defaultPrevented: true }],
  ]) {
    const tabs = render();
    assert.equal(tabs.press(1, key, extras), false);
    assert.deepEqual(tabs.changes, []);
  }
});

test('Tabs still scrolls the active item into view with motion preferences respected', () => {
  for (const reduced of [false, true]) {
    const tabs = render('middle', reduced);
    tabs.effects.forEach(effect => effect());
    assert.deepEqual(tabs.scrolls, [{ inline: 'nearest', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }]);
  }
});
