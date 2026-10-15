#!/usr/bin/env node
// app.config.json(허브 주소의 유일한 정본) → capacitor.config.json · www/hub-config.js ·
// android/app/src/main/res/values/hub_config.xml(App Links host) · res/xml/shortcuts.xml(런처 바로가기 URL) 생성.
// 허브 host 를 쓰는 네이티브 설정은 모두 이 생성물이므로 주소는 app.config.json 한 곳에서만 바뀐다.
//   node scripts/write-cap-config.mjs                   설정만 쓴다
//   node scripts/write-cap-config.mjs --sync            쓰고 `cap sync android`까지
//   ... --allow-placeholder                             placeholder 주소를 허용(개발 빌드 전용)
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLACEHOLDER_HUB_URL = "https://moonlight.invalid";
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export function parseHubUrl(raw, { allowPlaceholder = false } = {}) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("app.config.json 의 hubUrl 이 비어 있습니다.");
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`hubUrl 을 URL로 읽을 수 없습니다: ${raw}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`hubUrl 은 https 만 허용합니다: ${raw}`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`hubUrl 에는 경로·쿼리 없이 origin만 적습니다 (예: https://hub.example.com): ${raw}`);
  }
  const origin = url.origin;
  if (origin === PLACEHOLDER_HUB_URL && !allowPlaceholder) {
    throw new Error(
      [
        "허브 주소가 아직 placeholder(https://moonlight.invalid)입니다.",
        "apps/android/app.config.json 의 hubUrl 을 실제 배포 주소로 바꾼 뒤 다시 실행하세요.",
        "개발 빌드만 필요하면 --allow-placeholder 를 붙입니다.",
      ].join("\n"),
    );
  }
  return origin;
}

export function buildCapacitorConfig(hubUrl) {
  return {
    appId: "app.moonlight.hub",
    appName: "Moonlight",
    webDir: "www",
    backgroundColor: "#141C27",
    server: {
      url: hubUrl,
      androidScheme: "https",
      cleartext: false,
      // 원격 허브를 못 열면(주소 미설정·오프라인) 번들된 www/index.html 을 보여 준다.
      errorPath: "index.html",
    },
    android: {
      allowMixedContent: false,
    },
    plugins: {
      // Capacitor 8 코어 SystemBars: DARK = 어두운 바탕 위 밝은 아이콘.
      // 허브는 viewport-fit=cover 를 쓰지 않으므로 WebView가 상태바 아래에서 시작하고,
      // 상태바 뒤 면은 styles.xml 의 windowBackground(#141C27)가 칠한다.
      SystemBars: {
        style: "DARK",
      },
    },
  };
}

// 런처 바로가기(아이콘 길게 누르기). 라벨·아이콘은 커밋된 리소스이고, 허브 URL 만 여기서 채운다.
// shortcuts.xml 의 intent android:data 는 @string 참조를 쓸 수 없다 — 시스템(ShortcutParser)이 앱이 아니라
// 시스템 리소스로 풀어 빈 값이 된다(2026-09-26 에뮬레이터 dumpsys 실측). 그래서 파일 전체를 생성한다.
export const SHORTCUTS = [
  { id: "capture", path: "/dashboard/home" },
  { id: "followups", path: "/dashboard/revenue/followups" },
  { id: "rhythm", path: "/dashboard/work/rhythm" },
];

const GENERATED_NOTE = "<!-- 생성물 — scripts/write-cap-config.mjs 가 app.config.json 에서 쓴다. 직접 고치지 않는다. -->";

function xmlText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Android 문자열 리소스: XML 이스케이프 + 따옴표·아포스트로피는 백슬래시.
function androidString(value) {
  return xmlText(value).replace(/&quot;/g, '\\"').replace(/'/g, "\\'");
}

// App Links intent-filter 의 android:host 가 참조하는 생성 리소스(매니페스트는 앱 리소스로 풀리므로 참조가 된다).
// android:host 에는 포트를 적지 않으므로 hostname 을 쓴다(허브 주소는 https 기본 포트만 쓴다).
export function buildHubConfigXml(hubUrl) {
  const strings = [
    ["hub_origin", hubUrl],
    ["hub_host", new URL(hubUrl).hostname],
  ];
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    GENERATED_NOTE,
    "<resources>",
    ...strings.map(([name, value]) => `    <string name="${name}" translatable="false">${androidString(value)}</string>`),
    "</resources>",
    "",
  ].join("\n");
}

