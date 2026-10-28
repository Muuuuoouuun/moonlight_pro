import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import ts from 'typescript';
import * as identity from '../../../lib/brand-identity.js';

const source = (await readFile(new URL('./brands.jsx', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\n/gm, '').replace(/^export function /gm, 'function ');
// Exercise the real create callback with an isolated ledger; no runtime reads or writes are available.
const isolated = source.slice(0, source.indexOf('function useBrandLedger()'))
  + source.slice(source.indexOf('function syncStateOf('));
const code = ts.transpileModule(isolated, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;

function mountBrandCreator(outcome) {
  const slots = []; let cursor = 0, tree;
  const navigation = [], successes = [], writes = [];
  let reloads = 0;
  const HookReact = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback: callback => callback, useMemo: callback => callback(), useEffect() {},
  };
  const dependencies = { ...identity, React: HookReact,
    useRouter: () => ({ replace: url => navigation.push(url), push: url => navigation.push(url) }),
    usePathname: () => '/dashboard/brands', useSearchParams: () => new URLSearchParams(),
    useToast: () => ({ success: message => successes.push(message) }),
    useBrandLedger: () => ({ ledger: { source: 'supabase', brands: [] }, reload: async () => { reloads++; return { brands: [] }; } }),
    buildBrandDirectory: () => ({ brands: [], totals: {} }), selectBrand: () => null,
    filterBrandDirectory: brands => brands, BRAND_VIEW_FILTERS: [], createClientId: () => 'synthetic-brand-id',
    fetch: async (_url, options) => { writes.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => outcome }; },
  };
  for (const name of ['RelatedMemos', 'GoalLinks', 'MemoCaptureLink', 'ContextMentorRail', 'Iconed', 'BrandIcon', 'Button', 'Card', 'CertaintyBadge', 'EditDrawer', 'EmptyState', 'Kbd', 'ScrollShadowX', 'SegmentedControl', 'SelectField', 'SyncBadge', 'TextField', 'Skeleton']) dependencies[name] = name;
  const Brands = new Function(...Object.keys(dependencies), code + '\nreturn Brands;')(...Object.values(dependencies));
  const render = () => { cursor = 0; tree = Brands({}); return tree; };
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children, node.props?.action].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  render(); find(tree, node => node.type === 'Button' && node.props.icon === 'plus').props.onClick(); render();
  const drawer = () => find(tree, node => node.type === 'EditDrawer');
  return { render, drawer, writes, successes, navigation, reloads: () => reloads,
    edit(key, value) { drawer().props.onChange(key, value); render(); },
  };
}

test('a preview create keeps the actual brand draft and returns a failed save envelope for EditDrawer', async () => {
  const mounted = mountBrandCreator({ status: 'preview' });
  mounted.edit('name', '연결 후 만들 브랜드'); mounted.edit('orgScope', 'classin');
  const result = await mounted.drawer().props.onSave(); mounted.render();
  assert.equal(result.ok, false); assert.equal(result.status, 'preview'); assert.match(result.message, /저장되지/);
  assert.equal(mounted.drawer().props.record.name, '연결 후 만들 브랜드');
  assert.equal(mounted.drawer().props.record.orgScope, 'classin');
  assert.equal(mounted.reloads(), 0); assert.deepEqual(mounted.successes, []); assert.deepEqual(mounted.navigation, []);
  await mounted.drawer().props.onSave();
  assert.equal(mounted.writes.length, 2); assert.equal(mounted.writes[0].id, mounted.writes[1].id);
});

for (const status of ['saved', 'duplicate']) test(`a confirmed ${status} create still refreshes, navigates and lets EditDrawer close`, async () => {
  const mounted = mountBrandCreator({ status }); mounted.edit('name', '확인한 브랜드');
  const result = await mounted.drawer().props.onSave(); mounted.render();
  assert.equal(result.ok, true); assert.equal(result.status, status);
  assert.equal(mounted.reloads(), 1); assert.equal(mounted.successes.length, 1); assert.equal(mounted.navigation.length, 1);
  mounted.drawer().props.onClose(); mounted.render(); assert.equal(mounted.drawer(), null);
});
