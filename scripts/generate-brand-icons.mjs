import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// 앱 아이콘 원본은 Codex 이미지 생성으로 만든 1024px 타일이다(2026-10-21). icon.svg는 선 마크로 남아
// 데스크톱 메뉴 막대 템플릿·안드로이드 자산이 계속 쓴다.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "apps/hub/public");
const source = resolve(root, "design-system/icons/moonlight-app-icon.webp");

async function png(size) {
  return sharp(source).resize(size, size).png().toBuffer();
}

for (const size of [192, 512]) {
  await writeFile(resolve(publicDir, `icon-${size}.png`), await png(size));
}

// Full-bleed: 타일 둥근 모서리 밖을 타일 가장자리 색으로 채워 Android 원형·스퀘어클 마스크와
// iOS 자체 라운딩이 투명 모서리를 드러내지 않게 한다. 기호는 타일 가운데 60% 안이라 안전 영역(80%) 안이다.
const { data: edge } = await sharp(source).extract({ left: 512, top: 24, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const fullBleed = sharp({ create: { width: 512, height: 512, channels: 4, background: { r: edge[0], g: edge[1], b: edge[2], alpha: 1 } } })
  .composite([{ input: await png(512) }]);
const maskable = await fullBleed.png().toBuffer();
await writeFile(resolve(publicDir, "icon-maskable-512.png"), maskable);
await writeFile(resolve(publicDir, "apple-touch-icon.png"), await sharp(maskable).resize(180, 180).png().toBuffer());

// ICO is a directory of PNGs — each size is resized from the master, not from a 16px enlargement.
const icoSizes = [16, 32, 48, 64];
const images = await Promise.all(icoSizes.map(png));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(icoSizes[index], entry);
  header.writeUInt8(icoSizes[index], entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(resolve(publicDir, "favicon.ico"), Buffer.concat([header, ...images]));
