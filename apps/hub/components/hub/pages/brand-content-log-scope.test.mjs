import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { studioDocumentPointerKey } from '../../../lib/content-studio-storage.js';
import { studioHref } from '../../../lib/content-flow.js';

const sourceRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const requireSource = createRequire(import.meta.url);
const ts = requireSource('typescript');
const realReact = requireSource('react');
const pagePath = 'apps/hub/components/hub/pages/brand-content-log.jsx';
const navPath = 'apps/hub/components/hub/hub-nav.js';
const allowed = new Set([pagePath, navPath, 'apps/hub/components/hub/workspace-map.js', 'apps/hub/lib/brand-org-scope.js', 'apps/hub/lib/brand-content-log.js', 'apps/hub/lib/feature-gates.js']);
const data = {
  syncState: 'live',
  brands: [
    { id: 'b-company', key: 'classmoon', name: 'Synthetic Company', orgScope: 'classin' },
    { id: 'b-personal', key: 'personal-alpha', name: 'Synthetic Personal', orgScope: 'personal' },
    { id: 'b-live', key: 'live-override', name: 'Synthetic Live Company', orgScope: 'classin' },
    { id: 'b-unknown', key: 'unknown-alpha', name: 'Synthetic Unknown' },
  ],
  items: [
    { id: 'i-company', title: 'Company record', status: 'idea', orgScope: 'company', brandKey: 'classmoon', brandName: 'Synthetic Company', channel: 'Threads' },
    { id: 'i-personal', title: 'Personal record', status: 'draft', orgScope: 'personal', brandKey: 'personal-alpha', brandName: 'Synthetic Personal', channel: 'Blog' },
    { id: 'i-live', title: 'Live override record', status: 'review', brandKey: 'live-override', brandName: 'Synthetic Live Company', channel: 'Blog' },
    { id: 'i-canonical', title: 'Canonical fallback record', status: 'draft', brandKey: 'classin_side', brandName: 'Synthetic Canonical', channel: 'Threads' },
    { id: 'i-unknown', title: 'Unknown brand record', status: 'draft', brandKey: 'unknown-alpha', brandName: 'Synthetic Unknown', channel: 'Blog' },
    { id: 'i-no-brand', title: 'No brand record', status: 'idea', brandKey: null, orgScope: null, channel: 'Blog' },
    { id: 'i-explicit', title: 'Explicit scope overrides brand', status: 'published', orgScope: 'personal', brandKey: 'classmoon', channel: 'Threads' },
    { id: 'i-archived', title: 'Archived record', status: 'archived', orgScope: 'personal', brandKey: 'personal-alpha' },
    { id: 'i-status-unknown', title: 'Unknown status record', status: 'future-status', orgScope: 'personal', brandKey: 'personal-alpha' },
    null,
  ],
};
const allVisible = ['Company record', 'Personal record', 'Live override record', 'Canonical fallback record', 'Unknown brand record', 'No brand record', 'Explicit scope overrides brand'];

