#!/usr/bin/env node
// Build the same SwiftUI app used by the standalone pet, without stopping it.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'darwin') {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const result = spawnSync('bash', [path.join(root, 'prototypes/moonlight-pet-macos/script/build_and_run.sh'), '--build-only'], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
