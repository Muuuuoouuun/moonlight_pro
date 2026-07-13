import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = process.cwd();
const [dailySource, primitiveSource, tokenSource] = await Promise.all([
  readFile(`${root}/apps/hub/components/hub/pages/daily-brief.jsx`, "utf8"),
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
  assert.match(dailySource, /refreshWaitersRef/);
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
