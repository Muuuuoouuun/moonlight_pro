#!/usr/bin/env node
// 런처 아이콘(적응형)·스플래시를 허브의 기존 아이콘에서 다시 만든다. 새 아이콘을 그리지 않는다.
//   원본: apps/hub/public/icon-maskable-512.png — 바탕이 이미 #141C27 전면이고 글리프가 안전 영역 안에 있어
//         적응형 아이콘 마스크(원·스쿼클)에 잘려도 테두리가 겹치지 않는다. (icon-512.png 는 자체 둥근 타일과
//         1px 테두리를 가져, 적응형 전경으로 쓰면 마스크 안에 타일이 한 겹 더 보인다.)
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
  copyFileSync(join(HUB_PUBLIC, "icon-maskable-512.png"), join(assetDir, "logo.png"));
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
