import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import * as catalog from '../../../lib/product-catalog.js';

const page = readFileSync(new URL('./product-page.jsx', import.meta.url), 'utf8');
const drawerSource = page.slice(page.indexOf('function MonthDrawer('), page.indexOf('\n// 운영 상태'));
const drawerJs = ts.transpileModule(drawerSource, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mountMonthDrawer(recordMonth) {
  const slots = [];
  const effects = [];
  let index = 0;
  let dirty = false;
  let tree;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) } }),
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; dirty = true; }];
    },
    useEffect(fn, deps) {
      const slot = index++;
      if (slots[slot]?.length === deps.length && slots[slot].every((value, i) => Object.is(value, deps[i]))) return;
      slots[slot] = deps;
      effects.push(fn);
    },
  };
  const saved = [];
  const product = { id: '22222222-2222-4222-8222-222222222222', name: '합성 제품', metrics: [] };
  const dependencies = {
    React, ...catalog, recordMonth, styles: {},
    monthLabel: month => `${Number(month.slice(5, 7))}월`,
    Button: 'Button', Drawer: 'Drawer', SegmentedControl: 'SegmentedControl', TextField: 'TextField',
  };
  const Drawer = new Function(...Object.keys(dependencies), `${drawerJs}; return MonthDrawer;`)(...Object.values(dependencies));
  const render = () => {
    let passes = 0;
    do {
      assert.ok(passes++ < 10, 'actual drawer settles after effects');
      dirty = false;
      index = 0;
      tree = Drawer({ product, month: '2026-10', onClose() {}, onSaved: message => saved.push(message) });
      effects.splice(0).forEach(fn => fn());
    } while (dirty);
  };
  const findAll = (predicate, node = tree) => {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => findAll(predicate, child)), ...(node.props?.footer ? findAll(predicate, node.props.footer) : [])];
  };
  const field = label => findAll(node => node.type === 'TextField' && node.props.label.startsWith(label))[0];
  const saveButton = () => findAll(node => node.type === 'Button' && node.props.variant === 'primary')[0];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).map(text).join('');
  render();
  return {
    saved, field, findAll, render,
    edit(label, value) { field(label).props.onChange({ target: { value } }); render(); },
    async save() { const pending = saveButton().props.onClick(); render(); await pending; render(); },
    startSave() { const pending = saveButton().props.onClick(); render(); return pending; },
    alert: () => text(findAll(node => node.props.role === 'alert')[0]),
  };
}

test('actual monthly drawer rejects malformed input with zero writes and preserves it for correction', async () => {
  for (const value of ['-500', '+500', '1.5', 'abc', '1,2', '9007199254740992']) {
    const writes = [];
    const drawer = mountMonthDrawer(async body => { writes.push(body); return { ok: true }; });
    drawer.edit('매출', value);
    await drawer.save();
    assert.equal(writes.length, 0, value);
    assert.equal(drawer.field('매출').props.value, value, 'invalid original text remains editable');
    assert.match(drawer.alert(), /매출/);
    assert.equal(drawer.saved.length, 0);
    drawer.edit('매출', '1,200');
    await drawer.save();
    assert.equal(writes.length, 1, 'only the corrected attempt writes');
    assert.deepEqual(writes[0], { productId: '22222222-2222-4222-8222-222222222222', month: '2026-10', activeUsers: null, revenue: 1200, cost: null });
    assert.equal(drawer.saved.length, 1);
  }
});

test('actual monthly drawer sends explicit zero and null, locks the draft, and preserves server-failed input', async () => {
  const writes = [];
  let settle;
  const drawer = mountMonthDrawer(body => { writes.push(body); return new Promise(resolve => { settle = resolve; }); });
  drawer.edit('주간 사용자', '0');
  drawer.edit('매출', '1,200');
  const pending = drawer.startSave();
  assert.deepEqual(writes[0], { productId: '22222222-2222-4222-8222-222222222222', month: '2026-10', activeUsers: 0, revenue: 1200, cost: null });
  assert.equal(drawer.findAll(node => node.type === 'fieldset')[0]?.props.disabled, true);
  settle({ ok: false, message: '합성 저장 실패' });
  await pending;
  drawer.render();
  assert.equal(drawer.findAll(node => node.type === 'fieldset')[0]?.props.disabled, false);
  assert.equal(drawer.field('매출').props.value, '1,200');
  assert.equal(drawer.field('주간 사용자').props.value, '0');
  assert.equal(drawer.field('비용').props.value, '');
  assert.equal(drawer.alert(), '합성 저장 실패');
  assert.equal(drawer.saved.length, 0);
});

const portfolioSource = readFileSync(new URL('./product-portfolio.jsx', import.meta.url), 'utf8');
const portfolioJs = ts.transpileModule(portfolioSource.replace(/^import[\s\S]*?;\s*$/gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const portfolioReact = { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) } }) };
const portfolioDependencies = { React: portfolioReact, ...catalog, styles: {}, exports: {} };
const Portfolio = new Function(...Object.keys(portfolioDependencies), `${portfolioJs}; return exports.ProductPortfolio;`)(...Object.values(portfolioDependencies));
const readText = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).map(readText).join(' ');
const product = (id, values, opsStatus = 'live') => ({ id, name: `합성 ${id}`, opsStatus, stage: 'idea', metrics: [{ month: '2026-10', ...values }], projects: [], inquiries: [], repositories: [] });

test('actual portfolio labels incomplete sums and leaves entirely unknown and empty money unmeasured', () => {
  const partial = readText(Portfolio({ products: [product('one', { activeUsers: 0, revenue: 100, cost: 20 }), product('two', { activeUsers: null, revenue: 200, cost: null })], inquiries: [], month: '2026-10' }));
  assert.match(partial, /확인된 주간 사용자/);
  assert.match(partial, /확인된 순이익/);
  assert.match(partial, /₩80/);
  assert.match(partial, /1개 제품 매출·비용 확인 필요/);
  const unknown = readText(Portfolio({ products: [product('unknown', { revenue: null, cost: 20 })], inquiries: [], month: '2026-10' }));
  assert.match(unknown, /순이익 —/);
  assert.match(unknown, /1개 제품 매출·비용 확인 필요/);
  assert.doesNotMatch(unknown, /−₩20/);
  const empty = readText(Portfolio({ products: [], inquiries: [], month: '2026-10' }));
  assert.match(empty, /순이익 — 매출·비용 입력 전/);
  assert.doesNotMatch(empty, /매출 ₩0/);
});
