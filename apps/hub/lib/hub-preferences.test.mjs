import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DEFAULT_HUB_PREFERENCES,
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

  assert.deepEqual(DEFAULT_HUB_PREFERENCES, { theme: "auto", sidebarCollapsed: false });
  assert.deepEqual(readHubPreferences(storage), { theme: "light", sidebarCollapsed: false });
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
  assert.deepEqual(readHubPreferences(storage), { theme: "light", sidebarCollapsed: false });
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

test("blocked storage never prevents sidebar interaction", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readHubPreferences(storage), DEFAULT_HUB_PREFERENCES);
  assert.equal(persistHubPreference(storage, "sidebarCollapsed", true), false);
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