// 각 바로가기는 허브 전체 URL 의 ACTION_VIEW 라서 App Links·공유와 같은 MainActivity 경로(onNewIntent)로 열린다.
// targetClass 를 적어 두므로 App Links 검증 전에도 브라우저 선택 창 없이 이 앱으로 간다.
export function buildShortcutsXml(hubUrl) {
  const entries = SHORTCUTS.map(({ id, path }) =>
    [
      "    <shortcut",
      `        android:shortcutId="${id}"`,
      '        android:enabled="true"',
      `        android:icon="@drawable/ic_shortcut_${id}"`,
      `        android:shortcutShortLabel="@string/shortcut_${id}_short"`,
      `        android:shortcutLongLabel="@string/shortcut_${id}_long">`,
      "        <intent",
      '            android:action="android.intent.action.VIEW"',
      `            android:data="${xmlText(`${hubUrl}${path}`)}"`,
      '            android:targetPackage="app.moonlight.hub"',
      '            android:targetClass="app.moonlight.hub.MainActivity" />',
      "    </shortcut>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    GENERATED_NOTE,
    '<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">',
    ...entries,
    "</shortcuts>",
    "",
  ].join("\n");
}

// A build must use the current address, not an older internally consistent sync.
// Compare the complete generated resources so a single matching shortcut cannot
// hide other stale destinations. This check never writes configuration.
export function validateSyncedHubConfig(
  { rawHubUrl, syncedServerUrl, hubConfigXml, shortcutsXml },
  { allowPlaceholder = false } = {},
) {
  const currentHubUrl = parseHubUrl(rawHubUrl, { allowPlaceholder });
  if (syncedServerUrl !== currentHubUrl) {
    throw new Error("동기화된 허브 주소가 현재 app.config.json과 다릅니다. npm run app:android:sync 를 다시 실행하세요.");
  }
  if (String(hubConfigXml || "").trim() !== buildHubConfigXml(currentHubUrl).trim()) {
    throw new Error("hub_config.xml 이 현재 허브 주소와 다릅니다. npm run app:android:sync 를 다시 실행하세요.");
  }
  if (String(shortcutsXml || "").trim() !== buildShortcutsXml(currentHubUrl).trim()) {
    throw new Error("shortcuts.xml 이 현재 허브 주소와 다릅니다. npm run app:android:sync 를 다시 실행하세요.");
  }
  return currentHubUrl;
}

const RES_DIR = join("android", "app", "src", "main", "res");
export const HUB_CONFIG_XML_PATH = join(RES_DIR, "values", "hub_config.xml");
export const SHORTCUTS_XML_PATH = join(RES_DIR, "xml", "shortcuts.xml");

function main(argv) {
  const allowPlaceholder = argv.includes("--allow-placeholder");
  const sync = argv.includes("--sync");
  const appConfig = JSON.parse(readFileSync(join(APP_DIR, "app.config.json"), "utf8"));
  let hubUrl;
  try {
    hubUrl = parseHubUrl(appConfig.hubUrl, { allowPlaceholder });
  } catch (error) {
    console.error(`\n[moonlight-android] ${error.message}\n`);
    process.exit(1);
  }
  if (hubUrl === PLACEHOLDER_HUB_URL) {
    console.warn("[moonlight-android] 경고: placeholder 주소로 설정을 씁니다. 이 APK는 허브에 연결되지 않습니다.");
  }
  const config = buildCapacitorConfig(hubUrl);
  writeFileSync(join(APP_DIR, "capacitor.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  // 대체 화면(www/index.html)이 "주소 미설정"과 "연결 실패"를 가르도록 같은 값을 생성물로 넘긴다.
  writeFileSync(
    join(APP_DIR, "www", "hub-config.js"),
    `// 생성물 — scripts/write-cap-config.mjs 가 app.config.json 에서 쓴다. 직접 고치지 않는다.\nwindow.MOONLIGHT_HUB_URL = ${JSON.stringify(hubUrl)};\n`,
  );
  writeFileSync(join(APP_DIR, HUB_CONFIG_XML_PATH), buildHubConfigXml(hubUrl));
  writeFileSync(join(APP_DIR, SHORTCUTS_XML_PATH), buildShortcutsXml(hubUrl));
  console.log(`[moonlight-android] capacitor.config.json · hub_config.xml · shortcuts.xml ← server.url=${hubUrl}`);
  if (!sync) return;
  const result = spawnSync("npx", ["cap", "sync", "android"], {
    cwd: APP_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const samePath = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
if (invokedPath && samePath(fileURLToPath(import.meta.url), invokedPath)) {
  main(process.argv.slice(2));
}
