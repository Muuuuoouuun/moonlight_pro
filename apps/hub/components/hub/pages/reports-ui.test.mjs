import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as model from './reports-model.js';
const source = await readFile(new URL('./reports.jsx', import.meta.url), 'utf8').catch(() => '');
const ast = ts.createSourceFile('reports.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function component(name, extra = {}) {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `${name} must render source honesty or report detail`);
  const code = ts.transpileModule(node.getText(ast).replace(/^export /, ''), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const box = ({ children }) => React.createElement('div', null, children);
  const deps = { React, ...model, Card: box, Button: ({ children, onClick, ...props }) => React.createElement('button', props, children), TruthBadge: ({ state, label }) => React.createElement('span', { 'data-state': state }, label || state),
    CertaintyBadge: ({ state, label }) => React.createElement('span', { 'data-certainty': state }, label || state), EmptyState: ({ title, description, action }) => React.createElement('div', null, title, description, action),
    Skeleton: ({ label }) => React.createElement('div', { role: 'status' }, label), OfficeWorkflowPanel: ({ scope, originRef }) => React.createElement('div', { 'data-office-scope': scope }, JSON.stringify(originRef)), ...extra };
  return new Function(...Object.keys(deps), `${code}; return ${name};`)(...Object.values(deps));
}
test('report loading uses Skeleton and read errors offer retry rather than a live-empty claim', () => {
  const Notice = component('ReportsReadNotice');
  const loading = renderToStaticMarkup(React.createElement(Notice, { state: { status: 'loading' }, onRetry() {} }));
  assert.match(loading, /role="status"/); assert.match(loading, /불러오는 중/);
  const error = renderToStaticMarkup(React.createElement(Notice, { state: { status: 'error' }, onRetry() {} }));
  assert.match(error, /불러오지 못/); assert.match(error, /다시 불러오기/); assert.doesNotMatch(error, /보고서가 없/);
  const partial = renderToStaticMarkup(React.createElement(Notice, { state: { status: 'partial', failedSources: ['office'] }, onRetry() {} }));
  assert.match(partial, /data-state="partial"/); assert.match(partial, /office/);
});
test('saved weekly detail keeps facts AI interpretation and operator judgment separate and Office uses exact scope and period', () => {
  const Facts = component('ReportFacts');
  const Detail = component('ReportDetail', { ReportFacts: Facts });
  const html = renderToStaticMarkup(React.createElement(Detail, { report: { id: 'stored:one', kind: 'weekly', scope: 'company', title: '회사 주간', status: 'live', periodStart: '2026-09-24', periodEnd: '2026-09-30', facts: { stats: { contacts: 0, newDeals: null } }, interpretation: 'AI 해석 본문', decision: '운영자 판단 본문', sourceRefs: [], revision: 1 }, onDecision() {}, onBack() {} }));
  assert.match(html, /사실/); assert.match(html, /AI 해석 본문/); assert.match(html, /운영자 판단 본문/); assert.match(html, /미측정/);
  assert.match(html, /data-office-scope="classin"/); assert.match(html, /2026-09-24/); assert.match(html, /2026-09-30/);
});
test('research and Office projections link to their existing surface without an unsafe stored-decision action', () => {
  const Detail = component('ReportDetail', { ReportFacts: component('ReportFacts') });
  const html = renderToStaticMarkup(React.createElement(Detail, { report: { id: 'research:one', kind: 'research', scope: 'content', title: '연구', facts: { facts: ['원문 사실'] }, sourceRefs: [], actions: [{ href: '/dashboard/content/research?brief=one', label: '리서치함 열기' }] }, onBack() {} }));
  assert.match(html, /원문 사실/); assert.match(html, /리서치함 열기/); assert.doesNotMatch(html, /판단 기록/);
});

test('AI research stays unreviewed and shows quoted evidence and application conditions separately', () => {
  const Detail = component('ReportDetail', { ReportFacts: component('ReportFacts') });
  const html = renderToStaticMarkup(React.createElement(Detail, { report: { id: 'research:one', kind: 'research', scope: 'content', title: '검토 원고', status: 'live', facts: { facts: ['기관 발표 사실'], verificationLevel: 'unreviewed', factEvidence: [{ text: '기관 발표 사실', quote: 'Original source sentence.', locator: 'L4–L6', sourceId: 'one' }], conditions: '지역과 제공 상태 확인 필요' }, sourceRefs: [], actions: [] }, onBack() {} }));
  assert.match(html, /운영자 검토 전/); assert.match(html, /Original source sentence\./); assert.match(html, /L4–L6/);
  assert.match(html, /적용 조건/); assert.match(html, /지역과 제공 상태 확인 필요/);
  assert.doesNotMatch(html, /data-certainty="confirmed"/);
});
