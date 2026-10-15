#!/usr/bin/env node
// Gradle 빌드 래퍼: node scripts/gradle-build.mjs assembleDebug assembleRelease [--allow-placeholder]
// 빌드 전에 동기화된 설정(android/app/src/main/assets/capacitor.config.json)의 허브 주소를 확인한다.
// placeholder 주소면 --allow-placeholder 없이는 멈춘다. JAVA_HOME(JDK 17)·ANDROID_HOME 은 환경에서 읽는다.
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { HUB_CONFIG_XML_PATH, PLACEHOLDER_HUB_URL, SHORTCUTS_XML_PATH, validateSyncedHubConfig } from "./write-cap-config.mjs";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID_DIR = join(APP_DIR, "android");
const argv = process.argv.slice(2);
const allowPlaceholder = argv.includes("--allow-placeholder");
const tasks = argv.filter((arg) => !arg.startsWith("--"));

const syncedConfigPath = join(ANDROID_DIR, "app", "src", "main", "assets", "capacitor.config.json");
if (!existsSync(syncedConfigPath)) {
  console.error("[moonlight-android] 동기화된 설정이 없습니다. 먼저 npm run app:android:sync 를 실행하세요.");
  process.exit(1);
}
// Check app.config.json as well as the generated files before invoking Gradle.
// An old sync may agree with itself while still targeting the wrong Hub.
const readGenerated = (path) => (existsSync(join(APP_DIR, path)) ? readFileSync(join(APP_DIR, path), "utf8") : "");
let serverUrl;
try {
  const appConfig = JSON.parse(readFileSync(join(APP_DIR, "app.config.json"), "utf8"));
  const syncedConfig = JSON.parse(readFileSync(syncedConfigPath, "utf8"));
  serverUrl = validateSyncedHubConfig({
    rawHubUrl: appConfig.hubUrl,
    syncedServerUrl: syncedConfig?.server?.url,
    hubConfigXml: readGenerated(HUB_CONFIG_XML_PATH),
    shortcutsXml: readGenerated(SHORTCUTS_XML_PATH),
  }, { allowPlaceholder });
} catch (error) {
  console.error(`[moonlight-android] ${error.message}`);
  process.exit(1);
}
if (serverUrl === PLACEHOLDER_HUB_URL) {
  console.warn("[moonlight-android] 경고: placeholder 주소로 빌드합니다. 이 APK는 허브에 연결되지 않습니다.");
}
if (!existsSync(join(APP_DIR, "keystore.properties"))) {
  console.warn("[moonlight-android] keystore.properties 가 없어 release APK는 서명 없이 만들어집니다.");
}

const isWindows = process.platform === "win32";
// Windows 의 .bat 은 셸로만 실행된다(Node 보안 정책) — 공백 있는 경로를 위해 전체 경로를 따옴표로 감싼다.
const gradlew = isWindows ? `"${join(ANDROID_DIR, "gradlew.bat")}"` : "./gradlew";
const result = spawnSync(gradlew, [...(tasks.length ? tasks : ["assembleDebug"]), "--console=plain"], {
  cwd: ANDROID_DIR,
  stdio: "inherit",
  shell: isWindows,
});
if (result.status !== 0) process.exit(result.status ?? 1);

const outputs = [
  ["debug", "app-debug.apk"],
  ["release", "app-release.apk"],
  ["release", "app-release-unsigned.apk"],
];
for (const [type, name] of outputs) {
  const apk = join(ANDROID_DIR, "app", "build", "outputs", "apk", type, name);
  if (existsSync(apk)) {
    const mb = (statSync(apk).size / 1024 / 1024).toFixed(2);
    console.log(`[moonlight-android] ${relative(APP_DIR, apk)} (${mb} MB)`);
  }
}
