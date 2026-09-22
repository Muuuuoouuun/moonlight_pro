import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const tokensCss = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");
const futuraCss = await readFile(new URL("./hub-futura.css", import.meta.url), "utf8");
const projectExecCss = await readFile(new URL("./pages/project-execution.css", import.meta.url), "utf8");
const primitivesSource = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const dailyBriefSource = await readFile(new URL("./pages/daily-brief.jsx", import.meta.url), "utf8");
const homeSource = await readFile(new URL("./pages/home.jsx", import.meta.url), "utf8");

test("hub-tokens.css defines tactile check, checkmark, and gauge keyframes", () => {
  assert.match(tokensCss, /@keyframes hubCheckPop/);
  assert.match(tokensCss, /@keyframes hubCheckmarkIn/);
  assert.match(tokensCss, /@keyframes hubRingGlow/);
  assert.match(tokensCss, /\.hub-checkbox--checked/);
  assert.match(tokensCss, /\.hub-checkbox__icon/);
  assert.match(tokensCss, /\.hub-checkbox:active:not\(:disabled\)/);
  assert.match(tokensCss, /\.hub-checkbox-row:active:not\(:disabled\)/);
  assert.match(tokensCss, /\.hub-checkbox-row--checked/);
  assert.match(tokensCss, /\.hub-progress-ring/);
  assert.match(tokensCss, /\.hub-progress-ring--completed/);
  assert.match(tokensCss, /\.hub-task-completed/);
});

test("hub-tokens.css provides reduced-motion safety for check and ring animations", () => {
  assert.match(tokensCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.hub-progress-ring--completed/);
  const checks = tokensCss.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*(\.hub-app \.hub-checkbox,[\s\S]*?)\n\}/)?.[1];
  assert.ok(checks, 'checkbox motion needs its own reduced-motion guard');
  for (const selector of ['.hub-checkbox,', '.hub-checkbox-row,', '.hub-checkbox__icon,', '.hub-checkbox-row--checked .hub-checkbox-row__icon']) assert.ok(checks.includes(selector));
  for (const property of ['animation', 'transition', 'transform']) assert.match(checks, new RegExp(`${property}:\\s*none\\s*!important`));
});

test("new completion glow uses the theme palette instead of a fixed color", () => {
  const blocks = [
    futuraCss.match(/\.hub-app \.fx-progress--completed\s*\{[^}]*\}/)?.[0],
    futuraCss.match(/\.hub-app \.fx-progress--completed > i\s*\{[^}]*\}/)?.[0],
    tokensCss.match(/@keyframes hubRingGlow\s*\{[\s\S]*?\n\}/)?.[0],
    tokensCss.match(/\.hub-app \.hub-progress-ring--completed\s*\{[^}]*\}/)?.[0],
  ];
  for (const block of blocks) {
    assert.ok(block);
    assert.doesNotMatch(block, /\b(?:rgba?|hsla?|oklch)\(|#[\da-f]{3,8}\b/i);
    assert.match(block, /var\(--moon-300\)/);
  }
});

test("Checkbox primitive includes micro-interaction classes, aria-checked, and icon animation", () => {
  assert.match(primitivesSource, /export function Checkbox\b/);
  assert.match(primitivesSource, /hub-checkbox\$\{isChecked \? ' hub-checkbox--checked' : ''\}/);
  assert.match(primitivesSource, /span className="hub-checkbox__icon"/);
  assert.match(primitivesSource, /role="checkbox"/);
  assert.match(primitivesSource, /aria-checked=\{isChecked\}/);
});

test("CheckboxRow primitive includes checked class and animated icon", () => {
  assert.match(primitivesSource, /export function CheckboxRow\b/);
  assert.match(primitivesSource, /hub-checkbox-row\$\{isChecked \? ' hub-checkbox-row--checked' : ''\}/);
  assert.match(primitivesSource, /span className="hub-checkbox__icon hub-checkbox-row__icon"/);
  assert.match(primitivesSource, /role="checkbox"/);
  assert.match(primitivesSource, /aria-checked=\{isChecked\}/);
});

test("ProgressRing primitive is exported, accessible, and supports completed states", () => {
  assert.match(primitivesSource, /export function ProgressRing\b/);
  assert.match(primitivesSource, /role="progressbar"/);
  assert.match(primitivesSource, /aria-valuenow=\{clamped\}/);
  assert.match(primitivesSource, /hub-progress-ring\$\{completedCls\}\$\{overachievedCls\}/);
  assert.match(primitivesSource, /hub-progress-ring--completed/);
  assert.match(primitivesSource, /hub-progress-ring--overachieved/);
  assert.match(primitivesSource, /stroke-dashoffset var\(--dur-enter\) var\(--ease-hub\)/);
  assert.match(primitivesSource, /isCompleted \? '✦' : formattedLabel/);
});

test("project-execution.css defines checklist item completion styling and smooth transitions", () => {
  assert.match(projectExecCss, /\.hub-task-checklist-item\[data-done="true"\]/);
  assert.match(projectExecCss, /text-decoration:\s*line-through/);
  assert.match(projectExecCss, /color:\s*var\(--fg-faint\)/);
  assert.match(projectExecCss, /transition:[\s\S]*?var\(--ease-hub\)/);
});

test("daily-brief rhythm visualizer integrates ProgressRing alongside linear progress", () => {
  assert.match(dailyBriefSource, /import \{[^}]*ProgressRing[^}]*\} from "\.\.\/hub-primitives"/);
  assert.match(dailyBriefSource, /<ProgressRing\s+value=\{percent\}\s+size=\{28\}/);
});

test("home triage progress applies completed styling and sparkle when finished", () => {
  assert.match(homeSource, /fx-progress\$\{done >= total \? ' fx-progress--completed' : ''\}/);
  assert.match(homeSource, /done >= total \? ' ✦' : ''/);
});
