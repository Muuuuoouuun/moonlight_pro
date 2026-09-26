#!/usr/bin/env node
// Gradle 빌드 래퍼: node scripts/gradle-build.mjs assembleDebug assembleRelease [--allow-placeholder]
// 빌드 전에 동기화된 설정(android/app/src/main/assets/capacitor.config.json)의 허브 주소를 확인한다.
// placeholder 주소면 --allow-placeholder 없이는 멈춘다. JAVA_HOME(JDK 17)·ANDROID_HOME 은 환경에서 읽는다.
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { HUB_CONFIG_XML_PATH, PLACEHOLDER_HUB_URL, SHORTCUTS_XML_PATH } from "./write-cap-config.mjs";

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
const serverUrl = JSON.parse(readFileSync(syncedConfigPath, "utf8"))?.server?.url;
if (!serverUrl || serverUrl === PLACEHOLDER_HUB_URL) {
  if (!allowPlaceholder) {
    console.error(
      "[moonlight-android] 동기화된 허브 주소가 placeholder 입니다. app.config.json 을 고치고 app:android:sync 후 다시 빌드하세요.\n" +
        "  개발용 APK만 필요하면 --allow-placeholder 를 붙입니다.",
    );
    process.exit(1);
  }
  console.warn("[moonlight-android] 경고: placeholder 주소로 빌드합니다. 이 APK는 허브에 연결되지 않습니다.");
}
// App Links host(hub_config.xml)·바로가기 URL(shortcuts.xml)도 같은 동기화에서 나온 값이어야 한다
// (주소를 바꾸고 sync 를 빠뜨린 경우를 막는다).
const readGenerated = (path) => (existsSync(join(APP_DIR, path)) ? readFileSync(join(APP_DIR, path), "utf8") : "");
const generatedChecks = [
  [HUB_CONFIG_XML_PATH, `<string name="hub_origin" translatable="false">${serverUrl}</string>`],
  [SHORTCUTS_XML_PATH, `android:data="${serverUrl}/`],
];
for (const [path, expected] of generatedChecks) {
  if (serverUrl && !readGenerated(path).includes(expected)) {
    console.error(
      `[moonlight-android] ${path} 가 없거나 동기화된 허브 주소(${serverUrl})와 다릅니다. npm run app:android:sync 를 다시 실행하세요.`,
    );
    process.exit(1);
  }
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