// Executes the actual component body and callbacks with synthetic hook
// storage. This is neither a browser nor React's mounted reconciliation/effect loop.
// The source import allowlist contains the page/nav and pure helpers. Ledger,
// Next URL and primitives are stubs; no runtime transport or DOM is supplied.
function harness(query = '', ledger = data) {
  const state = [];
  let cursor = 0;
  let params = new URLSearchParams(query);
  let currentLedger = ledger;
  let hotkey;
  const navigation = [];
  const primitives = Object.fromEntries(['Button', 'EmptyState', 'Input', 'Kbd', 'SegmentedControl', 'SyncBadge'].map(name => [name, name]));
  const React = {
    createElement: realReact.createElement,
    useMemo: fn => fn(), useCallback: fn => fn,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
  };
  const cache = new Map();
  // Separate evaluation context: no fetch, process, document, window, timers,
  // socket module, or unrestricted require is supplied to the tested modules.
  const context = vm.createContext({ URLSearchParams });
  function load(relative) {
    assert.ok(allowed.has(relative), `unexpected source import: ${relative}`);
    if (cache.has(relative)) return cache.get(relative);
    const location = path.join(sourceRoot, relative);
    const text = fs.readFileSync(location, 'utf8');
    const transpiled = ts.transpileModule(text, { fileName: relative, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }, reportDiagnostics: true });
    assert.equal(transpiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, relative);
    const module = { exports: {} };
    const localRequire = request => {
      if (request === 'react') return React;
      if (request === 'next/navigation') return { useSearchParams: () => params };
      if (request.endsWith('/hub-primitives')) return primitives;
      if (request.endsWith('/use-crm-keyboard')) return { usePageCreateHotkey: fn => { hotkey = fn; } };
      if (request.endsWith('/use-content-ledger')) return { useContentLedger: () => currentLedger };
      let target = request.startsWith('@/') ? 'apps/hub/' + request.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(relative), request));
      if (!path.posix.extname(target)) target += '.js';
      return load(target);
    };
    new vm.Script(`(function(require,module,exports){${transpiled.outputText}\n})`, { filename: location }).runInContext(context)(localRequire, module, module.exports);
    cache.set(relative, module.exports);
    return module.exports;
  }
  const { BrandContentLog } = load(pagePath);
  return {
    nav: load(navPath),
    logHelpers: load('apps/hub/lib/brand-content-log.js'),
    render() { cursor = 0; return BrandContentLog({ onNavigate: href => navigation.push(href) }); },
    setQuery(value) { params = new URLSearchParams(value); },
    setLedger(value) { currentLedger = value; },
    navigation, newHotkey() { hotkey(); },
  };
}
function nodes(node, predicate = () => true) {
  if (Array.isArray(node)) return Array.from(node).flatMap(child => nodes(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate), ...nodes(node.props?.action, predicate)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? textOf(node.props?.children) : String(node);
}
const cards = tree => nodes(tree, node => node.props?.className === 'brand-log-card');
const titles = tree => cards(tree).map(node => node.props['aria-label'].split(' · ')[0]);
const chip = (tree, label) => nodes(tree, n => n.props?.className === 'brand-log-chip').find(n => textOf(n).includes(label));
const lastUrl = h => new URL(h.navigation.at(-1), 'http://fixture.invalid/');

test('navigation only adds scope to personal/ClassIn log destinations; all URL is unchanged', () => {
  const h = harness();
  for (const scope of ['all', 'personal', 'classin']) {
    const log = h.nav.sidebarChildren('brands', scope).find(c => c.key === 'brand-log');
    assert.equal(log.path, 'dashboard/brands/log' + (scope === 'all' ? '' : '?scope=' + scope));
    assert.equal(h.nav.topNavigationForRoute(log.path, scope).activeTab.key, 'brand-log');
  }
});
for (const [name, query] of [['absent', ''], ['explicit all', 'scope=all'], ['unknown scope', 'scope=unknown']]) {
  test(`${name} keeps cross-brand records and honors existing normalized all`, () => {
    const h = harness(query);
    assert.deepEqual(titles(h.render()).sort(), allVisible.slice().sort());
    h.newHotkey();
    assert.equal(lastUrl(h).searchParams.get('scope'), null);
    assert.equal(lastUrl(h).searchParams.get('new'), 'draft');
  });
}
test('personal uses explicit/live/canonical/default precedence without dropping unknown brand or untagged records', () => {
  const h = harness('scope=personal');
  const tree = h.render();
  assert.deepEqual(titles(tree).sort(), ['Personal record', 'Unknown brand record', 'No brand record', 'Explicit scope overrides brand'].sort());
  assert.ok(chip(tree, 'Synthetic Personal'));
  assert.ok(chip(tree, 'Synthetic Unknown'));
  assert.equal(chip(tree, 'Synthetic Company'), undefined);
  assert.match(textOf(tree), /개인 콘텐츠 기록/);
});
test('ClassIn includes explicit company, live brand and canonical fallback only', () => {
  const h = harness('scope=classin');
  const tree = h.render();
  assert.deepEqual(titles(tree).sort(), ['Company record', 'Live override record', 'Canonical fallback record'].sort());
  assert.ok(chip(tree, 'Synthetic Company'));
  assert.ok(chip(tree, 'Synthetic Live Company'));
  assert.equal(chip(tree, 'Synthetic Personal'), undefined);
  assert.match(textOf(tree), /ClassIn 콘텐츠 기록/);
});
test('brand chip filters records and seeds new=draft; scope change cannot carry opposite brand seed', () => {
  const h = harness('scope=personal');
  chip(h.render(), 'Synthetic Personal').props.onClick();
  assert.deepEqual(titles(h.render()), ['Personal record']);
  h.newHotkey();
  assert.equal(lastUrl(h).searchParams.get('brand'), 'personal-alpha');
  assert.equal(lastUrl(h).searchParams.get('scope'), null);
  h.setQuery('scope=classin');
  assert.deepEqual(titles(h.render()).sort(), ['Company record', 'Live override record', 'Canonical fallback record'].sort());
  h.newHotkey();
  assert.equal(lastUrl(h).searchParams.get('brand'), null);
  assert.equal(lastUrl(h).searchParams.get('scope'), null);
  // Synthetic URL back: no browser history implementation is claimed.
  h.setQuery('scope=personal');
  assert.deepEqual(titles(h.render()), ['Personal record']);
});
test('explicit all wins after scoped selection, and selecting a brand remains an intentional local filter', () => {
  const h = harness('scope=classin');
  h.render();
  h.setQuery('scope=all');
  const tree = h.render();
  assert.deepEqual(titles(tree).sort(), allVisible.slice().sort());
  chip(tree, 'Synthetic Personal').props.onClick();
  assert.deepEqual(titles(h.render()), ['Personal record']);
  h.newHotkey();
  assert.equal(lastUrl(h).searchParams.get('scope'), null);
  assert.equal(lastUrl(h).searchParams.get('brand'), 'personal-alpha');
});
test('board and list keyboard/click links preserve the existing Studio document address', () => {
  const h = harness('scope=personal');
  const card = cards(h.render())[0];
  let prevented = false;
  card.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(lastUrl(h).searchParams.get('item'), card.key);
  assert.equal(lastUrl(h).searchParams.get('scope'), null);
  nodes(h.render(), n => n.type === 'SegmentedControl')[0].props.onChange('list');
  const row = nodes(h.render(), n => n.props?.className === 'hub-row brand-log-row')[0];
  row.props.onClick();
  assert.equal(lastUrl(h).searchParams.get('item'), row.key);
  assert.equal(lastUrl(h).searchParams.get('scope'), null);
  assert.doesNotMatch(fs.readFileSync(path.join(sourceRoot, pagePath), 'utf8'), /router\.(replace|back)|history\./);
});
test('partial/unknown/error/loading/preview badge state is preserved through scope filtering', () => {
  for (const syncState of ['partial', 'unknown', 'error', 'loading', 'preview']) {
    const h = harness('scope=personal', { ...data, syncState });
    const tree = h.render();
    assert.equal(nodes(tree, n => n.type === 'SyncBadge')[0].props.state, syncState);
  }
  const h = harness('scope=personal', { ...data, syncState: 'partial', brands: [] });
  const tree = h.render();
  assert.ok(titles(tree).includes('No brand record'));
  assert.equal(nodes(tree, n => n.type === 'SyncBadge')[0].props.state, 'partial');
});
test('scoped live empty copy describes selected scope; error stays read error', () => {
  const classinOnly = { ...data, items: [data.items[0]] };
  const h = harness('scope=personal', classinOnly);
  const empty = nodes(h.render(), n => n.type === 'EmptyState')[0];
  assert.match(empty.props.description, /선택한 범위/);
  h.setLedger({ brands: [], items: [], syncState: 'error' });
  const error = nodes(h.render(), n => n.type === 'EmptyState')[0];
  assert.match(error.props.title, /불러오지 못/);
  assert.match(error.props.description, /실제 기록이 있을 수/);
});
test('fallback identity palette and 3px rail remain identical across scope changes', () => {
  const global = harness('scope=all');
  const colors = global.logHelpers.resolveBrandLogColors(data.brands);
  const all = new Map(cards(global.render()).map(card => [card.key, card.props.style.boxShadow]));
  for (const scope of ['personal', 'classin']) {
    const scoped = harness('scope=' + scope);
    for (const card of cards(scoped.render())) {
      const item = data.items.find(item => item?.id === card.key);
      const color = colors.get(item.brandKey) || 'var(--fg-faint)';
      assert.equal(card.props.style.boxShadow, all.get(card.key));
      assert.equal(card.props.style.boxShadow, 'inset 3px 0 0 ' + color);
    }
  }
});
test('null, archived and unknown-status rows remain excluded in every scope', () => {
  for (const scope of ['all', 'personal', 'classin']) {
    const h = harness('scope=' + scope);
    const visible = cards(h.render()).map(card => card.key);
    assert.equal(visible.includes('i-archived'), false);
    assert.equal(visible.includes('i-status-unknown'), false);
    assert.equal(visible.includes(null), false);
  }
});
test('scope projection and navigation leave the input ledger unchanged', () => {
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  const ledger = freeze(JSON.parse(JSON.stringify(data)));
  const before = JSON.stringify(ledger);
  const h = harness('scope=personal', ledger);
  chip(h.render(), 'Synthetic Personal').props.onClick();
  h.render(); h.newHotkey();
  h.setQuery('scope=classin'); h.render(); h.newHotkey();
  h.setQuery('scope=all'); h.render();
  assert.equal(JSON.stringify(ledger), before);
});
test('receiver source boundary: Studio reads scope into route/mirror identity, but picker remains workspace-prop based', () => {
  const hook = fs.readFileSync(path.join(sourceRoot, 'apps/hub/components/hub/pages/use-content-studio.js'), 'utf8');
  assert.match(hook, /const scope = workspace \|\| scopeParam \|\| 'all'/);
  assert.match(hook, /routeIdentity\(scope,/);
  const studio = fs.readFileSync(path.join(sourceRoot, 'apps/hub/components/hub/pages/content-studio.jsx'), 'utf8');
  assert.match(studio, /filterBrandsByWorkspace\(ledger.brands \|\| \[\], workspace\)/);
});


test('scoped log navigation keeps the same Studio recovery pointer as the content flow', () => {
  const pointer = url => studioDocumentPointerKey({
    scope: url.searchParams.get('scope') || 'all', contentId: url.searchParams.get('item'),
    variantId: url.searchParams.get('variant'),
  });
  for (const scope of ['personal', 'classin']) {
    const h = harness('scope=' + scope), card = cards(h.render())[0];
    card.props.onClick();
    const logUrl = lastUrl(h), flowUrl = new URL(studioHref(card.key), 'http://fixture.invalid');
    assert.equal(pointer(logUrl), pointer(flowUrl));
    // A display scope must not silently move an existing document's local pointer.
    assert.notEqual(pointer(logUrl), studioDocumentPointerKey({ scope, contentId: card.key }));
    h.newHotkey();
    assert.equal(lastUrl(h).searchParams.has('scope'), false);
  }
});
