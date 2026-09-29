// 허브 아이콘으로 앱 아이콘 자산을 만든다. 결과물은 전부 커밋해 두어 빌드가 이 스크립트에 기대지 않는다.
//  - Windows: apps/hub/public/icon-512.png → build/icon.ico. 크기 256 · 128 · 64 · 48 · 32 · 16.
//    512에서 바로 16으로 줄이면 선이 깨지므로 절반씩 단계적으로 줄인다.
//  - macOS: apps/hub/public/icon.svg → build/icon.icns + build/icon-dock.png (macOS 안에서만: sips 없이 sharp가 벡터를 크기별로 그리고
//    iconutil이 묶는다) + 메뉴 막대 템플릿 build/trayTemplate.png(16px)·trayTemplate@2x.png(32px, 검정+투명).
//    macOS 조각은 sharp가 설치돼 있을 때만 만든다(허브 의존성으로 루트 node_modules에 함께 들어온다).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { imagesToIco } from "png-to-ico";
import { readPNG, resize } from "png-to-ico/lib/png.js";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "hub", "public", "icon-512.png");
const target = join(here, "..", "build", "icon.ico");

const png = await readPNG(source);
if (png.width !== 512 || png.height !== 512) {
  throw new Error(`icon-512.png must be 512x512, got ${png.width}x${png.height}`);
}

const byHalf = new Map();
let current = png;
for (const size of [256, 128, 64, 32, 16]) {
  current = resize(current, size, size);
  byHalf.set(size, current);
}
const icon48 = resize(byHalf.get(64), 48, 48);

// ICO 디렉터리는 큰 것부터 둔다 — 탐색기가 첫 항목을 기본 표시에 쓴다.
const images = [256, 128, 64, 48, 32, 16].map((size) => (size === 48 ? icon48 : byHalf.get(size)));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, imagesToIco(images));
console.log(`icon.ico written: ${target} (${images.map((img) => img.width).join(", ")})`);

// ── macOS 자산 ────────────────────────────────────────────────────────────
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("sharp not found — skipped icon.icns and trayTemplate*.png (run npm install at the repo root)");
}

if (sharp) {
  const svgSource = join(here, "..", "..", "hub", "public", "icon.svg");
  const buildDir = join(here, "..", "build");

  // 메뉴 막대 템플릿: 초승달 + 반짝이(icon.svg와 같은 도형)를 검정 한 색으로. 알파가 모양이고 색은 시스템이 칠한다.
  // viewBox를 도형 범위(약 10–52)에 맞춰 16px 안에서 꽉 차게 한다.
  const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="7 7 50 50">
  <defs><mask id="crescent"><rect width="64" height="64" fill="#fff"/><circle cx="40" cy="23" r="19" fill="#000"/></mask></defs>
  <circle cx="31" cy="32" r="21" fill="#000" mask="url(#crescent)"/>
  <path d="M46 11 48.3 16.2l5.2 2.3-5.2 2.3L46 26l-2.3-5.2-5.2-2.3 5.2-2.3z" fill="#000"/>
</svg>`;
  for (const [name, size] of [["trayTemplate.png", 16], ["trayTemplate@2x.png", 32]]) {
    await sharp(Buffer.from(traySvg), { density: 384 }).resize(size, size).png().toFile(join(buildDir, name));
  }
  console.log("trayTemplate.png / trayTemplate@2x.png written");

  if (process.platform === "darwin") {
    // 앱 아이콘: macOS 규격은 1024 캔버스 안에 824px 본체(가장자리 100px 여백)다 — 여백 없이 꽉 채우면 다른 Dock 아이콘보다 커 보인다.
    const scratch = mkdtempSync(join(tmpdir(), "moonlight-iconset-"));
    const iconset = join(scratch, "icon.iconset");
    mkdirSync(iconset);
    const body = Math.round(1024 * 0.8047);
    const rendered = await sharp(svgSource, { density: 1152 }).resize(body, body).png().toBuffer();
    const canvas = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: rendered, gravity: "center" }])
      .png()
      .toBuffer();
    for (const size of [16, 32, 128, 256, 512]) {
      await sharp(canvas).resize(size, size).png().toFile(join(iconset, `icon_${size}x${size}.png`));
      await sharp(canvas).resize(size * 2, size * 2).png().toFile(join(iconset, `icon_${size}x${size}@2x.png`));
    }
    // 개발 실행(electron .)의 Dock 아이콘용 — nativeImage는 .icns를 읽지 못해 PNG가 따로 필요하다.
    await sharp(canvas).resize(512, 512).png().toFile(join(buildDir, "icon-dock.png"));
    const icns = join(buildDir, "icon.icns");
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", icns]);
    rmSync(scratch, { recursive: true, force: true });
    console.log(`icon.icns written: ${icns}`);
  }
}
