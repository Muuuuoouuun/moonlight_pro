import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';

const source = readFileSync(new URL('./automations.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('automations.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const functionSource = name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast).replace(/^export /, '');
const componentCode = ts.transpileModule(['emailStatusBadge', 'EmailAutomation'].map(functionSource).join('\n'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
function render(gmail) {
  const paths = [], oauth = [];
  const dependencies = {
    React,
    useEmailIntegrationStatus: url => url.includes('/gmail/') ? gmail : { status: 'connected', configured: true },
    window: { location: { assign: path => oauth.push(path) } },
  };
  for (const name of ['InquiryConnection', 'Button', 'Card', 'Iconed', 'Badge', 'SectionTitle', 'IconButton']) dependencies[name] = name;
  const Component = new Function(...Object.keys(dependencies), `${componentCode}\nreturn EmailAutomation;`)(...Object.values(dependencies));
  const tree = Component({ onNavigate: path => paths.push(path) });
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement(node)) return [];
    return [node, ...nodes(node.props.children), ...nodes(node.props.right)];
  }
  const button = label => {
    const found = nodes(tree).find(node => node.type === 'Button' && node.props.children === label);
    assert.ok(found, label); return found;
  };
  return { paths, oauth, button, nodes: nodes(tree) };
}

test('Email navigation names its real destinations and does not offer unwired rule editing', () => {
  const app = render({ status: 'missing-config' });
  app.button('새 원고 열기').props.onClick();
  app.button('실행 로그 보기').props.onClick();
  app.button('문의 내역 열기 →').props.onClick();
  assert.deepEqual(app.paths, ['dashboard/content/studio?new=draft', 'dashboard/automations/runs', 'dashboard/revenue/inquiries']);
  const rules = app.nodes.filter(node => node.type === 'IconButton' && node.props.tooltip === '규칙 편집은 아직 연결되지 않았습니다');
  assert.equal(rules.length, 4);
  assert.ok(rules.every(node => node.props.disabled && !node.props.onClick));
});

for (const status of ['loading', 'missing-config', 'degraded', 'disabled']) test(`Gmail ${status} state does not offer a connect loop without an actual OAuth URL`, () => {
  const app = render({ status, configured: false });
  assert.equal(app.button('Gmail 연결').props.disabled, true);
  assert.match(app.button('Gmail 연결').props.title, /연결 설정을 확인/);
});

test('a configured Gmail connection opens the existing OAuth route with the Email return destination', () => {
  const app = render({ status: 'ready', setup: { connectUrl: 'https://accounts.google.com/o/oauth2/v2/auth' } });
  const connect = app.button('Gmail 연결');
  assert.equal(connect.props.disabled, false);
  connect.props.onClick();
  assert.deepEqual(app.oauth, ['/api/email/gmail/connect?returnPath=%2Fdashboard%2Fautomations%2Femail']);
});

for (const reply of [
  { ok: false, json: async () => ({}) },
  { ok: true, json: async () => ({ status: 'error' }) },
  { ok: true, json: async () => ({ source: 'error' }) },
]) test('status read failure remains unknown rather than claiming missing configuration', async () => {
  let state;
  const effects = [];
  const useStatus = new Function('React', 'fetch', `const EMPTY_EMAIL_STATUS={status:'loading',configured:false};${functionSource('useEmailIntegrationStatus')}\nreturn useEmailIntegrationStatus;`)(
    { useState: initial => [initial, value => { state = value; }], useEffect: effect => effects.push(effect) },
    async () => reply,
  );
  useStatus('/api/email/gmail/status'); effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state, { status: 'degraded', configured: false });
});
