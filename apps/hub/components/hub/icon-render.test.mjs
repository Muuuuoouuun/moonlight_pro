import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { Iconed } from './hub-icons.jsx';
import { IconButton, EmptyState, LifecycleBadge, TruthBadge } from './hub-primitives.jsx';

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const source = readFileSync(new URL('./pages/daily-brief.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('daily-brief.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const calls = [];
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'IconButton') calls.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'FocusSlots'));
const focus = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'guruFocusOf');
const transpile = code => ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const guruFocusOf = new Function(`${transpile(focus.getText(ast))}; return guruFocusOf;`)();

test('Iconed forwards the existing decorative semantics and styling hooks to SVG', () => {
  const html = render(Iconed, { name: 'chevronR', size: 13, className: 'daily-brief__row-arrow', 'aria-hidden': 'true' });
  assert.match(html, /<svg[^>]*width="13"[^>]*height="13"/);
  assert.match(html, /class="daily-brief__row-arrow"/);
  assert.match(html, /aria-hidden="true"/);
  for (const Component of [LifecycleBadge, TruthBadge]) assert.match(render(Component, { state: 'error' }), /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(render(Iconed, { name: 'chevronR' }), /aria-hidden|class=/, 'unrequested props do not alter other surfaces');
});

test('formerly missing semantic glyphs render; task wording aliases the established checklist', () => {
  for (const name of ['alert', 'shield', 'key', 'arrowUpRight', 'bolt', 'tasks']) {
    const html = render(Iconed, { name });
    assert.match(html, /<svg[^>]*viewBox="0 0 24 24"[^>]*stroke="currentColor"/);
    assert.match(html, /<path/);
    assert.match(render(EmptyState, { icon: name, title: '합성 상태' }), /<svg/);
  }
  assert.equal(render(Iconed, { name: 'tasks' }), render(Iconed, { name: 'checklist' }));
  assert.equal(render(Iconed, { name: 'unregistered-synthetic' }), '');
});

test('actual Daily Brief icon-only controls render names and numeric dimensions, preserving their callbacks', () => {
  assert.equal(calls.length, 3);
  const item = { id: 'synthetic-lead', name: '합성 고객', company: '합성 거래처', companyId: 'synthetic-company', kind: 'lead', type: 'company', workspace: 'classin', nextAction: '연락', reason: '합성 약속', dueLabel: '오늘', lastTouch: '어제' };
  let stopped = 0;
  const coach = [], records = [];
  const dependencies = { React, IconButton, item, ka: { item }, i: 0, guruFocusOf, setGuruFocusItem: value => coach.push(value), onRecord: value => records.push(value) };
  const elements = calls.map(call => new Function(...Object.keys(dependencies), `${transpile(`const element = (${call});`)}; return element;`)(...Object.values(dependencies)));
  for (const [index, element] of elements.entries()) {
    const html = renderToStaticMarkup(element);
    const label = index === 1 ? '연락 기록 남기기' : 'Guru 세일즈 코칭';
    assert.match(html, new RegExp(`aria-label="${label}"`));
    assert.match(html, new RegExp(`title="${label}"`));
    assert.match(html, /width:28px;height:28px/);
    assert.doesNotMatch(html, /width:sm|height:sm| label=/);
    element.props.onClick({ stopPropagation() { stopped++; } });
  }
  assert.equal(stopped, 3, 'nested actions must not trigger row navigation');
  assert.deepEqual(records, [{ kind: 'lead', id: item.id, name: item.name, companyId: item.companyId }]);
  assert.deepEqual(coach.map(value => [value.id, value.kind, value.dealId, value.stage]), [[item.id, 'lead', null, '긴급 KA'], [item.id, 'lead', null, '집중 고객']]);
  const css = readFileSync(new URL('./hub-tokens.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 720px\)[\s\S]*?\.hub-iconbtn[\s\S]*?min-width:\s*44px/);
  // SSR dimensions and CSS target floor are verified, not measured browser hit boxes.
});
