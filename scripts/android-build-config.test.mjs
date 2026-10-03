import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCapacitorConfig, buildHubConfigXml, buildShortcutsXml,
  HUB_CONFIG_XML_PATH, SHORTCUTS_XML_PATH, validateSyncedHubConfig,
} from "../apps/android/scripts/write-cap-config.mjs";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const currentHub = "https://moonlight-current.example";
const previousHub = "https://moonlight-previous.example";
const syncedInput = (hubUrl = currentHub) => ({
  rawHubUrl: hubUrl,
  syncedServerUrl: hubUrl,
  hubConfigXml: buildHubConfigXml(hubUrl),
  shortcutsXml: buildShortcutsXml(hubUrl),
});

test("Android build accepts a fully synchronized current Hub including a custom HTTPS port", () => {
  assert.equal(validateSyncedHubConfig(syncedInput()), currentHub);
  const customHub = `${currentHub}:8443`;
  assert.equal(validateSyncedHubConfig(syncedInput(customHub)), customHub);
});

// Regression: changing the app address without sync previously built the old Hub.
test("Android build rejects an old internally consistent sync after app.config changes", () => {
  assert.throws(() => validateSyncedHubConfig({ ...syncedInput(previousHub), rawHubUrl: currentHub }), /app.config.json/);
});

test("Android build rejects missing or mismatched synchronized assets", () => {
  for (const syncedServerUrl of [undefined, "", previousHub]) {
    assert.throws(() => validateSyncedHubConfig({ ...syncedInput(), syncedServerUrl }), /app.config.json/);
  }
});

test("Android build rejects stale or absent App Links resources", () => {
  for (const hubConfigXml of ["", buildHubConfigXml(previousHub)]) {
    assert.throws(() => validateSyncedHubConfig({ ...syncedInput(), hubConfigXml }), /hub_config.xml/);
  }
});

test("Android build verifies every launcher shortcut destination", () => {
  const shortcutsXml = buildShortcutsXml(currentHub).replace(`${currentHub}/dashboard/revenue/followups`, `${previousHub}/dashboard/revenue/followups`);
  assert.throws(() => validateSyncedHubConfig({ ...syncedInput(), shortcutsXml }), /shortcuts.xml/);
});

test("Android placeholder opt-in still requires all generated files to agree", () => {
  const placeholder = "https://moonlight.invalid";
  assert.throws(() => validateSyncedHubConfig(syncedInput(placeholder)), /placeholder/);
  assert.equal(validateSyncedHubConfig(syncedInput(placeholder), { allowPlaceholder: true }), placeholder);
  assert.throws(() => validateSyncedHubConfig({ ...syncedInput(), rawHubUrl: placeholder }, { allowPlaceholder: true }), /app.config.json/);
});

test("Android build keeps HTTPS and origin-only configuration requirements", () => {
  for (const rawHubUrl of ["http://moonlight-current.example", `${currentHub}/dashboard`, `${currentHub}?text=input`, ""]) {
    assert.throws(() => validateSyncedHubConfig({ ...syncedInput(), rawHubUrl }));
  }
  const config = buildCapacitorConfig(currentHub);
  assert.equal(config.server.cleartext, false);
  assert.equal(config.android.allowMixedContent, false);
});

test("Android Gradle wrapper stops before Gradle when the current Hub was not synchronized", (t) => {
  const appDir = mkdtempSync(join(tmpdir(), "moonlight-android-build-"));
  t.after(() => rmSync(appDir, { recursive: true, force: true }));
  mkdirSync(join(appDir, "scripts"), { recursive: true });
  for (const script of ["write-cap-config.mjs", "gradle-build.mjs"]) {
    copyFileSync(join(repo, "apps/android/scripts", script), join(appDir, "scripts", script));
  }
  const write = (path, text) => {
    mkdirSync(dirname(join(appDir, path)), { recursive: true });
    writeFileSync(join(appDir, path), text);
  };
  write("app.config.json", JSON.stringify({ hubUrl: currentHub }));
  write("android/app/src/main/assets/capacitor.config.json", JSON.stringify(buildCapacitorConfig(previousHub)));
  write(HUB_CONFIG_XML_PATH, buildHubConfigXml(previousHub));
  write(SHORTCUTS_XML_PATH, buildShortcutsXml(previousHub));
  const result = spawnSync(process.execPath, [join(appDir, "scripts/gradle-build.mjs"), "assembleDebug"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /app.config.json.*app:android:sync/);
  assert.doesNotMatch(result.stderr, /keystore.properties/);
});
