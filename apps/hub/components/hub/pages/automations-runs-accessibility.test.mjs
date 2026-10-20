import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./automations.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('automations.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let mapCallback;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'displayRows.map') mapCallback = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(mapCallback, 'exercise the actual Runs row callback, without mounting its data hook');
const js = ts.transpileModule(`const renderRow = ${mapCallback.getText(ast)};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const Iconed = ({ name }) => React.createElement('svg', { 'data-icon': name, 'aria-hidden': true });
const Button = ({ children, onClick }) => React.createElement('button', { type: 'button', onClick }, children);
const run = { id: 'synthetic/run :1', at: '10:00', dateLabel: '합성 날짜', status: 'err', flow: '합성 흐름', detail: '합성 실패 설명', ms: 15, executionMode: 'active' };
function fixture(rows = [run]) {
  let selectedRunId = null;
  const setSelectedRunId = value => { selectedRunId = typeof value === 'function' ? value(selectedRunId) : value; };
  const navigations = [];
  const render = (row = rows[0], index = 0) => {
    const deps = { React, selectedRunId, setSelectedRunId, displayRows: rows, Iconed, Button, copiedId: null, setCopiedId() {}, onNavigate: route => navigations.push(route), sIcon: { err: { c: 'var(--danger)', t: '실패' }, ok: { c: 'var(--fg)', t: '완료' } } };
    return new Function(...Object.keys(deps), `${js}; return renderRow;`)(...Object.values(deps))(row, index);
  };
  return { render, navigations, selected: () => selectedRunId };
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
const trigger = tree => nodes(tree).find(n => n.type === 'button');
const interactive = node => ['button', 'a', 'input', 'select', 'textarea'].includes(node.type) || node.type === Button || node.props?.role === 'button';

test('Runs uses a native non-submit button with no nested controls or duplicate keyboard handler', () => {
  const app = fixture();
  const row = trigger(app.render());
  assert.ok(row, 'native button supplies Enter and Space activation rather than a click-only div');
  assert.equal(row.props.type, 'button');
  assert.equal(row.props.onKeyDown, undefined, 'native keyboard activation must not double-toggle');
  assert.equal(row.props.className, 'hub-row');
  assert.equal(row.props.style.width, '100%');
  assert.equal(row.props.style.font, 'inherit');
  assert.equal(row.props.style.textAlign, 'left');
  assert.equal(row.props.onMouseEnter, undefined);
  assert.equal(row.props.onMouseLeave, undefined);
  assert.equal(nodes(row.props.children).filter(interactive).length, 0);
  const markup = renderToStaticMarkup(app.render());
  for (const value of ['합성 날짜', '합성 흐름', '합성 실패 설명', '15ms', '실패']) assert.ok(markup.includes(value));
});

test('click activation opens/closes the correct details and aria-controls only names a rendered target', () => {
  const second = { ...run, id: 'synthetic/run :2', status: 'ok' };
  const app = fixture([run, second]);
  let row = trigger(app.render());
  assert.equal(row.props['aria-expanded'], false);
  assert.equal(row.props['aria-controls'], undefined);
  row.props.onClick();
  assert.equal(app.selected(), run.id);
  let tree = app.render(); row = trigger(tree);
  assert.equal(row.props['aria-expanded'], true);
  const target = row.props['aria-controls'];
  assert.equal(target, `hub-run-detail-${encodeURIComponent(run.id)}`);
  assert.equal(nodes(tree).filter(n => n.props?.id === target).length, 1);
  assert.match(renderToStaticMarkup(tree), /상세 내용:/);
  row.props.onClick();
  assert.equal(app.selected(), null);
  assert.equal(nodes(app.render()).some(n => n.props?.id === target), false);
  // A callback can be invoked twice before a React render; functional state must toggle twice.
  row.props.onClick(); row.props.onClick();
  assert.equal(app.selected(), null);
  trigger(app.render(second, 1)).props.onClick();
  assert.equal(app.selected(), second.id);
  assert.notEqual(trigger(app.render(second, 1)).props['aria-controls'], target);
});

test('expanded detail actions stay outside the trigger, with unchanged navigation and shared focus/touch rules', () => {
  const app = fixture(); trigger(app.render()).props.onClick();
  const tree = app.render();
  const row = trigger(tree);
  assert.equal(nodes(row.props.children).filter(interactive).length, 0);
  const actions = nodes(tree).filter(n => n.type === Button);
  assert.equal(actions.length, 2, 'copy and endpoint check remain separate sibling actions');
  let stopped = 0;
  actions.find(n => n.props.children === 'Webhooks 엔드포인트 점검').props.onClick({ stopPropagation() { stopped++; } });
  assert.deepEqual(app.navigations, ['dashboard/automations/webhooks']);
  assert.equal(stopped, 1);
  assert.equal(app.selected(), run.id, 'detail action does not close the row');
  const css = readFileSync(new URL('../hub-tokens.css', import.meta.url), 'utf8');
  assert.match(css, /\.hub-app \.hub-row:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--moon-300\)/);
  assert.match(css, /\.hub-app button,\s*\.hub-app \[role="button"\]\s*\{\s*min-height:\s*44px !important/);
  // Source/SSR native semantics and callbacks only: no browser key-event or pixel claim.
});
