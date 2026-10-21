import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sidebarChildren, topNavigationForRoute } from "../hub-nav.js";

// 현황 10c "목표가 첫 화면"(2026-10-21 운영자 확정). 선택자·원천 증거이지 렌더 증거가 아니다.
const read = file => readFileSync(new URL(file, import.meta.url), "utf8");
const lens = read("./overview-goal-lens.jsx");
const css = read("./overview-goal-lens.css");
const overview = read("./overview.jsx");

test("현황 tabs are 목표 (landing) · 집계 · OKR·KPI, owned by the top bar", () => {
  for (const scope of ["all", "classin", "personal"]) {
    assert.deepEqual(sidebarChildren("overview", scope).map(tab => tab.label), ["목표", "집계", "OKR·KPI"]);
    assert.equal(topNavigationForRoute("dashboard/overview", scope).activeTab?.key, "overview-lens");
    assert.equal(topNavigationForRoute("dashboard/overview", scope, "summary").activeTab?.key, "overview-summary");
    assert.equal(topNavigationForRoute("dashboard/overview", scope, "goals").activeTab?.key, "overview-goals");
  }
  assert.match(overview, /view === 'goals' \? <GoalsView \/> : <OverviewSummary \{\.\.\.props\} lens=\{view === 'summary' \? 'sum' : 'goal'\} \/>/);
  assert.doesNotMatch(overview, /SegmentedControl label="현황 렌즈"/);
});

test("read truth stays honest: loading → Skeleton, error/preview → TruthBadge, empty only after a readable read", () => {
  assert.match(lens, /model\.status === "loading"\) \{\s*return <Card><Skeleton/);
  assert.match(lens, /if \(!readable\) \{[\s\S]*?<TruthBadge state=\{model\.status\} \/>/);
  assert.match(lens, /const readable = model\.status === "live" \|\| model\.status === "partial";/);
  assert.ok(lens.indexOf("if (!readable)") < lens.indexOf("if (goals.length === 0)"));
});

test("the lens reads the shared OKR rules and never fills unknowns with zero", () => {
  for (const name of ["objectiveProgress", "keyResultProgress", "keyResultTone", "keyResultPace", "metricFreshnessLabel", "splitObjectiveMetrics"]) assert.match(lens, new RegExp(`\\b${name}\\(`), name);
  assert.match(lens, /progress === null \? "—"/);
  assert.match(lens, /measured \? `\$\{formatPaceNumber/);
  // 체크인은 사람이 적는 KR에만 — 자동 집계에는 적을 값이 없다.
  assert.match(lens, /stale: metric\.sourceKey === "manual"/);
});

test("color follows §5.2: red only for KPIs outside the line, selection is the Moonstone 1px edge", () => {
  const danger = [...css.matchAll(/([^{}]+)\{[^}]*var\(--danger\)/g)].map(m => m[1].trim());
  assert.ok(danger.length > 0 && danger.every(selector => /ogl-kpi-(chip--out|line__count)/.test(selector)), danger.join(" | "));
  assert.match(css, /\.ogl-goal--on \{ border-color: var\(--accent\); \}/);
  assert.doesNotMatch(css, /!important|#[\da-fA-F]{3,8}\b|rgba?\(/);
  assert.match(lens, /aria-pressed=\{on\}/);
});
