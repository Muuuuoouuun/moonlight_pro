import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CelebrationCanvas,
  triggerCelebration,
  triggerSparkleAt,
  useCelebration,
} from "./celebration-fx.jsx";

const appSource = await readFile(new URL("./hub-app.jsx", import.meta.url), "utf8");
const celebrationSource = await readFile(new URL("./celebration-fx.jsx", import.meta.url), "utf8");
const myWorkSource = await readFile(new URL("./pages/my-work.jsx", import.meta.url), "utf8");
const projectsSource = await readFile(new URL("./pages/projects.jsx", import.meta.url), "utf8");
const primitivesSource = await readFile(new URL("./hub-primitives.jsx", import.meta.url), "utf8");
const pmsComponentsSource = await readFile(new URL("./pages/project-pms-components.jsx", import.meta.url), "utf8");
const tokensCss = await readFile(new URL("./hub-tokens.css", import.meta.url), "utf8");

test("celebration-fx exposes canonical celebration functions and React component", () => {
  assert.equal(typeof CelebrationCanvas, "function");
  assert.equal(typeof triggerCelebration, "function");
  assert.equal(typeof triggerSparkleAt, "function");
  assert.equal(typeof useCelebration, "function");
});

test("hub-app mounts CelebrationCanvas on the root surface", () => {
  assert.match(appSource, /import \{[^}]*CelebrationCanvas[^}]*\} from ["']\.\/celebration-fx["']/);
  assert.match(appSource, /<CelebrationCanvas\s*\/>/);
});

test("celebration-fx supports fireworks, confetti, and sparkles modes with reduced motion safety", () => {
  assert.match(celebrationSource, /mode === ["']sparkle["']/);
  assert.match(celebrationSource, /mode === ["']fireworks["']/);
  assert.match(celebrationSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(celebrationSource, /hub-celebrate/);
});

test("my-work triggers celebration fireworks on completing all tasks and provides celebratory empty state", () => {
  assert.match(myWorkSource, /import \{[^}]*triggerCelebration[^}]*\} from ["']\.\.\/celebration-fx["']/);
  assert.match(myWorkSource, /triggerCelebration\(\{\s*mode:\s*['"]fireworks['"]\s*\}\)/);
  assert.match(myWorkSource, /오늘의 모든 할 일 완료!/);
  assert.match(myWorkSource, /폭죽 다시 터뜨리기/);
});

test("projects triggers celebration fireworks on project completion and confetti on subtasks completion", () => {
  assert.match(projectsSource, /import \{[^}]*triggerCelebration[^}]*\} from ["']\.\.\/celebration-fx["']/);
  assert.match(projectsSource, /triggerCelebration\(\{\s*mode:\s*['"]fireworks['"]\s*\}\)/);
  assert.match(projectsSource, /triggerCelebration\(\{\s*mode:\s*['"]confetti['"]\s*\}\)/);
});

test("Progress primitive applies completed and overachieved classes for >= 100% values", () => {
  assert.match(primitivesSource, /const isCompleted = numValue >= 100/);
  assert.match(primitivesSource, /const isOverachieved = numValue > 100/);
  assert.match(primitivesSource, /hub-progress--completed/);
  assert.match(primitivesSource, /hub-progress--overachieved/);
});

test("ProjectProgressGauge indicates 100% completion with celebration class and sparkle mark", () => {
  assert.match(pmsComponentsSource, /hub-pms-progress--completed/);
  assert.match(pmsComponentsSource, /hub-pms-sparkle-mark/);
});

test("hub-tokens.css defines celebration shimmer keyframes and reduced-motion fallback", () => {
  assert.match(tokensCss, /@keyframes hubProgressShimmer/);
  assert.match(tokensCss, /@keyframes hubSparklePop/);
  assert.match(tokensCss, /\.hub-progress--completed/);
  assert.match(tokensCss, /\.hub-celebration-badge/);
  assert.match(tokensCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?hubProgressShimmer/);
});
