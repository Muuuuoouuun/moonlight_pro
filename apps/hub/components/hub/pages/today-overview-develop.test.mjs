import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPeriodComparison } from './overview-truth.js';

// 2026-10-19 운영자 선택안 — 오늘 7a · 홈 7g · 현황 7e/7f(docs/design-studies/2026-10-18-today-overview-develop).
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const today = read('./daily-brief.jsx');
const overview = read('./overview.jsx');
const home = read('./home.jsx');
const tokens = read('../hub-tokens.css');
const overviewCss = read('./overview-activity.css');

test('Today 7a: Futura header, three-column board, approvals on the board, metrics as one line', () => {
  assert.match(today, /className="hub-futura hub-page daily-brief"/);
  assert.match(today, /<h2 className="fx-page-title">오늘의 실행<\/h2>/);
  assert.doesNotMatch(today, /clamp\(26px, 3\.2vw, 32px\)/, 'the old hero scale is replaced by the Futura title');
  const board = today.slice(today.indexOf('className="daily-brief__board"'), today.indexOf('className="daily-brief__metric-line"'));
  assert.match(board, /<TaskToday\b[\s\S]*<FocusSlots\b/);
  assert.equal((board.match(/<ApprovalQueueCard\b/g) || []).length, 2, 'approvals sit beside the agenda whether or not focus data arrived');
  assert.doesNotMatch(today.slice(today.indexOf('<MoreDetail')), /<ApprovalQueueCard\b/, 'approvals leave the collapsed drawer');
  assert.match(today, /<MetricCard key=\{m\.label\} m=\{m\} onNavigate=\{onNavigate\} inline \/>/);
  assert.doesNotMatch(today, /hub-grid--metrics/);
  assert.match(tokens, /\.hub-app \.daily-brief__board\s*\{[^}]*grid-template-columns:\s*minmax\(280px, 0\.95fr\) minmax\(0, 2fr\)/);
  assert.match(tokens, /@media \(max-width: 1200px\)\s*\{\s*\.hub-app \.daily-brief__board \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test('Home 7g: open remaining list beside the card, then the mentor line, then the timetable', () => {
  assert.match(home, /className="home-triage" data-split=/);
  assert.match(home, /<RemainingList[^>]*layout="side"/);
  assert.match(home, /<FocusCard\b[\s\S]*?<GuidanceInlineTip\s+variant="home"\s+context=\{[\s\S]*?<TodaySchedule\b[\s\S]*?className="home-after"/);
  assert.doesNotMatch(home, /className="ci-rail"/);
});

test('Overview 7e/7f: Futura header, fact/interpretation/judgement band before OKR, tile headlines, no bottom KPI row', () => {
  assert.match(overview, /className="hub-futura hub-page overview-page"/);
  assert.match(overview, /<h2 className="fx-page-title">현황<\/h2>/);
  const readout = overview.indexOf('<OverviewReadout ');
  assert.ok(readout > 0 && readout < overview.indexOf('<OkrSummaryCard />'));
  for (const label of ['label="사실"', 'label="해석"', 'label="판단 · 미정"']) assert.ok(overview.includes(label), label);
  assert.match(overview, /new: 'decision', title: `최근 \$\{days\}일 운영 판단 · `/, 'judgement opens the existing decision journal instead of a new write path');
  for (const panel of ['projects', 'content', 'revenue', 'automations']) {
    assert.match(overview, new RegExp(`<PanelCard panel="${panel}"[^>]*headline=\\{headlines\\.${panel}\\}`));
  }
  assert.doesNotMatch(overview, /<KpiCard|function KpiCard/);
  assert.match(overviewCss, /\.overview-tile__status\[data-danger="true"\] \{ color: var\(--danger\); \}/);
  assert.doesNotMatch(overviewCss, /#[\da-fA-F]{3,8}\b|rgba?\(/);
});

test('period comparison only compares a fully measured previous window of the same length', () => {
  const day = (work, decisions, content) => ({ work, decisions, content });
  const series = [...Array(23).fill(day(1, 0, 0)), day(2, 1, 1), day(1, 1, 0), day(1, 0, 0), day(3, 0, 1), day(0, 0, 0), day(2, 1, 0), day(1, 0, 1)];
  assert.equal(series.length, 30);
  assert.deepEqual(buildPeriodComparison(series, 7), { work: 7, decisions: 0, content: 0 });
  assert.deepEqual(buildPeriodComparison(series, 14), { work: 14, decisions: 0, content: 0 });
  assert.equal(buildPeriodComparison(series, 30), null, 'the 30-day ledger window cannot hold a previous 30 days');
  const gap = series.map((row, index) => (index === 18 ? { ...row, decisions: null } : row));
  assert.equal(buildPeriodComparison(gap, 7), null, 'an unmeasured day is never counted as zero');
  assert.equal(buildPeriodComparison(undefined, 7), null);
});
