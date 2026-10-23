import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { Card } from './hub-primitives.jsx';

const render = props => renderToStaticMarkup(React.createElement(Card, props, '합성 카드'));
function cardStyles(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const styles = [];
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'Card') {
      const attr = node.attributes.properties.find(attr => attr.name?.getText(ast) === 'style');
      if (attr?.initializer && ts.isJsxExpression(attr.initializer)) styles.push(attr.initializer.expression.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return styles;
}

test('an omitted or conditionally undefined Card shadow keeps the shared panel token', () => {
  for (const style of [undefined, {}, { padding: 12, boxShadow: undefined }]) assert.match(render({ style }), /box-shadow:var\(--shadow-card\)/);
});

test('explicit none, null and custom Card shadows remain caller-owned', () => {
  assert.match(render({ style: { boxShadow: 'none' } }), /box-shadow:none/);
  assert.doesNotMatch(render({ style: { boxShadow: null } }), /box-shadow/);
  assert.match(render({ style: { boxShadow: 'var(--shadow-pop)' } }), /box-shadow:var\(--shadow-pop\)/);
});

test('only the three demonstrated Card semantic rails compose with shared panel depth', () => {
  const automationStyles = cardStyles('./pages/automations.jsx').filter(code => code.includes('boxShadow'));
  assert.equal(automationStyles.length, 2);
  for (const code of automationStyles) for (const failures of [0, 1]) {
    const style = new Function('failuresTodayCount', 'failureRuns', `return (${code});`)(failures, Array(failures));
    const html = render({ style });
    assert.match(html, /box-shadow:[^;]*var\(--shadow-card\)/);
    if (failures) assert.match(html, /inset 1px 0 0 var\(--danger-line\), var\(--shadow-card\)/);
    else assert.doesNotMatch(html, /inset 1px/);
  }
  const overdueStyles = cardStyles('./pages/my-work.jsx').filter(code => code.includes('boxShadow'));
  assert.equal(overdueStyles.length, 1);
  const style = new Function(`return (${overdueStyles[0]});`)();
  assert.match(render({ style }), /inset 1px 0 0 var\(--danger\), var\(--shadow-card\)/);
});

test('the actual login Card style retains exactly its baseline SSR chrome, without mounting auth', () => {
  const styles = cardStyles('../../app/login/page.jsx');
  assert.equal(styles.length, 1);
  const style = new Function(`return (${styles[0]});`)();
  assert.equal(render({ style }), '<div style="background:var(--surface);border:1px solid var(--panel-edge);border-radius:var(--r-lg);box-shadow:var(--shadow-card);padding:24px;width:min(380px, 100%);max-width:100%;min-width:0;box-sizing:border-box">합성 카드</div>');
  // 로그인은 depth C 표지를 그리지 않으므로 기본 토큰 그대로 1px --line-soft 선이다.
  assert.match(readFileSync(new URL('./hub-tokens.css', import.meta.url), 'utf8'), /--panel-edge: var\(--line-soft\);/);
  const login = readFileSync(new URL('../../app/login/page.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(login, /data-visual-system|hub-depth/);
});
