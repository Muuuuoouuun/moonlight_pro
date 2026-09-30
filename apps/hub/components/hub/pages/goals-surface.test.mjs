import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const goalsSource = readFileSync(new URL('./goals.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../goals.css', import.meta.url), 'utf8');
const componentsSource = readFileSync(new URL('../goal-components.jsx', import.meta.url), 'utf8');

test('OKR and KPI are separate views, not one mixed list', () => {
  assert.match(goalsSource, /function OkrView/);
  assert.match(goalsSource, /function KpiView/);
  assert.match(goalsSource, /\{ key: 'okr', label: 'OKR' \}/);
  assert.match(goalsSource, /\{ key: 'kpi', label: 'KPI' \}/);
  assert.match(goalsSource, /\{ key: 'check', label: '체크인' \}/);
  assert.match(goalsSource, /\{ key: 'weekly', label: '주간 실측' \}/);
  // 옛 3열 매트릭스·펄스 스트립은 이 분리가 대체했다.
  assert.doesNotMatch(goalsSource, /GoalMatrixView|GoalPulseStrip|3열 매트릭스/);
  assert.doesNotMatch(cssSource, /goal-matrix|goal-bento|goal-signal/);
});

test('an objective card reads as Objective → KR groups → score, and points at the KPI view', () => {
  assert.match(goalsSource, /function GoalObjectiveCard/);
  assert.match(goalsSource, /Objective · 목표/);
  assert.match(goalsSource, /splitObjectiveMetrics\(model\.metrics, objective\.id\)/);
  assert.match(goalsSource, /objectiveScore\(keyResults\)/);
  assert.match(goalsSource, /objectivePace\(score, period\)/);
  assert.match(goalsSource, /KPI 보기 →/);
  assert.match(goalsSource, /data-record-metric=\{metric\.id\}/);
  assert.match(goalsSource, /data-goal-id=\{objective\.id\}/);
  assert.match(cssSource, /\.goal-kr-row\s*\{/);
  assert.match(cssSource, /\.goal-objective__score\s*\{/);
});

test('KPI rows show line, trend, staleness and inside/outside — never a score', () => {
  assert.match(goalsSource, /kpiThresholdLabel\(metric\)/);
  assert.match(goalsSource, /kpiTrend\(observations\)/);
  assert.match(goalsSource, /daysSinceObservation\(observations, today\)/);
  assert.match(goalsSource, /sortKpis\(/);
  assert.match(goalsSource, /OUTSIDE_RAIL_BUDGET/);
  assert.match(cssSource, /\.goal-kpi-row--outside\s*\{\s*box-shadow:inset 1px 0 0 var\(--danger\)/);
  const kpiView = goalsSource.slice(goalsSource.indexOf('function KpiView'), goalsSource.indexOf('function GoalCheckList'));
  assert.doesNotMatch(kpiView, /keyResultScore|ScoreBar|formatScore/);
});

test('KPI can be added from its own view with the guardrail role preselected', () => {
  assert.match(goalsSource, /function KpiAddDrawer/);
  assert.match(goalsSource, /defaultRole="guardrail"/);
  assert.match(componentsSource, /defaultRole = 'outcome'/);
  assert.match(componentsSource, /KPI · 계속 지킬 선/);
});

test('state is carried by glyph + label, not by success/warning color', () => {
  assert.match(goalsSource, /KPI_GLYPH = \{ inside: '✓', outside: '▲', partial: '◐', unmeasured: '○', unset: '○' \}/);
  assert.doesNotMatch(goalsSource, /tone="success"|tone="warning"|tone: 'success'|tone=\{isAchieved/);
  assert.doesNotMatch(goalsSource, /<Progress |<ProgressRing|<Dot /);
  assert.doesNotMatch(cssSource, /var\(--(success|warning|info)/);
  assert.doesNotMatch(cssSource, /border(-left|-top|-right|-bottom)?:\s*[2-9]px/);
});

test('direct metric creation modal is wired from objective cards as KR', () => {
  assert.match(goalsSource, /const \[metricModalObjective, setMetricModalObjective\] = React\.useState\(null\)/);
  assert.match(goalsSource, /onAddMetric=\{obj => setMetricModalObjective\(obj\)\}/);
  assert.match(goalsSource, /<Drawer title="KR 추가"/);
  assert.match(goalsSource, /<GoalMetricForm/);
});

test('keyboard shortcut N creates objective and dialog presence suppresses it', () => {
  assert.match(goalsSource, /event\.key\.toLowerCase\(\) !== 'n'/);
  assert.match(goalsSource, /document\.querySelector\('\[role="dialog"\]'\)/);
  assert.match(goalsSource, /목표 만들기 <Kbd>N<\/Kbd>/);
});

test('check-in view keeps one-click record for both KRs and KPIs', () => {
  assert.match(goalsSource, /function GoalCheckList/);
  assert.match(goalsSource, /<ul className="goal-check-list"/);
  assert.match(goalsSource, /isHealthIndicator\(metric\)/);
  assert.match(cssSource, /\.goal-check-row\s*\{/);
});

test('a KR row splits the period target into a weekly pace line without storing anything', () => {
  assert.match(goalsSource, /keyResultPace\(metric, objective,/);
  assert.match(goalsSource, /goal-kr-row__pace/);
  assert.match(goalsSource, /paceSuggestion\(paceRows\) \|\| objectiveSuggestion/);
  // 늦음은 글로만 말한다 — 색·경고 톤 없음.
  assert.doesNotMatch(cssSource, /goal-kr-row__pace[^}]*(danger|warning)/);
});
