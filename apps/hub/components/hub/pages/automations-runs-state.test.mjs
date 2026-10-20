import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = readFileSync(new URL('./automations.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('automations.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const code = ts.transpileModule(['isHeartbeatRun', 'Runs'].map(name => {
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, name); return node.getText(ast).replace(/^export /, '');
}).join('\n'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;

// Execute the real Runs JSX against explicit read states. Ledger I/O and display
// primitives are replaced; this proves rendering, not browser/network lifecycle.
function render(syncState, runs = [], filter = 'errors') {
  const dependencies = {
    React: { ...React, useState: value => [value === 'events' ? filter : value, () => {}] },
    useAutomationsLedger: () => ({ runs, summary: {}, syncState, reload() {} }),
  };
  for (const name of ['Iconed','Dot','Card','IconButton','Button','SectionTitle','Badge','SyncBadge','LifecycleBadge']) {
    dependencies[name] = ({ children }) => React.createElement('div', null, children);
  }
  dependencies.EmptyState = ({ title, description, action }) => React.createElement('section', null, title, description, action);
  dependencies.Skeleton = ({ label }) => React.createElement('div', { role: 'status' }, label);
  const Runs = new Function(...Object.keys(dependencies), code + '\nreturn Runs;')(...Object.values(dependencies));
  return renderToStaticMarkup(Runs({ onNavigate() {} }));
}
for (const [status, expected] of [
  ['loading', /실행 로그 읽는 중/],
  ['error', /실행 로그를 읽지 못했습니다/],
  ['partial', /일부 실행 로그만 확인/],
  ['preview', /실행 로그 연결이 필요/],
]) test('empty errors filter preserves ' + status + ' read state', () => {
  const html = render(status);
  assert.match(html, expected);
  assert.doesNotMatch(html, /모든 자동화.*정상|발생한 실행 오류가 없습니다|조회한 실행 기록에 오류가 없습니다/);
});
test('complete empty read describes only the observed errors, not global health', () => {
  const html = render('live');
  assert.match(html, /조회한 실행 기록에 오류가 없습니다/);
  assert.doesNotMatch(html, /모든 자동화.*정상/);
});
test('error read cannot promote a cached heartbeat to current health', () => {
  const html = render('error', [{ id:'heartbeat',flow:'System',detail:'Engine is alive',status:'ok',ms:1 }], 'events');
  assert.match(html, /실행 로그를 읽지 못했습니다/);
  assert.doesNotMatch(html, /엔진 헬스체크는 정상 작동 중/);
});
test('actual failure rows remain visible', () => {
  const html = render('live', [{ id:'audit-failure',flow:'Audit event',detail:'Synthetic failure reason',status:'err',statusKey:'failure',ms:1 }]);
  assert.match(html, /Synthetic failure reason/);
  assert.doesNotMatch(html, /조회한 실행 기록에 오류가 없습니다/);
});

