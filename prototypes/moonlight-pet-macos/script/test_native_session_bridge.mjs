import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { startNativeSessionBridge } = require('../../../apps/desktop/native-session-bridge.js');
const packageDir = fileURLToPath(new URL('../', import.meta.url));
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moonlight-native-session-check-'));
function run(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: 'inherit' });
    process.once('error', reject);
    process.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
let bridge;
try {
  const binary = path.join(directory, 'check');
  await run('swiftc', ['-parse-as-library', '-o', binary,
    path.join(packageDir, 'Sources/MoonlightPetPreview/Support/HubTransport.swift'),
    path.join(packageDir, 'Sources/MoonlightPetPreview/Support/HubCredentials.swift'),
    path.join(packageDir, 'Tests/MoonlightPetPreviewTests/HubNativeSessionTests.swift')]);
  let reads = 0;
  bridge = await startNativeSessionBridge({ home: directory, getHubUrl: () => 'https://hub.example.test',
    session: { cookies: { get: async () => {
      reads += 1;
      if (reads === 2) return [];
      return [{ name: 'com_moon_operator_session', value: reads === 1 ? 'first-session' : 'rotated-session',
        domain: 'hub.example.test', path: '/', httpOnly: true, secure: true }];
    } } },
  });
  await run(binary, [path.join(directory, 'Library/Application Support/MoonlightNativeBridge/connection.json')]);
  assert.equal(reads, 3, 'Twenty concurrent startup reads must make only one local bridge request');
} finally {
  await bridge?.close();
  await fs.rm(directory, { recursive: true, force: true });
}
