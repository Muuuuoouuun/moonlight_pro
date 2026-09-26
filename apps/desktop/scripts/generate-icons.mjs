// 허브 아이콘(apps/hub/public/icon-512.png)으로 Windows용 build/icon.ico를 만든다.
// 크기: 256 · 128 · 64 · 48 · 32 · 16. 512에서 바로 16으로 줄이면 선이 깨지므로
// 절반씩 단계적으로 줄인다. 결과 .ico는 커밋해 두어 빌드가 이 스크립트에 기대지 않는다.
import { mkdirSync, writeFileSync } from "node:fs";
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
