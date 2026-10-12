import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as navigation from '../../../lib/journal-search-client.js';
import { isCanonicalUuid } from '../../../lib/uuid.js';
import { journalScopeLabel } from '../../../lib/journal.js';
import { NOTE_QUESTIONS } from '../../../lib/journal-client.js';

const W = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const row = { id: ID, title: 'Synthetic title', excerpt: 'Synthetic title\nSynthetic body', occurredAt: '2026-10-01T00:00:00Z', noteMeta: { scope: 'company', kind: 'idea' } };
const source = readFileSync(new URL('./memos.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./memos.css', import.meta.url), 'utf8');

// Actual JSX, with primitive boundaries retained so labels, disabled controls and
// read-state branches can be inspected. Effects are never run; no API is called.
function page(searchPatch = {}, { ready = true, selected = [] } = {}) {
  let states = 0, owner;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'fragment',
    useState(initial) {
      let value = typeof initial === 'function' ? initial() : initial;
      if (states++ === 0) value = { ...value, status: ready ? 'live' : 'loading', workspaceConfirmed: ready, workspaceId: W, requestKey: 'note::company' };
      else if (value && Array.isArray(value.ids)) value = { owner, ids: selected };
      return [value, () => {}];
    },
    useMemo(fn) { const value = fn(); if (value?.scope === 'company' && 'ready' in value) owner = value; return value; },
    useRef: value => ({ current: value }), useEffect() {}, useCallback: callback => callback,
  };
  const dependencies = { ...navigation, React, isCanonicalUuid, journalScopeLabel, NOTE_QUESTIONS,
    useRouter: () => ({ replace() {}, push() {} }), usePathname: () => '/dashboard/work/memos',
    useSearchParams: () => new URLSearchParams('noteScope=company'),
    useMemoSearch: () => ({ status: 'live', entries: [row], nextCursor: null, ...searchPatch }),
    lastJournalWorkspace: () => null, findRelatedMemos: () => [], memoTime: () => 'Synthetic time',
    Button: 'Button', Card: 'Card', Checkbox: 'Checkbox', SelectField: 'SelectField', Skeleton: 'Skeleton',
    EmptyState: 'EmptyState', Kbd: 'Kbd', TruthBadge: 'TruthBadge', Iconed: 'Iconed', MemoSearchControls: 'MemoSearchControls',
  };
  const compiled = ts.transpile(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
  const module = new Function(...Object.keys(dependencies), `${compiled}\nreturn { Memos, resolveMemoText };`)(...Object.values(dependencies));
  return { tree: module.Memos(), resolveMemoText: module.resolveMemoText };
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}
const find = (tree, predicate) => elements(tree).filter(predicate);

test('compact rows separate title/body without cutting a matching word prefix', () => {
  const { resolveMemoText } = page();
  assert.deepEqual(resolveMemoText(row), { title: 'Synthetic title', body: 'Synthetic body' });
  assert.deepEqual(resolveMemoText({ title: '계약', excerpt: '계약 여부는 미정' }), { title: '계약', body: '계약 여부는 미정' });
  assert.deepEqual(resolveMemoText({ excerpt: '제목 한 줄\n본문 한 줄' }), { title: '제목 한 줄', body: '본문 한 줄' });
});

test('compact selected list preserves row scope, checkbox name and labeled analysis controls', () => {
  const { tree } = page({}, { selected: [ID] });
  const checkboxes = find(tree, node => node.type === 'Checkbox');
  assert.equal(checkboxes.length, 2);
  assert.equal(checkboxes[0].props.checked, true);
  assert.equal(checkboxes[1].props.size, 18);
  assert.match(checkboxes[1].props.label, /Synthetic title.*회사/);
  assert.equal(checkboxes[1].props.disabled, false);
  assert.equal(find(tree, node => node.type === 'SelectField' && node.props.label === '분석 목적').length, 1);
  assert.equal(find(tree, node => node.props?.className === 'memo-list-header__actions').length, 1);
});

test('unconfirmed workspace disables both bulk and per-row selection', () => {
  const { tree } = page({}, { ready: false });
  assert.ok(find(tree, node => node.type === 'Checkbox').every(node => node.props.disabled));
});

test('read errors cannot become normal lists and partial continuation is retained', () => {
  const failed = page({ status: 'error', entries: [], error: 'Synthetic read failure' }).tree;
  assert.equal(find(failed, node => node.props?.className?.startsWith('memo-list-header')).length, 0);
  assert.ok(find(failed, node => node.props?.role === 'alert').length);
  const partial = page({ status: 'partial', entries: [], nextCursor: 'synthetic-cursor', message: 'Synthetic partial read' }).tree;
  assert.equal(find(partial, node => node.type === 'EmptyState').length, 0);
  assert.ok(find(partial, node => node.type === 'Button' && node.props.children.includes('범위 기록 더 찾기')).length);
});

test('compact styles retain existing 44px selection hitboxes and 16px mobile analysis inputs', () => {
  assert.match(css, /\.memo-row-selection\s*\{[^}]*width:\s*44px/);
  assert.match(css, /\.memo-row-selection \.hub-checkbox::before\s*\{[^}]*inset:\s*-13px/);
  assert.match(css, /\.memo-list-header__left \.hub-checkbox::before\s*\{[^}]*inset:\s*-13px/);
  assert.match(css, /\.memo-list-header__actions \.hub-input\s*\{[^}]*font-size:\s*16px;[^}]*min-height:\s*44px/);
});
