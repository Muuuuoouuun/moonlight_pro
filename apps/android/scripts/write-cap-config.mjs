#!/usr/bin/env node
// app.config.json(허브 주소의 유일한 정본) → capacitor.config.json 생성.
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
  console.log(`[moonlight-android] capacitor.config.json ← server.url=${hubUrl}`);
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
