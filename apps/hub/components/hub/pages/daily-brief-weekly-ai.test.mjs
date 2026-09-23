import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const dailyBriefSource = await readFile(new URL("./daily-brief.jsx", import.meta.url), "utf8");

test("weeklyScopeToday supports test override and Mon/Thu mapping", () => {
  assert.match(dailyBriefSource, /export function weeklyScopeToday\(override\) \{/);
  assert.match(dailyBriefSource, /if \(override === 'personal' \|\| override === 'company'\) return override;/);
  assert.match(dailyBriefSource, /const WEEKLY_SCOPE_BY_DAY = \{ Mon: 'personal', Thu: 'company' \};/);
});

test("WeeklyReportCard integrates the work-embedded Office and explicit legacy Council entry", () => {
  assert.match(dailyBriefSource, /function WeeklyReportCard\(\{/);
  assert.match(dailyBriefSource, /기존 Council과 토론하기/);
  assert.match(dailyBriefSource, /<WeeklyAiDebrief/);
  assert.match(dailyBriefSource, /onTaskCreated=\{onTaskCreated\}/);
});

test("WeeklyAiDebrief fixes period and scope for the Office panel without a second generation path", () => {
  assert.match(dailyBriefSource, /function WeeklyAiDebrief\(\{/);
  const section=dailyBriefSource.slice(dailyBriefSource.indexOf('export function WeeklyAiDebrief'),dailyBriefSource.indexOf('export function WeeklyReportCard'));
  assert.match(section, /intent="weekly_report"/);
  assert.match(section, /periodStart: report.periodStart, periodEnd: report.periodEnd/);
  assert.match(section, /scope === 'company' \? 'classin' : 'personal'/);
  assert.doesNotMatch(section, /requestPersonaChat|createAdviceTaskWriter|15초/);
});

test("DailyDispatchCard includes Council sparring button when dispatch is ready", () => {
  assert.match(dailyBriefSource, /Council 심층 토의 \(⌘J\)/);
  assert.match(dailyBriefSource, /contextType:\s*"general"/);
  assert.match(dailyBriefSource, /agent:\s*"council"/);
});

test("DailyBrief wires WeeklyReportCard and listens for moonlight:tasks-saved event to update taskToday", () => {
  assert.match(dailyBriefSource, /window\.addEventListener\('moonlight:tasks-saved', ledger\.refreshTasks\)/);
  assert.match(dailyBriefSource, /window\.removeEventListener\('moonlight:tasks-saved', ledger\.refreshTasks\)/);
  assert.match(dailyBriefSource, /<WeeklyReportCard[\s\S]*?onAdvisorOpen=\{setAdvisorSignal\}[\s\S]*?onTaskCreated=\{ledger\.refreshTasks\}/);
});

test("DailyBrief FloatingMentorWidget supports weekly contextType and task refresh", () => {
  assert.match(dailyBriefSource, /agent=\{advisorSignal\.agent \|\|/);
  assert.match(dailyBriefSource, /contextType=\{advisorSignal\.contextType \|\|/);
  assert.match(dailyBriefSource, /\.\.\.advisorSignal\.contextData/);
  assert.match(dailyBriefSource, /onCreateTask=\{[\s\S]*?ledger\.refreshTasks\(\)/);
});

test("WeeklyReportCard shares the weekly field contract, names missing sources and opens the weekly actuals view", () => {
  const section = dailyBriefSource.slice(dailyBriefSource.indexOf('export function WeeklyReportCard'), dailyBriefSource.indexOf('export function DailyBrief('));
  assert.match(section, /WEEKLY_STAT_FIELDS\[scope\]/);
  assert.match(section, /weeklyStatValue\(/);
  assert.match(section, /weeklySourceLabels\(report\?\.failedSources\)/);
  assert.match(section, /goalHref\(null, scope, \{ weekly: true \}\)/);
  assert.doesNotMatch(section, /label: '이동 딜', value: stats\.movedDeals/, 'rows come from the shared field list, not a second inline copy');
});
