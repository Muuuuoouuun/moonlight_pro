import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import ts from 'typescript';
import * as catalog from '../../../lib/product-catalog.js';

const source = (await readFile(new URL('./product-inbox.jsx', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const rows = [{ id: 'one', subject: '첫 문의', status: 'new', receivedAt: '2026-10-27T00:00:00Z' }, { id: 'two', subject: '둘째 문의', status: 'new', receivedAt: '2026-10-26T00:00:00Z' }];
function mount(initialId = null, inquiries = rows) {
  const cells = []; let cursor = 0, effects = [], dirty = false, selectedId = initialId, tree;
  const selections = [];
  const HookReact = { ...React,
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial;
      return [cells[index], value => { const next = typeof value === 'function' ? value(cells[index]) : value; if (!Object.is(next, cells[index])) { cells[index] = next; dirty = true; } }]; },
    useEffect(effect, deps) { const index = cursor++; if (!cells[index] || !cells[index].every((value, i) => Object.is(value, deps[i]))) { cells[index] = deps; effects.push(effect); } },
  };
  const dependencies = { React: HookReact, ...catalog, styles: new Proxy({}, { get: (_, key) => String(key) }), INQUIRY_STATUSES: { new: '새 문의' },
    Button: 'Button', EmptyState: 'EmptyState', SegmentedControl: 'SegmentedControl', SelectField: 'SelectField' };
  const Inbox = new Function(...Object.keys(dependencies), code + ';return ProductInbox;')(...Object.values(dependencies));
  function render() {
    let passes = 0;
    do { assert.ok(passes++ < 10); dirty = false; cursor = 0; effects = []; tree = Inbox({ inquiries, products: [], areas: [], selectedId,
      onSelect(id) { selections.push(id); selectedId = id; }, onChanged() {} }); effects.forEach(effect => effect()); } while (dirty);
    return tree;
  }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children, node.props?.action].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
    return null;
  };
  render();
  return { render, selections,
    detail: () => find(tree, node => node.type?.name === 'InquiryDetail'),
    element: predicate => find(tree, predicate),
    setId(id) { selectedId = id; return render(); },
    mobileOpen: () => Boolean(find(tree, node => node.props?.className === 'split showDetail')),
  };
}

for (const inquiries of [rows, []]) test(`an explicit absent inquiry never falls back to another record (${inquiries.length} loaded)`, () => {
  const h = mount('missing', inquiries);
  assert.equal(h.detail(), null);
  assert.equal(h.element(node => node.type === 'EmptyState')?.props.title, '이 문의를 찾지 못했습니다');
  h.element(node => node.type === 'Button' && node.props.children === '문의 목록으로').props.onClick(); h.render();
  assert.equal(h.selections.at(-1), null); assert.equal(h.mobileOpen(), false);
  assert.equal(h.detail()?.props.inquiry.id ?? null, inquiries[0]?.id ?? null);
});

test('without an explicit ID the existing first-row default remains, and later query navigation opens mobile detail', () => {
  const h = mount();
  assert.equal(h.detail().props.inquiry.id, 'one'); assert.equal(h.mobileOpen(), false);
  h.setId('two'); assert.equal(h.detail().props.inquiry.id, 'two'); assert.equal(h.mobileOpen(), true);
  h.detail().props.onBack(); h.render(); assert.equal(h.selections.at(-1), null); assert.equal(h.mobileOpen(), false);
  h.setId('one'); assert.equal(h.detail().props.inquiry.id, 'one'); assert.equal(h.mobileOpen(), true);
});
