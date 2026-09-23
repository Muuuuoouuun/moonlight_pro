import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DEFAULT_HUB_PREFERENCES,
  SIDEBAR_WIDTH,
  clampSidebarWidth,
  nextSidebarWidth,
  persistHubPreference,
  readHubPreferences,
  resolveHubTheme,
  watchHubTheme,
} from "./hub-preferences.js";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function readHubAppSource() {
  const ref = process.env.HUB_APP_SOURCE_REF;
  if (ref) {
    return execFileSync(
      "git",
      ["show", `${ref}:apps/hub/components/hub/hub-app.jsx`],
      { encoding: "utf8" },
    );
  }
  return readFileSync(new URL("../components/hub/hub-app.jsx", import.meta.url), "utf8");
}

test("keeps the server and first client render deterministic before restoring saved preferences", () => {
  const storage = memoryStorage({ "mlp.theme": "light" });

  assert.deepEqual(DEFAULT_HUB_PREFERENCES, { theme: "auto", sidebarCollapsed: false, sidebarWidth: 232 });
  assert.deepEqual(readHubPreferences(storage), { theme: "light", sidebarCollapsed: false, sidebarWidth: 232 });
});

test("restores browser preferences after hydration instead of inside state initializers", () => {
  const source = readHubAppSource();

  assert.match(source, /useState\(DEFAULT_HUB_PREFERENCES\.theme\)/);
  assert.doesNotMatch(
    source,
    /useState\(\s*\(\)\s*=>[\s\S]{0,180}localStorage/,
    "reading localStorage in a state initializer makes SSR and hydration render different trees",
  );
});

test("falls back safely when stored preferences are invalid or unavailable", () => {
  assert.deepEqual(
    readHubPreferences(memoryStorage({ "mlp.theme": "sepia" })),
    DEFAULT_HUB_PREFERENCES,
  );
  assert.deepEqual(readHubPreferences(null), DEFAULT_HUB_PREFERENCES);
});

test("persists only supported shell preferences", () => {
  const storage = memoryStorage();

  assert.equal(persistHubPreference(storage, "theme", "light"), true);
  assert.equal(persistHubPreference(storage, "density", "relaxed"), false);
  assert.equal(persistHubPreference(storage, "theme", "sepia"), false);
  assert.deepEqual(readHubPreferences(storage), { theme: "light", sidebarCollapsed: false, sidebarWidth: 232 });
});


test("sidebar collapse survives reload and can be explicitly expanded", () => {
  const storage = memoryStorage();
  assert.equal(persistHubPreference(storage, "sidebarCollapsed", true), true);
  assert.equal(readHubPreferences(storage).sidebarCollapsed, true);
  assert.equal(persistHubPreference(storage, "sidebarCollapsed", false), true);
  assert.equal(readHubPreferences(storage).sidebarCollapsed, false);
  assert.equal(persistHubPreference(storage, "sidebarCollapsed", "true"), false);
  assert.equal(readHubPreferences(memoryStorage({ "mlp.sidebarCollapsed": "invalid" })).sidebarCollapsed, false);
});

test("dragged sidebar width survives reload and stays inside the usable range", () => {
  const storage = memoryStorage();
  assert.equal(persistHubPreference(storage, "sidebarWidth", 288), true);
  assert.equal(readHubPreferences(storage).sidebarWidth, 288);
  // 범위 밖·정수 아닌 값은 저장하지 않는다 — 다음 로드에서 사이드바가 사라지거나 본문을 덮으면 안 된다.
  assert.equal(persistHubPreference(storage, "sidebarWidth", SIDEBAR_WIDTH.max + 1), false);
  assert.equal(persistHubPreference(storage, "sidebarWidth", SIDEBAR_WIDTH.min - 1), false);
  assert.equal(persistHubPreference(storage, "sidebarWidth", 250.5), false);
  assert.equal(persistHubPreference(storage, "sidebarWidth", "288"), false);
  assert.equal(readHubPreferences(storage).sidebarWidth, 288);
  // 손으로 고친 저장값도 읽을 때 범위로 되돌린다.
  assert.equal(readHubPreferences(memoryStorage({ "mlp.sidebarWidth": "9999" })).sidebarWidth, SIDEBAR_WIDTH.max);
  assert.equal(readHubPreferences(memoryStorage({ "mlp.sidebarWidth": "12" })).sidebarWidth, SIDEBAR_WIDTH.min);
  assert.equal(readHubPreferences(memoryStorage({ "mlp.sidebarWidth": "wide" })).sidebarWidth, SIDEBAR_WIDTH.default);
  assert.equal(readHubPreferences(memoryStorage({ "mlp.sidebarWidth": "" })).sidebarWidth, SIDEBAR_WIDTH.default);
});

test("sidebar width clamps drag positions and answers the splitter keys", () => {
  assert.equal(SIDEBAR_WIDTH.default, 232, "기본 폭은 드래그 기능 이전의 고정 폭과 같다");
  assert.ok(SIDEBAR_WIDTH.min < SIDEBAR_WIDTH.default && SIDEBAR_WIDTH.default < SIDEBAR_WIDTH.max);
  assert.equal(clampSidebarWidth(232 + 40.4), 272);
  assert.equal(clampSidebarWidth(-500), SIDEBAR_WIDTH.min);
  assert.equal(clampSidebarWidth(5000), SIDEBAR_WIDTH.max);
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_WIDTH.default);

  assert.equal(nextSidebarWidth(232, "ArrowRight"), 232 + SIDEBAR_WIDTH.step);
  assert.equal(nextSidebarWidth(232, "ArrowLeft"), 232 - SIDEBAR_WIDTH.step);
  assert.equal(nextSidebarWidth(SIDEBAR_WIDTH.min, "ArrowLeft"), SIDEBAR_WIDTH.min);
  assert.equal(nextSidebarWidth(SIDEBAR_WIDTH.max, "ArrowRight"), SIDEBAR_WIDTH.max);
  assert.equal(nextSidebarWidth(260, "Home"), SIDEBAR_WIDTH.min);
  assert.equal(nextSidebarWidth(260, "End"), SIDEBAR_WIDTH.max);
  assert.equal(nextSidebarWidth(260, "Enter"), null, "처리하지 않는 키는 기본 동작을 막지 않도록 null");
});

