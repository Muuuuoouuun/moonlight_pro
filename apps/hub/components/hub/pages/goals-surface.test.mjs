import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const goalsSource = readFileSync(new URL('./goals.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../goals.css', import.meta.url), 'utf8');
const componentsSource = readFileSync(new URL('../goal-components.jsx', import.meta.url), 'utf8');
const scorecardSource = readFileSync(new URL('../goal-scorecard.jsx', import.meta.url), 'utf8');
const scorecardSaveSource = readFileSync(new URL('../../../lib/scorecard-save.js', import.meta.url), 'utf8');
const glanceSource = readFileSync(new URL('../goal-glance.jsx', import.meta.url), 'utf8');
const weeklyMemoSource = readFileSync(new URL('../../../lib/weekly-memo-save.js', import.meta.url), 'utf8');
const tokensSource = readFileSync(new URL('../hub-tokens.css', import.meta.url), 'utf8');

test('OKR and KPI are separate views, not one mixed list', () => {
  assert.match(goalsSource, /function GlanceView/);
  assert.match(goalsSource, /function KpiView/);
  assert.match(goalsSource, /\{ key: 'okr', label: '한눈에' \}/);
  assert.match(goalsSource, /\{ key: 'kpi', label: 'KPI' \}/);
  assert.match(goalsSource, /\{ key: 'check', label: '체크인' \}/);
  assert.match(goalsSource, /\{ key: 'weekly', label: '주간 실측' \}/);
  // 옛 3열 매트릭스·펄스 스트립은 이 분리가 대체했다.
  assert.doesNotMatch(goalsSource, /GoalMatrixView|GoalPulseStrip|3열 매트릭스/);
  assert.doesNotMatch(cssSource, /goal-matrix|goal-bento|goal-signal/);
});

test('glance view (A안): KPI strip on top, objective blocks beside this week\'s attention and memo', () => {
  assert.match(goalsSource, /function GoalObjectiveCard/);
  assert.match(goalsSource, /function objectiveReading/);
  assert.match(goalsSource, /splitObjectiveMetrics\(model\.metrics, objective\.id\)/);
  assert.match(goalsSource, /objectiveScore\(keyResults\)/);
  assert.match(goalsSource, /objectivePaceState\(score, period\)/);
  assert.match(goalsSource, /<KpiStrip rows=\{kpiRows\}/);
  assert.match(goalsSource, /<GlanceAttention items=\{attentionItems\(readings, kpiRows\)\}/);
  assert.match(goalsSource, /<WeeklyMemo /);
  assert.match(goalsSource, /KPI 자세히 →|kpiHref=\{kpiHref\}/);
  assert.match(glanceSource, /KPI 자세히 →/);
  assert.match(goalsSource, /data-record-metric=\{metric\.id\}/);
  assert.match(goalsSource, /data-goal-id=\{objective\.id\}/);
  assert.match(cssSource, /\.goal-kr-row\s*\{/);
  assert.match(cssSource, /\.goal-glance\s*\{/);
  // 이번 주 메모는 learning 메모 + 개인 목표 연결. 마이그레이션 없음.
  assert.match(weeklyMemoSource, /noteMeta: \{ kind: 'learning'/);
  assert.match(weeklyMemoSource, /action: 'link_entity'/);
  assert.match(weeklyMemoSource, /entityId: state\.requests\.journal\.entryId/);
});

test('glance gauges: progress-to-floor bar, elapsed marker, pace tone always with glyph + label', () => {
  assert.match(glanceSource, /export function GaugeBar/);
  assert.match(glanceSource, /role="meter"/);
  assert.match(goalsSource, /keyResultProgress\(metric\)/);
  assert.match(goalsSource, /keyResultTone\(metric, pace, period\)/);
  // 페이스 색은 전용 토큰(--okr-*)뿐이고 두 테마에 모두 있다.
  for (const token of ['--okr-ahead', '--okr-on', '--okr-late', '--okr-wait', '--okr-track', '--okr-marker']) {
    assert.equal(tokensSource.split(`${token}:`).length - 1, 2, `${token} must be defined for both themes`);
  }
  assert.match(cssSource, /\.goal-pill--late\s*\{[^}]*--okr-late/);
  assert.match(cssSource, /\.goal-kpi-tile--outside\s*\{\s*box-shadow:inset 1px 0 0 var\(--danger\)/);
  assert.doesNotMatch(cssSource, /--okr-[a-z-]+:\s/);
});

test('KPI rows show line, trend, staleness and inside/outside — never a score', () => {
  assert.match(goalsSource, /kpiThresholdLabel\(metric\)/);
  assert.match(goalsSource, /kpiBulletReading\(metric, observations\)/);
  assert.match(goalsSource, /metricFreshnessLabel\(metric, today, objective\.timezone\)/);
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
  assert.match(goalsSource, /paceSuggestion\(paceRows\)/);
  assert.match(goalsSource, /objectiveSuggestion\(item\.reading\.keyResults/);
  // 늦음은 글로만 말한다 — 색·경고 톤 없음.
  assert.doesNotMatch(cssSource, /goal-kr-row__pace[^}]*(danger|warning)/);
});

test('check-in score track marks the 0.7 floor; the objective still reports score vs floor pace', () => {
  assert.match(goalsSource, /goal-score-bar__floor/);
  assert.match(goalsSource, /floorPaceScore\(period\)/);
  assert.match(goalsSource, /천장 미등록/);
  assert.match(cssSource, /\.goal-score-bar__floor\s*\{[^}]*left:70%/);
});

test('mockup ①: milestone line stays on the objective block; zero-keeps moved to the KPI strip', () => {
  assert.match(goalsSource, /milestoneSummary\(model\.links\.filter/);
  assert.match(glanceSource, /zeroKeepWeeks\(metric, objective, observations, today\)/);
  assert.match(cssSource, /\.goal-kpi-tile__week--now\s*\{[^}]*var\(--accent\)/);
  // 늦은 마일스톤만 빨강 — 늦은 KR은 글로만.
  assert.match(cssSource, /\.goal-milestone__late\s*\{[^}]*--danger/);
});

test('mockup ③: KPI rows split by line shape into bullet charts and zero-keep weeks', () => {
  assert.match(goalsSource, /function BulletChart/);
  assert.match(goalsSource, /function ZeroKeepCells/);
  assert.match(goalsSource, /title: '지킬 범위'/);
  assert.match(goalsSource, /title: '0 유지'/);
  assert.doesNotMatch(goalsSource, /Sparkline/);
  assert.match(cssSource, /\.goal-bullet__band\s*\{/);
});

test('mockup ④: an ended active objective flips into the scorecard in place', () => {
  assert.match(goalsSource, /period\.phase === 'ended' && objective\.status === 'active'\) return <li><GoalScorecard/);
  assert.match(scorecardSource, /objectiveVerdict\(keyResults\)/);
  assert.match(scorecardSource, /createScorecardSaver/);
  assert.match(scorecardSaveSource, /noteMeta: \{ kind: 'decision'/);
  assert.match(scorecardSaveSource, /action: step === 'link' \? 'link_entity' : 'update_objective'/);
  assert.match(scorecardSaveSource, /id: objective.id, status: 'archived'/);
  assert.match(scorecardSource, /export function GoalContinueDrawer/);
  assert.match(scorecardSource, /command\('create_metric'/);
  // 판정 칸은 색이 아니라 현재 위치 테두리로.
  assert.match(cssSource, /\.goal-verdict__cell--on\s*\{\s*border-color:var\(--accent\)/);
  assert.doesNotMatch(scorecardSource, /tone="(success|warning|danger)"/);
});
