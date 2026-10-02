#!/usr/bin/env node
// 펫 자산 생성 — prototypes/moonlight-pet-macos 의 원본 PNG 에서 Windows 펫이 쓰는 작은 자산을 만든다.
//   portrait-<key>.png : 원본 얼굴(dark 는 pet-dark-straight.png)을 224px 정사각으로
//   cutout-<key>.png   : 투명 아틀라스에서 contract.SOURCE_ASSETS 의 crop 을 잘라 높이 216px 로
// 원본은 건드리지 않는다. 결과는 파일마다 120KB 이하여야 한다(넘으면 팔레트 PNG 로 다시 줄이고, 그래도 넘으면 실패).
//
//   node apps/desktop/scripts/pet-assets.mjs [--check]
//
// sharp 가 풀리면(루트 node_modules) sharp 로, 아니면 Electron nativeImage 로 만든다(오프스크린, 창 없음).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const repo = path.resolve(desktop, '..', '..');
const SRC = path.join(repo, 'prototypes', 'moonlight-pet-macos', 'Sources', 'MoonlightPetPreview', 'Resources');
const OUT = path.join(desktop, 'pet', 'assets');
const contract = require(path.join(desktop, 'pet', 'shared', 'contract.js'));

const PORTRAIT = 224;
const CUTOUT_H = 216;
const MAX_BYTES = 120 * 1024;
const checkOnly = process.argv.includes('--check');

function jobs() {
  return contract.CHARACTERS.map((c) => {
    const s = contract.SOURCE_ASSETS[c.key];
    const [left, top, width, height] = s.crop;
    return {
      key: c.key,
      portrait: { src: path.join(SRC, s.portrait), out: path.join(OUT, c.portrait) },
      cutout: { src: path.join(SRC, s.atlas), out: path.join(OUT, c.cutout), crop: { left, top, width, height } },
    };
  });
}

function check() {
  const problems = [];
  for (const j of jobs()) {
    for (const f of [j.portrait.out, j.cutout.out]) {
      if (!fs.existsSync(f)) problems.push(`${path.basename(f)} 없음`);
      else if (fs.statSync(f).size > MAX_BYTES) problems.push(`${path.basename(f)} ${fs.statSync(f).size}B > ${MAX_BYTES}B`);
    }
  }
  return problems;
}

async function withSharp(sharp) {
  for (const j of jobs()) {
    await writeSmall(sharp(j.portrait.src).resize(PORTRAIT, PORTRAIT, { fit: 'cover', kernel: 'lanczos3' }), j.portrait.out);
    await writeSmall(sharp(j.cutout.src).extract(j.cutout.crop).resize({ height: CUTOUT_H, kernel: 'lanczos3' }), j.cutout.out);
  }
  async function writeSmall(pipeline, out) {
    let buf = await pipeline.clone().png({ compressionLevel: 9, effort: 10 }).toBuffer();
    if (buf.length > MAX_BYTES) buf = await pipeline.clone().png({ compressionLevel: 9, effort: 10, palette: true, quality: 92, dither: 0.6 }).toBuffer();
    if (buf.length > MAX_BYTES) throw new Error(`${path.basename(out)} 가 ${buf.length}B 로 120KB 를 넘는다`);
    fs.writeFileSync(out, buf);
    console.log(`pet-assets: ${path.relative(repo, out)} ${buf.length}B`);
  }
}

// sharp 가 없을 때: Electron 을 창 없이 띄워 nativeImage 로 자르고 줄인다.
function withElectron() {
  let electron;
  try { electron = require('electron'); } catch (_) { electron = null; }
  if (typeof electron !== 'string') throw new Error('sharp 도 electron 도 찾지 못했다 — 저장소 루트에서 npm install 을 먼저 한다');
  const script = path.join(OUT, '.pet-assets-electron.cjs');
  const payload = JSON.stringify({ jobs: jobs(), PORTRAIT, CUTOUT_H, MAX_BYTES });
  fs.writeFileSync(script, `'use strict';
const { app, nativeImage, dialog } = require('electron');
const fs = require('fs');
dialog.showErrorBox = () => {};
process.on('uncaughtException', (e) => { console.error(e && e.stack || e); app.exit(1); });
const cfg = ${payload};
app.whenReady().then(() => {
  for (const j of cfg.jobs) {
    const p = nativeImage.createFromPath(j.portrait.src).resize({ width: cfg.PORTRAIT, height: cfg.PORTRAIT, quality: 'best' }).toPNG();
    const c = j.cutout.crop;
    const src = nativeImage.createFromPath(j.cutout.src).crop({ x: c.left, y: c.top, width: c.width, height: c.height });
    const w = Math.round(c.width * cfg.CUTOUT_H / c.height);
    const q = src.resize({ width: w, height: cfg.CUTOUT_H, quality: 'best' }).toPNG();
    for (const [buf, out] of [[p, j.portrait.out], [q, j.cutout.out]]) {
      if (buf.length > cfg.MAX_BYTES) throw new Error(out + ' too large: ' + buf.length);
      fs.writeFileSync(out, buf);
      console.log('pet-assets: ' + out + ' ' + buf.length + 'B');
    }
  }
  app.exit(0);
});
`);
  const r = spawnSync(electron, [script], { stdio: 'inherit', windowsHide: true });
  fs.rmSync(script, { force: true });
  if (r.status !== 0) throw new Error(`electron 자산 생성 실패(${r.status})`);
}

async function main() {
  if (checkOnly) {
    const problems = check();
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log('pet-assets: ok');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  let sharp = null;
  try { sharp = require('sharp'); } catch (_) { sharp = null; }
  if (sharp) await withSharp(sharp); else withElectron();
  const problems = check();
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
