import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./automations.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('automations.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Flows');
const code = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const syncState of ['loading', 'live', 'partial', 'error']) test(`Flows describes implementation readiness without asserting no registered automations (${syncState})`, () => {
  const visited = [];
  const dependencies = {
    React, useAutomationsLedger: () => ({ syncState, automations: [{ id: 'registered-flow', name: '정기 운영' }] }),
    SyncBadge: ({ state }) => React.createElement('span', null, state),
    Card: ({ children }) => React.createElement('div', null, children),
    Button: ({ children, onClick }) => { visited.push(onClick); return React.createElement('button', null, children); },
    EmptyState: ({ title, description, action }) => React.createElement('section', null, title, description, action),
  };
  const Component = new Function(...Object.keys(dependencies), `${code}\nreturn Flows;`)(...Object.values(dependencies));
  const paths = [];
  const html = renderToStaticMarkup(React.createElement(Component, { onNavigate: path => paths.push(path) }));
  assert.match(html, /Flow 캔버스는 준비 중입니다/);
  assert.match(html, /표시하고 편집하는 기능은 아직 연결되지 않았습니다/);
  assert.doesNotMatch(html, /등록된 Flow가 없습니다/);
  visited.forEach(activate => activate());
  assert.deepEqual(paths, ['dashboard/automations/runs', 'dashboard/automations']);
});
