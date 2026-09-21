import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const dailyBriefSource = await readFile(new URL("./daily-brief.jsx", import.meta.url), "utf8");

test("weeklyScopeToday supports test override and Mon/Thu mapping", () => {
  assert.match(dailyBriefSource, /export function weeklyScopeToday\(override\) \{/);
  assert.match(dailyBriefSource, /if \(override === 'personal' \|\| override === 'company'\) return override;/);
  assert.match(dailyBriefSource, /const WEEKLY_SCOPE_BY_DAY = \{ Mon: 'personal', Thu: 'company' \};/);
});

test("WeeklyReportCard integrates WeeklyAiDebrief and Council header button", () => {
  assert.match(dailyBriefSource, /function WeeklyReportCard\(\{/);
  assert.match(dailyBriefSource, /Council 이사회 \(⌘J\)/);
  assert.match(dailyBriefSource, /<WeeklyAiDebrief/);
  assert.match(dailyBriefSource, /onTaskCreated=\{onTaskCreated\}/);
});

test("WeeklyAiDebrief supports Council request, task creation, and event dispatch", () => {
  assert.match(dailyBriefSource, /function WeeklyAiDebrief\(\{/);
  assert.match(dailyBriefSource, /personaId:\s*"council"/);
  assert.match(dailyBriefSource, /mode:\s*"weekly-review"/);
  assert.match(dailyBriefSource, /createAdviceTaskWriter/);
  assert.match(dailyBriefSource, /moonlight:tasks-saved/);
  assert.match(dailyBriefSource, /Council과 토론 계속하기/);
  assert.match(dailyBriefSource, /다음 주 1단계 실험 할 일로 등록/);
  assert.match(dailyBriefSource, /15초 AI 주간 평가 & 조언 받기/);
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
