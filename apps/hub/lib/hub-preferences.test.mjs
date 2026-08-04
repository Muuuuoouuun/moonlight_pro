import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

  assert.deepEqual(DEFAULT_HUB_PREFERENCES, { theme: "dark" });
  assert.deepEqual(readHubPreferences(storage), { theme: "light" });
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
  assert.deepEqual(readHubPreferences(storage), { theme: "light" });
});
