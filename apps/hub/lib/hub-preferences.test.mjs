import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_HUB_PREFERENCES,
  persistHubPreference,
  readHubPreferences,
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

test("keeps the server and first client render deterministic before restoring saved preferences", () => {
  const storage = memoryStorage({ "mlp.theme": "light", "mlp.density": "compact" });

  assert.deepEqual(DEFAULT_HUB_PREFERENCES, { density: "default", theme: "dark" });
  assert.deepEqual(readHubPreferences(storage), { density: "compact", theme: "light" });
});

test("falls back safely when stored preferences are invalid or unavailable", () => {
  assert.deepEqual(
    readHubPreferences(memoryStorage({ "mlp.theme": "sepia", "mlp.density": "dense" })),
    DEFAULT_HUB_PREFERENCES,
  );
  assert.deepEqual(readHubPreferences(null), DEFAULT_HUB_PREFERENCES);
});

test("persists only supported shell preferences", () => {
  const storage = memoryStorage();

  assert.equal(persistHubPreference(storage, "theme", "light"), true);
  assert.equal(persistHubPreference(storage, "density", "relaxed"), true);
  assert.equal(persistHubPreference(storage, "theme", "sepia"), false);
  assert.deepEqual(readHubPreferences(storage), { density: "relaxed", theme: "light" });
});
