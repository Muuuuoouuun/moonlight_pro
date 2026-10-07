'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { nativePetCandidates, createNativePetLauncher, installPetRuntime } = require('./pet-runtime');

test('Mac shell reuses the native pet for quick capture and the task widget', async () => {
  const launches = [];
  const pet = installPetRuntime({
    platform: 'darwin',
    installElectron: () => assert.fail('a second Electron pet must never be created on Mac'),
    launchNative: async (action) => { launches.push(action); },
  });
  await pet.ready;
  await pet.trayItems()[0].click();
  await pet.quickCapture();
  await pet.showWidget();
  await pet.sessionChanged();
  await pet.quickCapture();
  assert.deepEqual(launches, [null, null, 'memo', 'tasks', 'session-changed', 'memo']);
});

test('native launch failure never silently creates an Electron pet', async () => {
  const errors = [];
  const pet = installPetRuntime({
    platform: 'darwin',
    installElectron: () => assert.fail('native failure is not permission to regress the UI'),
    launchNative: async () => { throw new Error('unavailable'); },
    onError: (error) => errors.push(error),
  });
  await pet.ready;
  assert.deepEqual(errors, ['pet:native unavailable']);
});

test('Windows retains its Electron pet; shell smoke launches neither runtime', () => {
  const windowsPet = {};
  assert.equal(installPetRuntime({ platform: 'win32', installElectron: () => windowsPet }), windowsPet);
  assert.equal(installPetRuntime({
    platform: 'darwin', smoke: true,
    installElectron: () => assert.fail('smoke must stay isolated'),
    launchNative: () => assert.fail('smoke must stay isolated'),
  }), null);
});

test('existing standalone install is preferred; packaged and development copies are fallbacks', async () => {
  const candidates = nativePetCandidates({ home: '/users/operator', resourcesPath: '/App/Contents/Resources', desktopDir: '/repo/apps/desktop' });
  assert.deepEqual(candidates, [
    '/users/operator/Applications/MoonlightPetPreview.app',
    '/Applications/MoonlightPetPreview.app',
    '/App/Contents/Resources/native/MoonlightPetPreview.app',
    '/repo/prototypes/moonlight-pet-macos/dist/MoonlightPetPreview.app',
  ]);
  for (const available of [candidates, candidates.slice(2), candidates.slice(3)]) {
    const calls = [];
    const launch = createNativePetLauncher({
      candidates,
      exists: (file) => available.some((bundle) => file === path.join(bundle, 'Contents/MacOS/MoonlightPetPreview')),
      run: (command, args, callback) => { calls.push([command, args]); callback(null); },
    });
    assert.equal(await launch(), available[0]);
    assert.deepEqual(calls, [['/usr/bin/open', ['-g', available[0]]]], 'never use open -n or shell-interpolated paths');
  }
});

test('missing bundle and launch failure are reported without hiding the cause', async () => {
  await assert.rejects(createNativePetLauncher({ candidates: [], run: () => assert.fail('no bundle') })(), /Mac 펫/);
  await assert.rejects(createNativePetLauncher({
    candidates: ['/App with spaces.app'], exists: () => true,
    run: (_command, _args, callback) => callback(new Error('launch denied')),
  })(), /launch denied/);
});

test('native capture uses an explicit app and URL even when the app is already running', async () => {
  const calls = [];
  const launch = createNativePetLauncher({
    candidates: ['/App with spaces.app'], exists: () => true,
    run: (command, args, callback) => { calls.push([command, args]); callback(null); },
  });
  for (const action of ['memo', 'tasks', 'memo']) await launch(action);
  assert.deepEqual(calls, ['memo', 'tasks', 'memo'].map((action) => [
    '/usr/bin/open', ['-g', '-a', '/App with spaces.app', `moonlight-pet://${action}`],
  ]));
  await assert.rejects(launch('save'), /Unknown native pet action/);
  assert.equal(calls.length, 3);
});
