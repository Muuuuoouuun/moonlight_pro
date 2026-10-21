import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./pages/revenue-heatmap.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('revenue-heatmap.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = ast.statements.filter(ts.isVariableStatement).flatMap(s => [...s.declarationList.declarations]).find(n => n.name.getText(ast) === 'CustomerRankRow');
assert.ok(declaration);
const expression = declaration.initializer.arguments[0].getText(ast);
const js = ts.transpileModule(`const Row = ${expression};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const IconButton = props => React.createElement('button', { type: 'button', 'aria-label': props.tooltip, onClick: props.onClick });
const Row = new Function('React', 'IconButton', 'fmtMoney', 'heatFill', `${js}; return Row;`)(React, IconButton, n => `${n}원`, () => 'var(--moon-500)');
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
const customer = { name: '합성 고객', region: '합성 지역', canonical: 'synthetic', expected: 300, jumpKey: 'synthetic-id' };
const renderRow = (props = {}) => Row({ customer, rank: 1, max: 600, metricKey: 'expected', onSelect: () => {}, ...props });

test('top rank uses shared neutral/Moonstone tokens without changing its data hierarchy', () => {
  const tree = renderRow();
  assert.equal(tree.props.style.borderLeft, '2px solid var(--moon-300)');
  assert.equal(tree.props.style.background, 'var(--surface-2)');
  assert.equal(tree.props.style.paddingLeft, 4);
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /hub-revenue-top-row/);
  assert.match(markup, /✦ Top/);
  assert.match(markup, /01/);
  assert.match(markup, /300원/);
  assert.match(markup, /width:50%/);
  assert.match(markup, /linear-gradient\(90deg, var\(--moon-500\), var\(--moon-200\)\)/);
  assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  const topBadge = nodes(tree).find(n => n.props?.children === '✦ Top');
  assert.equal(topBadge.props.style.background, 'var(--surface-3)');
  assert.equal(topBadge.props.style.color, 'var(--fg)');
  assert.equal(topBadge.props.style.border, '1px solid var(--line)');
});

test('non-first and zero-value ranks retain ordinary rows, and selection/map/jump callbacks remain distinct', () => {
  for (const props of [{ rank: 2 }, { customer: { ...customer, expected: 0 } }]) {
    const tree = renderRow(props);
    assert.equal(tree.props.style.borderLeft, undefined);
    assert.doesNotMatch(renderToStaticMarkup(tree), /✦ Top|hub-revenue-top-row/);
  }
  const calls = [];
  const tree = renderRow({ onSelect: value => calls.push(['select', value]), onPeek: value => calls.push(['peek', value]), onJump: value => calls.push(['jump', value]) });
  tree.props.onClick();
  let prevented = 0;
  for (const key of ['Enter', ' ', 'Escape']) tree.props.onKeyDown({ key, preventDefault() { prevented++; } });
  assert.equal(prevented, 2);
  tree.props.onMouseEnter(); tree.props.onMouseLeave(); tree.props.onFocus(); tree.props.onBlur();
  let stopped = 0;
  nodes(tree).find(n => n.type === IconButton).props.onClick({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 1);
  assert.deepEqual(calls, [['select', customer], ['select', customer], ['select', customer], ['peek', 'synthetic'], ['peek', null], ['peek', 'synthetic'], ['peek', null], ['jump', 'synthetic-id']]);
});

test('Projects memo selection inherits the shared accent surface in both themes', () => {
  const css = readFileSync(new URL('./pages/memo-workspace.module.css', import.meta.url), 'utf8');
  const rule = css.match(/\.workspace \.row\[aria-pressed="true"\]\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /background:\s*var\(--accent-soft\)/);
  assert.match(rule, /box-shadow:\s*inset 1px 0 var\(--accent\)/);
  const tokens = readFileSync(new URL('./hub-tokens.css', import.meta.url), 'utf8');
  assert.ok([...tokens.matchAll(/--accent-soft\s*:/g)].length >= 2, 'shared token has light/dark definitions');
});
