import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Exercise the real field, footer, and window shortcut handlers without persistence.
const source = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('function groupFieldRows('), source.indexOf('// Horizontal-scroll wrapper'));
const javascript = ts.transpileModule(component.replace('export function EditDrawer', 'function EditDrawer'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ onSave = async () => ({ ok: false, status: 'error' }), onDelete } = {}) {
  const slots = [], effects = [], listeners = new Set();
  let index = 0, tree, closed = 0, record = { id: 'drawer-keyboard', note: '' };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState: initial => {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
    useRef: initial => { const key = index++; return slots[key] ??= { current: initial }; },
    useCallback: callback => callback,
    useEffect: (effect, deps) => {
      const key = index++, previous = slots[key];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[key] = { deps, cleanup: effect() }; });
      }
    },
  };
  const dependencies = {
    React, DRAWER_INPUT_STYLE: {}, Drawer: 'Drawer', Button: 'Button', Tabs: 'Tabs', ChipToggle: 'ChipToggle',
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    window: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) },
  };
  const EditDrawer = new Function(...Object.keys(dependencies), `${javascript}; return EditDrawer;`)(...Object.values(dependencies));
  function render() {
    index = 0;
    tree = EditDrawer({
      title: '기준 편집', record, fields: [{ key: 'note', label: '내용', type: 'textarea', rows: 3 }],
      onChange: (key, value) => { record = { ...record, [key]: value }; },
      onClose: () => { closed++; }, onSave, onDelete,
    });
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  function findAll(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    const children = [...(node.props?.children || []), node.props?.footer].filter(Boolean);
    return [...(predicate(node) ? [node] : []), ...children.flatMap(child => findAll(predicate, child))];
  }
  render();
  return {
    render, findAll, closed: () => closed,
    close: () => tree.props.onClose(),
    key: overrides => listeners.forEach(listener => listener({ key: 'Enter', metaKey: true, preventDefault() {}, ...overrides })),
  };
}

const button = (app, label) => app.findAll(node => node.type === 'Button' && node.props.children.includes(label))[0];

test('Cmd/Ctrl+Enter cannot bypass discard confirmation; continuing editing restores save', async () => {
  let saves = 0;
  const app = mount({ onSave: async () => { saves++; return { ok: false, status: 'error' }; } });
  app.findAll(node => node.type === 'textarea')[0].props.onChange({ target: { value: '작성 중인 내용' } });
  app.render(); app.close(); app.render();
  assert.ok(button(app, '버리고 닫기'));
  app.key(); app.key({ metaKey: false, ctrlKey: true });
  await Promise.resolve();
  assert.equal(saves, 0);
  assert.equal(app.closed(), 0);
  assert.equal(app.findAll(node => node.type === 'textarea')[0].props.value, '작성 중인 내용');
  button(app, '계속 편집').props.onClick(); app.render();
  app.key(); await Promise.resolve();
  assert.equal(saves, 1);
});

test('save shortcut leaves delete confirmation intact until the explicit delete action', async () => {
  let saves = 0, deletes = 0;
  const app = mount({
    onSave: async () => { saves++; return { ok: false, status: 'error' }; },
    onDelete: async () => { deletes++; return { ok: true, status: 'saved' }; },
  });
  button(app, '삭제').props.onClick(); app.render();
  app.key(); await Promise.resolve();
  assert.equal(saves, 0);
  assert.equal(deletes, 0);
  assert.equal(app.closed(), 0);
  await button(app, '삭제').props.onClick();
  assert.equal(deletes, 1);
  assert.equal(app.closed(), 1);
});

test('save shortcut still ignores IME composition and duplicate in-flight submissions', async () => {
  let saves = 0, finish;
  const app = mount({ onSave: () => { saves++; return new Promise(resolve => { finish = resolve; }); } });
  app.key({ isComposing: true }); app.key({ keyCode: 229 });
  assert.equal(saves, 0);
  app.key({ metaKey: false, ctrlKey: true }); app.render(); app.key();
  assert.equal(saves, 1);
  assert.equal(app.findAll(node => node.type === 'textarea')[0].props.disabled, true);
  finish({ ok: false, status: 'error' }); await Promise.resolve();
  app.render();
  assert.equal(app.findAll(node => node.type === 'textarea')[0].props.disabled, false);
  assert.equal(app.closed(), 0);
});
