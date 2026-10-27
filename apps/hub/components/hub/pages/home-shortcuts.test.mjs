import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { Kbd } from '../hub-primitives.jsx';

const source = readFileSync(new URL('./home.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('home.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let footer;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'footer') footer = node;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(footer);
const js = ts.transpileModule(`const element = ${footer.getText(ast)};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const tree = new Function('React', 'Kbd', 'active', `${js}; return element;`)(React, Kbd, { links: [{ action: 'decision' }] });
const children = React.Children.toArray(tree.props.children);
const keyChildren = node => React.Children.toArray(node?.props?.children).filter(child => child?.type === Kbd).map(child => child.props.children);

test('Home shortcut groups may wrap instead of requiring every key and label on one line', () => {
  assert.equal(tree.props.style.display, 'flex');
  assert.equal(tree.props.style.flexWrap, 'wrap');
  assert.equal(children.length, 5, 'wrap between logical key/action groups, not between key and meaning');
  assert.ok(children.every(child => React.isValidElement(child) && child.type === 'span'));
  assert.deepEqual(children.map(keyChildren), [['1', '4'], ['T'], ['D'], ['J'], ['K']]);
  for (const child of children) {
    assert.equal(child.props.style.display, 'inline-flex');
    assert.equal(child.props.style.alignItems, 'center');
    assert.equal(child.props.style.whiteSpace, 'nowrap', 'keep each key and its meaning on the same line');
    assert.ok(child.props.style.gap <= tree.props.style.gap);
  }
});

test('all shortcut guidance remains visible semantic text without new interactive elements or clipping', () => {
  const html = renderToStaticMarkup(tree);
  for (const label of ['끝내기', '시간 잡기', '결정', '건너뛰기', '이전']) assert.ok(html.includes(label));
  assert.equal((html.match(/<kbd\b/g) || []).length, 6);
  assert.doesNotMatch(html, /overflow:hidden|display:none|<button\b|tabindex=/);
  // This checks real JSX/SSR layout inputs, not measured browser scrollWidth.
});

 test('Home hides the decision shortcut when the current record has no decision action', () => {
  const unavailable = new Function('React', 'Kbd', 'active', `${js}; return element;`)(React, Kbd, { links: [] });
  assert.doesNotMatch(renderToStaticMarkup(unavailable), />D<|결정 기록/);
});
