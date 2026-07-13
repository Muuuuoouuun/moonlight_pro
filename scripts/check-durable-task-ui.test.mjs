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

test("task completion uses the durable OCC client and only refetches after committed success", () => {
  assert.match(dailySource, /createDurableTaskClient/);
  assert.match(dailySource, /client\.updateTask\s*\(/);
  assert.match(dailySource, /id:\s*task\.id/);
  assert.match(dailySource, /expectedUpdatedAt:/);
  assert.match(dailySource, /patch:\s*\{\s*status:\s*['"]done['"]\s*\}/);
  assert.match(dailySource, /result\.httpStatus\s*>=\s*200/);
  assert.match(dailySource, /['"]saved['"].*['"]duplicate['"]|['"]duplicate['"].*['"]saved['"]/s);
  assert.match(dailySource, /result\.task\?\.updated_at|result\.task\?\.updatedAt/);
  assert.match(dailySource, /await ledger\.refetch\s*\(/);
  assert.match(dailySource, /refreshWaitersRef/);
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
