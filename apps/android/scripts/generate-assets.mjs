#!/usr/bin/env node
// 런처 아이콘(적응형)·스플래시를 허브의 기존 아이콘에서 다시 만든다. 새 아이콘을 그리지 않는다.
//   원본: apps/hub/public/icon-512.png — 둥근 앱 타일(2026-10-21 Codex 생성, 테두리 없음). 적응형 아이콘은 전경을
//         16.7% 안쪽에 두어 타일이 보이는 영역을 꽉 채우고, 원·스쿼클 마스크는 타일 모서리 곡선 안쪽을 자른다.
//         스플래시는 #141C27 바탕 위 둥근 타일이다. (icon-maskable-512.png 는 모서리까지 칠한 정사각형이라
//         스플래시에서 네모 판으로 보인다.)
//   결과: android/app/src/main/res/{mipmap-*,drawable*} — 생성물을 그대로 커밋한다.
// @capacitor/assets 는 sharp(네이티브 바이너리)를 끌고 오므로 저장소 의존성에 넣지 않고 고정 버전을 npx 로 부른다.
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const HUB_PUBLIC = join(APP_DIR, "..", "hub", "public");
const BACKGROUND = "#141C27";

// @capacitor/assets 는 --assetPath 를 프로젝트 루트 기준 상대 경로로만 읽는다.
const ASSET_REL = ".assets-tmp";
const assetDir = join(APP_DIR, ASSET_REL);
try {
  mkdirSync(assetDir, { recursive: true });
  copyFileSync(join(HUB_PUBLIC, "icon-512.png"), join(assetDir, "logo.png"));
  const args = [
    "-y",
    "@capacitor/assets@3.0.5",
    "generate",
    "--android",
    "--assetPath", ASSET_REL,
    "--iconBackgroundColor", BACKGROUND,
    "--iconBackgroundColorDark", BACKGROUND,
    "--splashBackgroundColor", BACKGROUND,
    "--splashBackgroundColorDark", BACKGROUND,
  ];
  const result = spawnSync("npx", args, { cwd: APP_DIR, stdio: "inherit", shell: process.platform === "win32" });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(assetDir, { recursive: true, force: true });
}
