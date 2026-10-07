import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as concepts from '../../lib/goal-concepts.js';
import * as inputUx from '../../lib/goal-input-ux.js';
import * as client from '../../lib/goal-client.js';
import * as primitives from './hub-primitives.jsx';
import { goalSummary } from '../../lib/goal-summary.js';
import * as goalProgress from './goal-progress.jsx';
import * as goalComponents from './goal-components.jsx';

// Render the actual component declarations with real primitives. Next's router Link is
// a local anchor for these read-only tests; no read hook, browser, network or ledger runs.
async function components(path, names) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const declarations = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  const code = ts.transpileModule(declarations, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Link = ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children);
  const dependencies = { React, Link, ...primitives, ...concepts, ...inputUx, ...client, ...goalComponents, goalSummary, ...goalProgress };
  // Local declarations own their names; supply only imported dependencies.
  const declared = new Set(ast.statements.flatMap(node => ts.isFunctionDeclaration(node) ? [node.name?.text] : ts.isVariableStatement(node) ? node.declarationList.declarations.map(item => item.name.getText(ast)) : []));
  for (const name of declared) delete dependencies[name];
  return new Function(...Object.keys(dependencies), `${code}; return { ${names.join(', ')} };`)(...Object.values(dependencies));
}
const { BulletChart, KpiView, ScoreBar } = await components('./pages/goals.jsx', ['BulletChart', 'KpiView', 'ScoreBar']);
const { OkrSummaryView } = await components('./okr-summary-card.jsx', ['OkrSummaryView']);
const { WeekCells } = goalProgress;
const { GoalMetricSummary } = goalComponents;

const objective = { id: 'objective', title: '기간 목표', status: 'active', scope: 'personal', periodStart: '2026-10-01', periodEnd: '2026-10-31', timezone: 'Asia/Seoul' };
const metric = { id: 'metric', objectiveId: objective.id, name: 'Energy', role: 'guardrail', direction: 'increase', target: 20, baseline: 0, unit: '건', sourceKey: 'manual', measurement: { value: 50, coverage: 'partial', observedAt: '2026-10-05T03:00:00Z' }, progress: { state: 'partial', value: null, achieved: null } };
const model = { links: [], status: 'live', objectives: [objective], metrics: [metric], observations: [{ metricId: metric.id, value: 10, coverage: 'complete', observedAt: '2026-10-01T03:00:00Z' }], refresh() {} };
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const view = (extra = {}) => render(KpiView, { model, objectives: model.objectives, search: '', onClearSearch() {}, onAdd() {}, onRecord() {}, onOpen() {}, hrefFor: () => '/dashboard/work/goals', ...extra });

test('KPI name search renders the matching row even when the objective title does not match', () => {
  const html = view({ search: 'energy' });
  assert.match(html, /Energy/);
  assert.match(html, /50 건/);
  assert.doesNotMatch(html, /검색에 맞는 KPI가 없습니다|등록된 KPI가 없습니다/);
});

test('KPI search zero offers search clearing, while an actual empty registry offers adding a KPI', () => {
  const html = view({ search: 'nothing' });
  assert.match(html, /검색에 맞는 KPI가 없습니다/);
  assert.match(html, /검색 지우기/);
  assert.doesNotMatch(html, /등록된 KPI가 없습니다/);
  const empty = view({ model: { ...model, metrics: [] } });
  assert.match(empty, /이 조건에 등록된 KPI가 없습니다/);
  assert.doesNotMatch(empty, /검색 지우기/);
});

test('KPI read failure and truncation are never represented as an empty registry or empty search', () => {
  for (const extra of [{ failedSources: ['operating_metrics'] }, { truncatedSources: ['operating_metrics'] }, { failedSources: ['operating_objectives'] }, { truncatedSources: ['operating_objectives'] }]) {
    const html = view({ model: { ...model, ...extra }, search: 'nothing' });
    assert.match(html, /KPI 목록을 모두 확인하지 못했습니다/);
    assert.match(html, /다시 불러오기/);
    assert.doesNotMatch(html, /등록된 KPI가 없습니다|검색에 맞는 KPI가 없습니다/);
  }
});

