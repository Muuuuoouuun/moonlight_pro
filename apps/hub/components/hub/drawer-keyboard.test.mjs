import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { isTopEscLayer, popEscLayer, pushEscLayer } from './esc-layers.js';

const source = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('export function Drawer('), source.indexOf('// Groups consecutive fields'));
const javascript = ts.transpileModule(component.replace('export function Drawer', 'function Drawer'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount() {
  const cleanups = [], listeners = new Set();
  let closed = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: current => ({ current }),
    useEffect: effect => cleanups.push(effect()),
  };
  const dependencies = {
    React, useKeyboardInset() {}, pushEscLayer, popEscLayer, isTopEscLayer, IconButton: 'button',
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    window: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) },
  };
  const Drawer = new Function(...Object.keys(dependencies), `${javascript}; return Drawer;`)(...Object.values(dependencies));
  Drawer({ title: '키보드 검증', onClose: () => { closed++; } });
  return {
    closed: () => closed,
    key: overrides => listeners.forEach(listener => listener({ key: 'Escape', preventDefault() {}, ...overrides })),
    unmount: () => cleanups.reverse().forEach(cleanup => cleanup?.()),
  };
}

test('IME Escape and already consumed Escape preserve the open drawer', () => {
  const app = mount();
  try {
    app.key({ isComposing: true });
    app.key({ keyCode: 229 });
    app.key({ defaultPrevented: true });
    assert.equal(app.closed(), 0);
    app.key();
    assert.equal(app.closed(), 1);
  } finally { app.unmount(); }
});

test('Escape still closes only the upper layer', () => {
  const app = mount();
  const upper = pushEscLayer();
  try { app.key(); assert.equal(app.closed(), 0); }
  finally { popEscLayer(upper); }
  try { app.key(); assert.equal(app.closed(), 1); }
  finally { app.unmount(); }
});
