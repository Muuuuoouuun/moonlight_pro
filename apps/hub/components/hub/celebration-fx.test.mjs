import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import ts from "typescript";

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

const revenueSource = await readFile(new URL("./pages/revenue.jsx", import.meta.url), "utf8");
const overviewSource = await readFile(new URL("./pages/overview.jsx", import.meta.url), "utf8");
const heatmapSource = await readFile(new URL("./pages/revenue-heatmap.jsx", import.meta.url), "utf8");

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

test("celebration-fx implements particle pooling, throttling, haptic feedback, and a11y live region", () => {
  assert.match(celebrationSource, /MAX_PARTICLES = 200/);
  assert.match(celebrationSource, /const confettiPool = \[\]/);
  assert.match(celebrationSource, /const sparklePool = \[\]/);
  assert.match(celebrationSource, /navigator\.vibrate/);
  assert.match(celebrationSource, /lastMajorCelebrationTime/);
  assert.match(celebrationSource, /aria-live=["']polite["']/);
  assert.match(celebrationSource, /className=["']sr-only["']/);
});

test("my-work triggers celebration fireworks for completed selected tasks and provides celebratory empty state", () => {
  assert.match(myWorkSource, /import \{[^}]*triggerCelebration[^}]*\} from ["']\.\.\/celebration-fx["']/);
  assert.match(myWorkSource, /triggerCelebration\(\{\s*mode:\s*['"]fireworks['"]\s*\}\)/);
  assert.match(myWorkSource, /오늘 고른 할 일 완료!/);
  assert.match(myWorkSource, /폭죽 다시 터뜨리기/);
});

test("my-work supports mobile swipe gestures (right complete, left defer) and DOM/keyboard sparkle lookup", () => {
  assert.match(myWorkSource, /onTouchStart=\{handleTouchStart\}/);
  assert.match(myWorkSource, /onTouchMove=\{handleTouchMove\}/);
  assert.match(myWorkSource, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(myWorkSource, /mywork-row-/);
  assert.match(myWorkSource, /getBoundingClientRect/);
  assert.match(myWorkSource, /onDefer=\{handleItemDefer\}/);
});

test("revenue triggers confetti celebration on moving deal to closing (won) stage", () => {
  assert.match(revenueSource, /import \{[^}]*triggerCelebration[^}]*\} from ["']\.\.\/celebration-fx["']/);
  assert.match(revenueSource, /to === ['"]closing['"] && prevStage !== ['"]closing['"]/);
  assert.match(revenueSource, /triggerCelebration\(\{\s*mode:\s*['"]confetti['"]\s*\}\)/);
});

test("overview DonutChart radiates golden celebration glow when 100% completed", () => {
  assert.match(overviewSource, /isAllCompleted\s*=\s*total > 0 && completedValue === total/);
  assert.match(overviewSource, /drop-shadow\(0 0 10px rgba\(255, 209, 102, 0\.45\)\)/);
  assert.match(overviewSource, /✦/);
});

test("revenue-heatmap highlights rank 01 top customer with champagne gold badge", () => {
  assert.match(heatmapSource, /const isTop = rank === 1 && value > 0/);
  assert.match(heatmapSource, /✦ Top/);
  assert.match(heatmapSource, /hub-revenue-top-row/);
});

test("projects triggers celebration fireworks on project completion and confetti on subtasks completion", () => {
  assert.match(projectsSource, /import \{[^}]*triggerCelebration[^}]*\} from ["']\.\.\/celebration-fx["']/);
  assert.match(projectsSource, /triggerCelebration\(\{\s*mode:\s*['"]fireworks['"]\s*\}\)/);
  assert.match(projectsSource, /triggerCelebration\(\{\s*mode:\s*['"]confetti['"]\s*\}\)/);
});

test("Progress primitive applies completed, overachieved classes, role=progressbar, and detailed tooltip", () => {
  assert.match(primitivesSource, /const isCompleted = numValue >= 100/);
  assert.match(primitivesSource, /const isOverachieved = numValue > 100/);
  assert.match(primitivesSource, /hub-progress--completed/);
  assert.match(primitivesSource, /hub-progress--overachieved/);
  assert.match(primitivesSource, /role=["']progressbar["']/);
  assert.match(primitivesSource, /title=\{computedTitle\}/);
});

test("project evidence reaching 100% does not imply lifecycle completion", () => {
  const gauge = pmsComponentsSource.slice(pmsComponentsSource.indexOf('export function ProjectProgressGauge'), pmsComponentsSource.indexOf('const PORTFOLIO_CELLS'));
  assert.doesNotMatch(gauge, /hub-pms-progress--completed|hub-pms-sparkle-mark/);
  assert.match(gauge, /progress.source === 'tasks'/);
  assert.match(gauge, /체크리스트/);
  assert.match(gauge, /countLabel.*완료/);
});

test("hub-tokens.css defines celebration shimmer keyframes and reduced-motion fallback", () => {
  assert.match(tokensCss, /@keyframes hubProgressShimmer/);
  assert.match(tokensCss, /@keyframes hubSparklePop/);
  assert.match(tokensCss, /\.hub-progress--completed/);
  assert.match(tokensCss, /\.hub-celebration-badge/);
  assert.match(tokensCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?hubProgressShimmer/);
});

// Run the real component with deterministic browser scheduling and hook lifecycles.
// Source-only assertions cannot show whether a callback survives effect cleanup.
function createCanvasHarness({ reduced = false } = {}) {
  const slots = [], effects = [], listeners = new Map(), mediaListeners = new Set();
  const timers = new Map(), frames = new Map();
  let cursor = 0, nextId = 0, draws = 0, pixels = 0, stateWrites = 0;
  const sameDeps = (before, after) => before?.length === after.length && after.every((value, i) => Object.is(value, before[i]));
  const hooks = {
    ...React,
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { stateWrites++; slots[i] = value; }];
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!sameDeps(slots[i]?.deps, deps)) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect(callback, deps) {
      const i = cursor++, previous = slots[i];
      if (!sameDeps(previous?.deps, deps)) effects.push(() => {
        previous?.cleanup?.();
        slots[i] = { deps, cleanup: callback() };
      });
    },
  };
  const media = {
    matches: reduced,
    addEventListener: (type, callback) => mediaListeners.add(callback),
    removeEventListener: (type, callback) => mediaListeners.delete(callback),
  };
  const window = {
    innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
    matchMedia: () => media,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
  };
  const ctx = new Proxy({
    clearRect() { pixels = 0; },
    fill() { draws++; pixels++; },
    fillRect() { draws++; pixels++; },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const js = ts.transpileModule(celebrationSource.replace(/^import .*$/gm, "").replace(/^export /gm, ""), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Canvas = new Function("React", "window", "setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", `${js}\nreturn CelebrationCanvas;`)(
    hooks, window,
    (callback, delay) => { const id = nextId++; timers.set(id, { callback, delay }); return id; },
    id => timers.delete(id),
    callback => { const id = nextId++; frames.set(id, callback); return id; },
    id => frames.delete(id),
  );
  const attachCanvas = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "canvas") node.ref.current = canvas;
    React.Children.forEach(node.props?.children, attachCanvas);
  };
  return {
    timers, frames,
    get draws() { return draws; },
    get pixels() { return pixels; },
    get stateWrites() { return stateWrites; },
    get listeners() { return [...listeners.values()].reduce((n, set) => n + set.size, mediaListeners.size); },
    render() { cursor = 0; attachCanvas(Canvas()); effects.splice(0).forEach(effect => effect()); },
    celebrate(detail) { listeners.get("hub-celebrate")?.forEach(callback => callback({ detail })); this.render(); },
    launch() {
      const [id, timer] = [...timers].find(([, timer]) => timer.delay === 0);
      timers.delete(id);
      timer.callback();
    },
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    reduce(matches) { media.matches = matches; mediaListeners.forEach(callback => callback({ matches })); this.render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("unmount cancels every fireworks launch, frame, and announcement timeout", () => {
  const app = createCanvasHarness();
  app.render();
  app.celebrate({ mode: "fireworks", count: 4 });
  app.launch();
  app.frame();
  assert.ok(app.pixels > 40, "the first rocket draws alongside its confetti");
  assert.equal(app.timers.size, 4, "three delayed launches and one announcement remain");
  assert.equal(app.frames.size, 1, "launches share the existing animation loop");
  const pendingCallbacks = [...app.frames.values(), ...[...app.timers.values()].map(timer => timer.callback)];
  app.unmount();
  assert.equal(app.timers.size, 0, "delayed rockets must not outlive the canvas");
  assert.equal(app.frames.size, 0);
  assert.equal(app.listeners, 0);
  const before = { draws: app.draws, writes: app.stateWrites };
  pendingCallbacks.forEach(callback => callback());
  assert.equal(app.draws, before.draws);
  assert.equal(app.stateWrites, before.writes);
  assert.equal(app.frames.size + app.timers.size, 0);
});

test("live reduced motion cancels pending launches, clears drawn particles, and resumes only new celebrations", () => {
  const app = createCanvasHarness();
  app.render();
  app.celebrate({ mode: "fireworks", count: 4 });
  app.launch();
  app.frame();
  assert.ok(app.pixels > 0);
  const obsoleteCallbacks = [...app.frames.values(), ...[...app.timers.values()].filter(timer => timer.delay < 3000).map(timer => timer.callback)];
  app.reduce(true);
  assert.equal(app.frames.size, 0, "active frames must stop when the OS preference changes");
  assert.equal(app.timers.size, 0);
  assert.equal(app.pixels, 0, "the last painted frame must disappear too");
  app.celebrate({ mode: "fireworks", count: 4 });
  assert.equal(app.frames.size + app.timers.size, 0);

  app.reduce(false);
  app.celebrate({ mode: "sparkle", count: 1 });
  const before = app.draws;
  obsoleteCallbacks.forEach(callback => callback());
  assert.equal(app.draws, before, "cancelled work cannot re-enter after motion is re-enabled");
  assert.equal(app.frames.size, 1);
  app.frame();
  assert.equal(app.draws - before, 1, "old particles and rockets must not return");
  app.unmount();
});

test("initial reduced motion blocks events even without a producer-supplied reduced flag", () => {
  const app = createCanvasHarness({ reduced: true });
  app.render();
  app.celebrate({ mode: "fireworks", count: 4 });
  assert.equal(app.frames.size + app.timers.size, 0);
  assert.equal(app.draws, 0);
  app.unmount();
});

test("a zero-valued RAF handle and already queued callbacks cannot survive unmount", () => {
  const app = createCanvasHarness();
  app.render();
  app.celebrate({ mode: "sparkle", count: 1 });
  assert.ok(app.frames.has(0));
  const callbacks = [...app.frames.values()];
  app.unmount();
  assert.equal(app.frames.size, 0);
  const before = { draws: app.draws, writes: app.stateWrites };
  callbacks.forEach(callback => callback());
  assert.equal(app.draws, before.draws);
  assert.equal(app.stateWrites, before.writes);
  assert.equal(app.frames.size + app.timers.size, 0);
});