test("blocked storage never prevents sidebar interaction", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readHubPreferences(storage), DEFAULT_HUB_PREFERENCES);
  assert.equal(persistHubPreference(storage, "sidebarCollapsed", true), false);
  assert.equal(persistHubPreference(storage, "sidebarWidth", 280), false);
});

test("automatic theme follows local morning and evening boundaries; explicit choices win", () => {
  for (const [hour, minute, expected] of [[6, 59, "dark"], [7, 0, "light"], [17, 59, "light"], [18, 0, "dark"], [0, 0, "dark"]]) {
    const now = new Date(2026, 8, 21, hour, minute);
    assert.equal(resolveHubTheme("auto", now), expected);
    assert.equal(resolveHubTheme("light", now), "light");
    assert.equal(resolveHubTheme("dark", now), "dark");
  }
  const storage = memoryStorage();
  assert.equal(persistHubPreference(storage, "theme", "auto"), true);
  assert.equal(readHubPreferences(storage).theme, "auto");
});

test("open tabs switch at boundaries, recover after sleep, and clean up subscriptions", () => {
  let current = new Date(2026, 8, 21, 17, 59);
  let scheduled;
  let delay;
  const themes = [];
  const listeners = new Map();
  const target = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  let cancelled = false;
  const stop = watchHubTheme("auto", value => themes.push(value), {
    now: () => current,
    schedule: (fn, ms) => { scheduled = fn; delay = ms; return 1; },
    cancel: () => { cancelled = true; },
    target, documentTarget: target,
  });
  assert.equal(themes.at(-1), "light");
  assert.equal(delay, 60_000);
  current = new Date(2026, 8, 21, 18);
  scheduled();
  assert.equal(themes.at(-1), "dark");
  assert.equal(delay, 13 * 60 * 60 * 1000);
  current = new Date(2026, 8, 22, 9);
  listeners.get("visibilitychange")();
  assert.equal(themes.at(-1), "light");
  stop();
  assert.equal(cancelled, true);
  assert.equal(listeners.size, 0);
});
