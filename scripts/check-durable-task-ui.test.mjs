import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = process.cwd();
const [dailySource, projectsSource, primitiveSource, tokenSource] = await Promise.all([
  readFile(`${root}/apps/hub/components/hub/pages/daily-brief.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/pages/projects.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/hub-primitives.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/hub-tokens.css`, "utf8"),
]);

test("Daily ledger keeps the canonical task source and lanes independent from legacy brief state", () => {
  assert.match(dailySource, /taskSource:\s*['"]loading['"]/);
  assert.match(dailySource, /taskLanes/);
  assert.match(dailySource, /['"]empty['"]/);
  assert.match(dailySource, /['"]preview['"]/);
  assert.match(dailySource, /['"]error['"]/);
  assert.match(dailySource, /['"]live['"]/);
  assert.doesNotMatch(dailySource, /liveCount\s*>\s*0[^\n]*taskLanes/);
  assert.match(
    dailySource,
    /if\s*\(taskSource === ['"]error['"]\)\s*\{[\s\S]*?taskLanes:\s*previousLanes/,
  );
});

test("first fold puts durable attention between Quick Capture and the status line", () => {
  const quickCapture = dailySource.indexOf("<QuickCapture");
  const durableAttention = dailySource.indexOf("<DurableTaskAttention");
  const statusLine = dailySource.indexOf("<StatusLine");

  assert.ok(quickCapture >= 0, "Quick Capture must remain mounted");
  assert.ok(durableAttention > quickCapture, "durable attention must follow Quick Capture");
  assert.ok(statusLine > durableAttention, "status line must follow durable attention");
});

test("Daily durable attention uses the approved lane order and five-item focus cap", () => {
  assert.match(
    dailySource,
    /TASK_LANE_ORDER\s*=\s*\[['"]missed['"],\s*['"]today['"],\s*['"]waiting['"],\s*['"]inbox['"]\]/,
  );
  assert.match(dailySource, /TASK_FOCUS_LIMIT\s*=\s*5/);
  assert.doesNotMatch(dailySource, /\bblocks\b|\bsetBlocks\b|toggle\s*\(\s*i\s*\)/);
  assert.doesNotMatch(dailySource, /09:00|14:00/);
});

test("task completion uses the durable OCC client and canonical refetches for success or conflict", () => {
  assert.match(dailySource, /createDurableTaskClient/);
  assert.match(dailySource, /client\.updateTask\s*\(/);
  assert.match(dailySource, /id:\s*task\.id/);
  assert.match(dailySource, /expectedUpdatedAt:\s*task\.updatedAt/);
  assert.match(dailySource, /patch:\s*\{\s*status:\s*['"]done['"]\s*\}/);
  assert.match(dailySource, /result\.httpStatus\s*>=\s*200/);
  assert.match(dailySource, /['"]saved['"].*['"]duplicate['"]|['"]duplicate['"].*['"]saved['"]/s);
  assert.match(dailySource, /await ledger\.refetch\s*\(/);
  assert.match(
    dailySource,
    /result\.status\s*===\s*['"]conflict['"]\s*\)\s*\{\s*await ledger\.refetch\s*\(/,
  );
  assert.doesNotMatch(
    dailySource,
    /result\.(?:currentTask|task)\?\.(?:updatedAt|updated_at)/,
  );
  assert.match(dailySource, /createRefreshGenerationCoordinator/);
  assert.match(dailySource, /\.settle\s*\(loadGeneration\)/);
  assert.doesNotMatch(dailySource, /refreshWaitersRef/);
});

test("initial task loading uses a fixed-height two-row token skeleton without fake content", () => {
  assert.match(dailySource, /function TaskAttentionSkeleton\s*\(/);
  assert.match(dailySource, /<TaskAttentionSkeleton\s*\/>/);
  assert.match(
    dailySource,
    /className=['"]durable-task-attention__skeleton['"][^>]*role=['"]status['"][^>]*aria-label=/,
  );
  assert.equal(
    [...dailySource.matchAll(/className=['"]durable-task-attention__skeleton-row['"]/g)].length,
    2,
  );
  assert.match(tokenSource, /\.durable-task-attention__skeleton\s*\{[^}]*height:\s*104px/s);
  assert.match(
    tokenSource,
    /\.durable-task-attention__skeleton-row\s*\{[^}]*background:\s*var\(--surface-2\)[^}]*border-bottom:\s*1px solid var\(--line-soft\)/s,
  );
});

test("task rows expose row-only pending and an announced retry without optimistic removal", () => {
  assert.match(dailySource, /pendingTaskIds/);
  assert.match(dailySource, /aria-busy/);
  assert.match(dailySource, /role=['"]alert['"]/);
  assert.match(dailySource, /다시 시도/);
  assert.match(dailySource, /label=\{.*task\.title.*\}/);
  assert.doesNotMatch(dailySource, /setTaskLanes|filter\s*\([^)]*task\.id/);
});

test("task read errors keep previously loaded rows visible beside the retry alert", () => {
  assert.match(dailySource, /ledger\.taskSource === ['"]error['"] && visibleTasks\.length === 0/);
  assert.match(dailySource, /ledger\.taskSource === ['"]error['"] && \(/);
  assert.match(dailySource, /기존[^<\n]*행|불러온[^<\n]*할 일/);
  assert.match(dailySource, /if\s*\([^)]*ledger\.taskSource === ['"]error['"][^)]*\)\s*return/);
  assert.match(
    dailySource,
    /aria-label=\{`\$\{task\.title\} 완료 다시 시도`\}[\s\S]{0,220}disabled=\{ledger\.taskSource === ['"]error['"]\}/,
  );
});

test("Button forwards DOM props and Checkbox supports busy disabled state", () => {
  assert.match(primitiveSource, /export function Button\s*\(\{[^)]*\.\.\.rest/s);
  assert.match(primitiveSource, /<button\s+\{\.\.\.rest\}/);
  assert.match(primitiveSource, /export function Checkbox\s*\(\{[^)]*disabled/s);
  assert.match(primitiveSource, /aria-busy=\{ariaBusy/);
  assert.match(primitiveSource, /className=['"]hub-checkbox['"]/);
});

test("Checkbox keeps a small face with a real 44px hit target", () => {
  assert.match(tokenSource, /\.hub-app\s+\.hub-checkbox::before/);
  assert.match(tokenSource, /width:\s*44px/);
  assert.match(tokenSource, /height:\s*44px/);
  assert.match(primitiveSource, /size\s*=\s*14/);
});

test("Projects keeps canonical task health separate from project sync health", () => {
  assert.match(projectsSource, /taskSource,\s*setTaskSource/);
  assert.match(projectsSource, /taskError,\s*setTaskError/);
  assert.match(projectsSource, /const nextTaskSource = data\.taskSource/);
  assert.match(projectsSource, /setTaskSource\(nextTaskSource\)/);
  assert.match(projectsSource, /nextTaskSource\s*===\s*['"]error['"]/);
  assert.match(projectsSource, /setTodos\(previousTodos\s*=>\s*previousTodos\)/);
  assert.match(projectsSource, /role=['"]alert['"]/);
  assert.match(projectsSource, /기존[^<\n]*할 일|불러온[^<\n]*할 일/);
  assert.doesNotMatch(projectsSource, /taskSource\s*=\s*syncState/);
});

test("Projects read lifecycle survives React Strict Mode effect replay", () => {
  assert.match(
    projectsSource,
    /React\.useEffect\(\(\)\s*=>\s*\{\s*mountedRef\.current\s*=\s*true;[\s\S]*return\s*\(\)\s*=>\s*\{\s*mountedRef\.current\s*=\s*false;/,
  );
});

test("expanded Projects rows create project-linked durable tasks and refetch canonically", () => {
  assert.match(projectsSource, /createDurableTaskClient/);
  assert.match(projectsSource, /client\.createTask\s*\(/);
  assert.match(projectsSource, /title:\s*taskComposer\.title/);
  assert.match(projectsSource, /projectId:\s*taskComposer\.projectId/);
  assert.match(projectsSource, /status:\s*['"]todo['"]/);
  assert.match(projectsSource, /['"]saved['"].*['"]duplicate['"]|['"]duplicate['"].*['"]saved['"]/s);
  assert.match(projectsSource, /await loadLedger\s*\(/);
  assert.match(projectsSource, /\+ Task/);
  assert.match(projectsSource, /className=['"]project-task-composer['"]/);
});

test("Projects task rows use labeled durable checkboxes and row-only pending", () => {
  assert.match(projectsSource, /pendingTaskIds/);
  assert.match(projectsSource, /persistedTaskIds/);
  assert.match(projectsSource, /<Checkbox/);
  assert.match(projectsSource, /label=\{`\$\{t\.title\} 완료`\}/);
  assert.match(projectsSource, /client\.updateTask\s*\(/);
  assert.match(projectsSource, /if\s*\(persistedTaskIds\.has\(t\.id\)\)[\s\S]*await loadLedger\(\)[\s\S]*return/);
  assert.match(projectsSource, /expectedUpdatedAt:\s*t\.updatedAt/);
  assert.match(projectsSource, /patch:\s*\{\s*status:\s*['"]done['"]\s*\}/);
  assert.match(projectsSource, /result\.status\s*===\s*['"]conflict['"]/);
  assert.match(
    projectsSource,
    /else if \(result\.status === ['"]conflict['"]\) \{[\s\S]*const refreshed = await loadLedger\(\);[\s\S]*refreshed\.ok[\s\S]*최신 값을 불러왔[\s\S]*최신 값을 다시 읽지 못/,
  );
  assert.doesNotMatch(projectsSource, /aria-label=\{t\.done \? ['"]완료된 할 일/);
});

test("Projects task titles open the canonical durable EditDrawer", () => {
  assert.match(projectsSource, /<EditDrawer/);
  assert.match(projectsSource, /fields=\{TASK_EDIT_FIELDS/);
  assert.match(projectsSource, /title.*status.*priority.*dueDate.*nextAction/s);
  assert.match(projectsSource, /allowedTaskStatuses/);
  assert.match(projectsSource, /dueAt:\s*null,\s*duePrecision:\s*['"]none['"]/);
  assert.match(projectsSource, /dueAt:.*duePrecision:\s*['"]date['"]/s);
  assert.match(projectsSource, /result\.status\s*===\s*['"]conflict['"][\s\S]*await loadLedger/);
  assert.match(projectsSource, /setTaskDraft\([^)]*latest/s);
});

test("Projects preserves timed due values and never claims an unfetched conflict refresh", () => {
  assert.match(projectsSource, /taskDraft\.duePrecision\s*===\s*['"]timed['"]/);
  assert.match(projectsSource, /dueAt:\s*taskDraft\.dueAt,\s*duePrecision:\s*['"]timed['"]/);
  assert.match(projectsSource, /if\s*\(latest\)[\s\S]*최신 값으로 교체/);
  assert.match(projectsSource, /최신 값을 불러오지 못했습니다/);
});

test("EditDrawer keeps failed drafts open and disables all fields while saving", () => {
  assert.match(primitiveSource, /saveError,\s*setSaveError/);
  assert.match(primitiveSource, /try\s*\{[\s\S]*await onSave\(\)[\s\S]*catch/s);
  assert.match(primitiveSource, /ariaBusy=\{saveState === ['"]saving['"]\}/);
  assert.match(primitiveSource, /disabled=\{saveState === ['"]saving['"]\}/g);
  assert.match(primitiveSource, /role=['"]alert['"]/);
  assert.match(primitiveSource, /r\?\.message|r\?\.error/);
  assert.match(primitiveSource, /if\s*\(saveState === ['"]saving['"]\) return/);
});

test("Projects writable task controls meet mobile sizing without unlocking project writes", () => {
  assert.match(projectsSource, /프로젝트 생성·삭제는 읽기 전용/);
  assert.match(projectsSource, /Board.*읽기 전용|읽기 전용.*Board/s);
  assert.match(tokenSource, /\.project-task-composer\s+input[\s\S]*font-size:\s*16px/);
  assert.match(tokenSource, /\.project-task-control[\s\S]*min-height:\s*44px/);
  assert.match(tokenSource, /@media\s*\(max-width:\s*640px\)[\s\S]*\.hub-project-task-row/s);
  assert.match(projectsSource, /className=['"]hub-project-row['"]/);
  assert.match(projectsSource, /className=['"]hub-project-task-group['"]/);
  assert.match(projectsSource, /className=['"]hub-project-readonly-footer['"]/);
  assert.match(tokenSource, /@media\s*\(max-width:\s*640px\)[\s\S]*\.hub-project-row[\s\S]*grid-template-columns:\s*44px minmax\(0,\s*1fr\) auto/s);
  assert.match(tokenSource, /\.hub-project-readonly-footer[\s\S]*min-width:\s*0/);
});
