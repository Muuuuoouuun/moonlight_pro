import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { isTopEscLayer, popEscLayer, pushEscLayer } from './esc-layers.js';

// Exercise the real field, footer, and window shortcut handlers without persistence.
const source = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('function groupFieldRows('), source.indexOf('// Horizontal-scroll wrapper'));
const javascript = ts.transpileModule(component.replace('export function EditDrawer', 'function EditDrawer'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ onSave = async () => ({ ok: false, status: 'error' }), onDelete, initialRecord = { id: 'drawer-keyboard', note: '' }, props = {} } = {}) {
  const slots = [], effects = [], listeners = new Set();
  let index = 0, tree, closed = 0, record = initialRecord;
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
    React, DRAWER_INPUT_STYLE: {}, Drawer: 'Drawer', Button: 'Button', Tabs: 'Tabs', ChipToggle: 'ChipToggle', SegmentedControl: 'SegmentedControl', Kbd: 'Kbd',
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    window: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) },
    isTopEscLayer,
  };
  const layer = pushEscLayer();
  const EditDrawer = new Function(...Object.keys(dependencies), `${javascript}; return EditDrawer;`)(...Object.values(dependencies));
  function render() {
    index = 0;
    tree = EditDrawer({
      title: '기준 편집', record, fields: [{ key: 'note', label: '내용', type: 'textarea', rows: 3 }],
      onChange: (key, value) => { record = { ...record, [key]: value }; },
      onClose: () => { closed++; }, onSave, onDelete, ...props,
    });
    effects.splice(0).forEach(effect => effect());
    if (tree?.props.keyboardLayerRef) tree.props.keyboardLayerRef.current = layer;
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
    shortcutCount: () => listeners.size,
    unmount: () => { slots.forEach(slot => slot?.cleanup?.()); popEscLayer(layer); },
    close: () => tree.props.onClose(),
    key: overrides => listeners.forEach(listener => listener({ key: 'Enter', metaKey: true, preventDefault() {}, ...overrides })),
  };
}

const button = (app, label) => app.findAll(node => node.type === 'Button' && node.props.children.includes(label))[0];

test('conflict keeps the drawer and input open with explicit retry guidance', async t => {
  const app = mount({ onSave: async () => ({ ok: false, status: 'conflict' }) });
  t.after(app.unmount);
  app.findAll(node => node.type === 'textarea')[0].props.onChange({ target: { value: '보존할 합성 입력' } });
  app.render(); app.key(); await Promise.resolve(); app.render();
  assert.equal(app.closed(), 0);
  assert.equal(app.findAll(node => node.type === 'textarea')[0].props.value, '보존할 합성 입력');
  assert.match(JSON.stringify(app.findAll(node => node.type === 'span')), /입력을 유지.*기록을 확인.*다시 시도/);
});

test('the save shortcut is bound only for an open record and removed on unmount', async () => {
  let saves = 0;
  const closed = mount({ initialRecord: null, onSave: async () => { saves++; } });
  try {
    assert.equal(closed.shortcutCount(), 0);
    closed.key(); await Promise.resolve();
    assert.equal(saves, 0);
  } finally { closed.unmount(); }
  const open = mount();
  try { assert.equal(open.shortcutCount(), 1); }
  finally { open.unmount(); }
  assert.equal(open.shortcutCount(), 0);
});

test('Cmd/Ctrl+Enter cannot bypass discard confirmation; continuing editing restores save', async t => {
  let saves = 0;
  const app = mount({ onSave: async () => { saves++; return { ok: false, status: 'error' }; } });
  t.after(app.unmount);
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

test('a higher dialog owns Cmd/Ctrl+Enter and cannot save the obscured editor', async t => {
  let saves = 0;
  const app = mount({ onSave: async () => { saves++; return { ok: false, status: 'error' }; } });
  t.after(app.unmount);
  const palette = pushEscLayer();
  try {
    app.key(); app.key({ metaKey: false, ctrlKey: true });
    await Promise.resolve();
    assert.equal(saves, 0);
  } finally { popEscLayer(palette); }
  app.key({ defaultPrevented: true });
  await Promise.resolve();
  assert.equal(saves, 0, 'a consumed keyboard event cannot save the editor');
  app.key(); await Promise.resolve();
  assert.equal(saves, 1, 'editor owns the shortcut again after the upper dialog closes');
});

test('save shortcut leaves delete confirmation intact until the explicit delete action', async t => {
  let saves = 0, deletes = 0;
  const app = mount({
    onSave: async () => { saves++; return { ok: false, status: 'error' }; },
    onDelete: async () => { deletes++; return { ok: true, status: 'saved' }; },
  });
  t.after(app.unmount);
  button(app, '삭제').props.onClick(); app.render();
  app.key(); await Promise.resolve();
  assert.equal(saves, 0);
  assert.equal(deletes, 0);
  assert.equal(app.closed(), 0);
  await button(app, '삭제').props.onClick();
  assert.equal(deletes, 1);
  assert.equal(app.closed(), 1);
});

test('save shortcut still ignores IME composition and duplicate in-flight submissions', async t => {
  let saves = 0, finish;
  const app = mount({ onSave: () => { saves++; return new Promise(resolve => { finish = resolve; }); } });
  t.after(app.unmount);
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

test('sheet layout: one-line title, segmented choice, and 취소 still guards a changed draft', t => {
  const app = mount({
    initialRecord: { id: 'sheet-1', title: '이름', status: 'draft' },
    props: {
      layout: 'sheet',
      fields: [
        { key: 'title', label: '프로젝트명', variant: 'title' },
        { key: 'status', label: '상태', type: 'segmented', options: [{ value: 'draft', label: '계획' }, { value: 'active', label: '진행 중' }] },
      ],
    },
  });
  t.after(() => app.unmount());
  const title = app.findAll(node => node.type === 'textarea')[0];
  assert.equal(title.props['aria-label'], '프로젝트명');
  let prevented = false;
  title.props.onKeyDown({ key: 'Enter', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true, 'Enter must not add a line to the name');
  const segment = app.findAll(node => node.type === 'SegmentedControl')[0];
  assert.deepEqual(segment.props.options.map(option => option.key), ['draft', 'active']);
  segment.props.onChange('active');
  app.render();
  button(app, '취소').props.onClick();
  app.render();
  assert.equal(app.closed(), 0);
  assert.ok(button(app, '버리고 닫기'));
});
