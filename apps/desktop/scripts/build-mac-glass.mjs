#!/usr/bin/env node
// Node-API ABI: same binary in Node/Electron, no electron-rebuild or private APIs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

if (process.platform !== 'darwin') {
  console.log('[mac-glass] skipped (macOS only)');
  process.exit(0);
}
const require = createRequire(import.meta.url);
const native = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pet/native');
const arch = process.argv.find((arg) => arg.startsWith('--arch='))?.slice(7) || process.arch;
if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported Mac architecture: ${arch}`);
const output = path.join(native, 'build', `mac-glass-${arch}.node`);
fs.mkdirSync(path.dirname(output), { recursive: true });
const headers = require('node-api-headers').include_dir;
const result = spawnSync('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-fmodules',
  '-mmacosx-version-min=12.0', '-arch', arch === 'arm64' ? 'arm64' : 'x86_64',
  '-DNAPI_VERSION=8', '-bundle', '-undefined', 'dynamic_lookup',
  '-framework', 'AppKit', '-framework', 'QuartzCore', '-framework', 'Metal', '-framework', 'MetalKit', '-I', headers,
  path.join(native, 'mac-glass.mm'), '-o', output], { stdio: 'inherit' });
if (result.error || result.status !== 0) {
  console.error('[mac-glass] Xcode Command Line Tools with macOS 26+ SDK are required.');
  process.exit(1);
}
// One source of truth: package the exact shader used by the original Swift app.
fs.copyFileSync(path.resolve(native, '../../../../prototypes/moonlight-pet-macos/Sources/MoonlightPetPreview/Shaders/GlassOptics.metal'),
  path.join(native, 'build/GlassOptics.metal'));
console.log(`[mac-glass] built ${path.relative(path.dirname(native), output)}`);
