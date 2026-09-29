import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "apps/hub/public");
const source = await readFile(resolve(publicDir, "icon.svg"));

async function png(size) {
  return sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
}

for (const size of [192, 512]) {
  await writeFile(resolve(publicDir, `icon-${size}.png`), await png(size));
}

// Full-bleed background and a smaller mark keep the entire symbol inside the
// safe area when Android applies a circular or squircle mask.
const maskableSource = source.toString()
  .replace('<rect width="64" height="64" rx="14" fill="#141C27"/>', '')
  .replace(/\s*<rect x="0\.5" y="0\.5"[^>]+\/>/, '');
const mark = await sharp(Buffer.from(maskableSource), { density: 384 })
  .resize(400, 400).png().toBuffer();
const fullBleed = sharp({ create: { width: 512, height: 512, channels: 4, background: "#141C27" } })
  .composite([{ input: mark, gravity: "centre" }]);
const maskable = await fullBleed.png().toBuffer();
await writeFile(resolve(publicDir, "icon-maskable-512.png"), maskable);
await writeFile(resolve(publicDir, "apple-touch-icon.png"), await sharp(maskable).resize(180, 180).png().toBuffer());

// ICO is a directory of PNGs. Browsers that ignore SVG can pick the native
// size without a blurred enlargement of the 16px art.
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
