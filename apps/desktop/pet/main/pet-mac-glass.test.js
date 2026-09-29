'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMacGlass, attachMacGlass } = require('./pet-mac-glass');
const { createElectronDouble, useElectron } = require('./test-support/electron-double');

test('native glass loads only on supported macOS; missing/old bindings fall back without throwing', () => {
  const never = () => { throw new Error('should not load'); };
  assert.equal(loadMacGlass({ platform: 'win32', load: never }), null);
  assert.equal(loadMacGlass({ platform: 'darwin', load: () => ({ isSupported: () => false }) }), null);
  const logs = [];
  assert.equal(loadMacGlass({ platform: 'darwin', load: never, log: (line) => logs.push(line) }), null);
  assert.equal(logs.length, 1);
  const binding = { isSupported: () => true };
  assert.equal(loadMacGlass({ platform: 'darwin', load: () => binding }), binding);
});

test('native handle stays in main; destroyed windows cannot reuse it', () => {
  const handle = Buffer.alloc(8);
  let destroyed = false;
  const calls = [];
  const win = { isDestroyed: () => destroyed, getNativeWindowHandle: () => handle, setVibrancy: (v) => calls.push(['vibrancy', v]) };
  const binding = {
    attach: (h, r) => { calls.push(['attach', h, r]); return true; },
    setSolid: (h, solid) => { calls.push(['solid', h, solid]); return true; },
    inspect: () => ({ attached: true }),
  };
  const glass = attachMacGlass(win, binding, 26);
  assert.deepEqual(calls, [['vibrancy', null], ['attach', handle, 26]]);
  assert.equal(glass.setSolid(true), true);
  assert.deepEqual(calls.at(-1), ['solid', handle, true]);
  destroyed = true;
  assert.equal(glass.setSolid(false), false);
  assert.deepEqual(glass.inspect(), { attached: false });
  assert.equal(attachMacGlass(win, binding, 26), null);
});

test('native attachment errors return control to the window factory fallback', () => {
  const win = { isDestroyed: () => false, getNativeWindowHandle: () => { throw new Error('invalid window'); } };
  assert.equal(attachMacGlass(win, {}, 26), null);
});

test('native panels use clear material without HUD, 26/14pt corners, and rounded solid accessibility fallback', async () => {
  const E = createElectronDouble({ userData: '/tmp/pet-native-glass-test' });
  const restore = useElectron(E);
  delete require.cache[require.resolve('./pet-windows')];
  const W = require('./pet-windows');
  const radii = [];
  const solids = [];
  const originalHandle = E.electron.BrowserWindow.prototype.getNativeWindowHandle;
  E.electron.BrowserWindow.prototype.getNativeWindowHandle = () => Buffer.alloc(8);
  try {
    const binding = { attach: (_h, radius) => { radii.push(radius); return true; }, setSolid: (_h, solid) => solids.push(solid) };
    const f = W.createWindowFactory({ platform: 'darwin', macGlass: binding });
    const panel = f.panel();
    const bubble = f.bubble();
    await Promise.all([panel.petLoaded, bubble.petLoaded]);
    assert.deepEqual(radii, [26, 14]);
    assert.equal(panel.opts.vibrancy, undefined, 'HUD is never installed before native clear glass');
    assert.equal(panel.petMaterial, 'native-clear');
    assert.equal(panel.loaded.query.material, 'native-clear');
    W.applyGlassMaterial(panel, { reduceTransparency: true });
    W.applyGlassMaterial(panel, { highContrast: true });
    W.applyGlassMaterial(panel, {});
    assert.deepEqual(solids, [true, true, false]);
    assert.equal(panel.backgroundColor, '#00000000', 'keep rounded transparent corners');
    assert.equal(panel.vibrancy, null, 'accessibility transitions never reinstall HUD');
    const failed = W.createWindowFactory({ platform: 'darwin', macGlass: { attach: () => false } }).panel();
    assert.equal(failed.petMaterial, 'hud');
    assert.equal(failed.vibrancy, 'hud');
    const windows = W.createWindowFactory({ platform: 'win32', macGlass: binding }).panel();
    assert.equal(windows.petMaterial, 'acrylic');
    assert.deepEqual(radii, [26, 14], 'Windows never attaches the Mac binding');
  } finally {
    E.electron.BrowserWindow.prototype.getNativeWindowHandle = originalHandle;
    restore();
    delete require.cache[require.resolve('./pet-windows')];
  }
});
