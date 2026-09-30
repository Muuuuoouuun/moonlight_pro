'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { nativePetCandidates, createNativePetLauncher, installPetRuntime } = require('./pet-runtime');

test('Mac shell launches only the native pet, also when its tray action is used', async () => {
  let launches = 0;
  const pet = installPetRuntime({
    platform: 'darwin',
    installElectron: () => assert.fail('a second Electron pet must never be created on Mac'),
    launchNative: async () => { launches += 1; },
  });
  await pet.ready;
  await pet.trayItems()[0].click();
  assert.equal(launches, 2);
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
