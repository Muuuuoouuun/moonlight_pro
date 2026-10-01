'use strict';
// macOS uses the SwiftUI companion; only Windows creates Electron pet windows.
// Bundle IDs isolate Electron's single-instance lock from the native pet, so
// checking Electron's process count cannot prevent two different pets.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const NATIVE_APP = 'MoonlightPetPreview.app';

function nativePetCandidates({ home = os.homedir(), resourcesPath = process.resourcesPath, desktopDir = __dirname } = {}) {
  return [
    path.join(home, 'Applications', NATIVE_APP),
    path.join('/Applications', NATIVE_APP),
    ...(resourcesPath ? [path.join(resourcesPath, 'native', NATIVE_APP)] : []),
    path.resolve(desktopDir, '../../prototypes/moonlight-pet-macos/dist', NATIVE_APP),
  ];
}

function createNativePetLauncher({ candidates = nativePetCandidates(), exists = fs.existsSync, run = execFile } = {}) {
  return (action = null) => new Promise((resolve, reject) => {
    if (action !== null && !['memo', 'tasks'].includes(action)) {
      reject(new Error(`Unknown native pet action: ${action}`));
      return;
    }
    const bundle = candidates.find((candidate) => exists(path.join(candidate, 'Contents/MacOS/MoonlightPetPreview')));
    if (!bundle) {
      reject(new Error('Mac 펫을 찾을 수 없습니다. npm run app:mac:build로 네이티브 펫을 포함해 다시 빌드하세요.'));
      return;
    }
    // LaunchServices reuses a running copy. The companion also rejects another
    // instance with its bundle ID, including copies built in other worktrees.
    const args = action ? ['-g', '-a', bundle, `moonlight-pet://${action}`] : ['-g', bundle];
    run('/usr/bin/open', args, (error) => error ? reject(error) : resolve(bundle));
  });
}

function installPetRuntime({ platform = process.platform, smoke = false, installElectron, launchNative = createNativePetLauncher(), onError = console.warn }) {
  if (smoke) return null; // Shell smoke must not start the user's real companion.
  if (platform !== 'darwin') return installElectron();
  const start = (action = null) => Promise.resolve().then(() => launchNative(action)).catch((error) => onError(`pet:native ${error.message}`));
  const ready = start();
  return {
    ready,
    quickCapture: () => start('memo'),
    showWidget: () => start('tasks'),
    trayItems: () => [{ label: '펫 열기', click: () => start() }],
  };
}

module.exports = { nativePetCandidates, createNativePetLauncher, installPetRuntime };