test('latest partial 50 is the bullet current value and old complete 10 is explicitly a dated comparison', () => {
  const html = render(BulletChart, { metric, observations: model.observations });
  assert.match(html, /aria-label="Energy: 허용 20 건 이상, 이번 50 · 일부 근거 · 선 안\/밖 판단 보류, 이전 확정 10 · 2026-10-01"/);
  assert.doesNotMatch(html, /이번 10/);
  const fractional = render(BulletChart, { metric: { ...metric, measurement: { ...metric.measurement, value: 0.1234 } }, observations: [] });
  assert.match(fractional, /이번 0\.1234 · 일부 근거/);
  const unavailable = render(BulletChart, { metric: { ...metric, measurement: { coverage: 'unmeasured', value: null } }, observations: model.observations });
  assert.match(unavailable, /이번 미측정/);
  assert.doesNotMatch(unavailable, /goal-bullet__bar/);
});

test('overview score and accessible meter retain the detail floor convention; KPI has state only', () => {
  const kr = { ...metric, role: 'driver', target: 10, measurement: { value: 5, coverage: 'complete' }, progress: { value: 50, state: 'in_progress', achieved: false } };
  const detail = render(GoalMetricSummary, { metric: kr, scope: 'personal' });
  assert.match(detail, /KR 점수 0\.35 · 바닥 0\.7/);
  assert.match(detail, /바닥 달성률 50%/);
  const summary = render(OkrSummaryView, { model: { ...model, metrics: [kr] } });
  assert.match(summary, /aria-valuenow="0\.35"/);
  assert.match(summary, /바닥 0\.7 · 천장 미등록/);
  assert.match(summary, /직접 기록/);
  const kpiDetail = render(GoalMetricSummary, { metric, scope: 'personal' });
  assert.match(kpiDetail, /KPI · 일부 근거/);
  assert.doesNotMatch(kpiDetail, /KR 점수|바닥 달성률|role="progressbar"/);
  const kpiSummary = render(OkrSummaryView, { model });
  assert.match(kpiSummary, /KPI 선 밖/);
  assert.match(kpiSummary, /확인 필요 1/);
  assert.doesNotMatch(kpiSummary, /aria-valuenow=|role="progressbar"/);
});

test('partial empty summary states reading limitations instead of claiming no active goals', () => {
  const html = render(OkrSummaryView, { model: { ...model, status: 'partial', objectives: [], metrics: [] } });
  assert.match(html, /목표·지표 목록을 모두 확인하지 못했습니다/);
  assert.doesNotMatch(html, /진행 중인 목표가 없습니다/);
});


test('KR meter exposes the same decimal score as the visible number, and distinguishes missing score', () => {
  const html = render(ScoreBar, { value: 0.35, label: 'KR 점수' });
  assert.match(html, /aria-valuenow="0\.35"/);
  assert.match(html, /점수 0\.35 · 바닥 0\.7 · 천장 미등록/);
  assert.doesNotMatch(html, /aria-valuenow="35"/);
  const missing = render(ScoreBar, { value: null, label: 'KR 점수' });
  assert.match(missing, /점수 없음/);
  assert.doesNotMatch(missing, /aria-valuenow=/);
});

test('weekly accessible pace amounts match the rounded visible amounts for measured and unmeasured weeks', () => {
  const kr = { ...metric, role: 'driver', target: 12, measurement: { value: 2, coverage: 'complete' } };
  const cells = concepts.weeklyCells(kr, objective, [{ metricId: metric.id, value: 2, coverage: 'complete', observedAt: '2026-10-03T03:00:00Z' }], '2026-10-05');
  const html = render(WeekCells, { cells, unit: '건', label: '주별 관측 차이' });
  assert.match(html, /관측 차이 2건 · 기간 안 4일의 균등 페이스 몫 약 1\.5건/);
  assert.match(html, /주별 실적 미측정 · 기간 안 7일의 균등 페이스 몫 약 2\.7건/);
  assert.match(html, />2\/≈1\.5</);
  assert.match(html, />·\/≈2\.7</);
  for (const cell of cells) assert.doesNotMatch(html, new RegExp(String(cell.quota).replaceAll('.', '\\.')));
});

test('available automatic zero renders a measured zero and a read timestamp rather than no observations', () => {
  const auto = { ...metric, sourceKey: 'tasks_completed', measurement: { value: 0, coverage: 'complete', observedAt: new Date().toISOString() }, progress: { state: 'in_progress', achieved: false, value: 0 } };
  const html = view({ model: { ...model, metrics: [auto], observations: [] } });
  assert.match(html, /0 건/);
  assert.match(html, /집계 조회 · 원천 최신일 미확인/);
  assert.doesNotMatch(html, /관측 없음|>미측정</);
});
