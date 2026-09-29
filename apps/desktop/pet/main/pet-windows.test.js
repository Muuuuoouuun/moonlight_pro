'use strict';
// 펫 창 옵션·재질 — Windows(Acrylic) 값은 그대로, macOS 는 vibrancy·비활성 패널·모든 Space.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createElectronDouble, useElectron } = require('./test-support/electron-double');
const C = require('../shared/contract');

function loadWindows() {
  const E = createElectronDouble({ userData: '/tmp/pet-windows-test' });
  const restore = useElectron(E);
  for (const key of Object.keys(require.cache)) if (/[\\/]pet[\\/]main[\\/]pet-windows\.js$/.test(key)) delete require.cache[key];
  const W = require('./pet-windows');
  return { E, W, restore };
}

const display = { id: 7, bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 38, width: 1512, height: 870 } };

test('Windows 창 옵션은 이식 당시 값 그대로(Acrylic·thickFrame 없음·투명 아님, mac 전용 키 없음)', () => {
  const { W, restore } = loadWindows();
  try {
    const glass = W.surfaceOptions('panel', 'win32', { width: 320, height: 488, focusable: true });
    assert.deepEqual(glass, {
      transparent: false, backgroundMaterial: 'acrylic', backgroundColor: '#00000000', thickFrame: false,
      roundedCorners: true, hasShadow: true, width: 320, height: 488, focusable: true,
    });
    assert.deepEqual(W.surfaceOptions('pet', 'win32', { width: 56, height: 56, focusable: false }), {
      transparent: true, backgroundColor: '#00000000', hasShadow: false, thickFrame: false, width: 56, height: 56, focusable: false,
    });
    assert.deepEqual(W.surfaceOptions('focus', 'win32', { ...display.bounds }), {
      backgroundColor: W.FOCUS_BACKGROUND, transparent: false, thickFrame: false, hasShadow: false, movable: false, focusable: true,
      level: 'screen-saver', ...display.bounds,
    });
    for (const surface of ['pet', 'panel', 'perch', 'bubble', 'focus']) {
      const o = W.surfaceOptions(surface, 'win32');
      for (const key of ['type', 'vibrancy', 'visualEffectState', 'acceptFirstMouse', 'enableLargerThanScreen']) {
        assert.equal(o[key], undefined, `${surface}.${key}`);
      }
    }
  } finally {
    restore();
  }
});

test('macOS 유리: vibrancy(어두운 hud) + visualEffectState active + 투명 + 둥근 모서리 + 비활성 패널', () => {
  const { W, restore } = loadWindows();
  try {
    for (const surface of ['panel', 'bubble']) {
      const o = W.surfaceOptions(surface, 'darwin', { focusable: surface === 'panel' });
      assert.equal(o.vibrancy, W.MAC_VIBRANCY);
      assert.equal(W.MAC_VIBRANCY, 'hud');
      assert.equal(o.visualEffectState, 'active', '초점을 잃어도 블러 유지');
      assert.equal(o.transparent, true);
      assert.equal(o.backgroundColor, '#00000000');
      assert.equal(o.roundedCorners, true);
      assert.equal(o.hasShadow, true);
      assert.equal(o.type, 'panel');
      assert.equal(o.acceptFirstMouse, true);
      assert.equal(o.backgroundMaterial, undefined, 'Acrylic 은 Windows 전용');
    }
    for (const surface of ['pet', 'perch']) {
      const o = W.surfaceOptions(surface, 'darwin');
      assert.equal(o.type, 'panel');
      assert.equal(o.acceptFirstMouse, true, '다른 앱이 앞에 있어도 첫 클릭');
      assert.equal(o.transparent, true);
      assert.equal(o.vibrancy, undefined);
      assert.equal(o.roundedCorners, false);
    }
  } finally {
    restore();
  }
});

test('macOS 집중 화면: 화면 전체(메뉴 막대·Dock 위), 제목 없는 창, 화면보다 커도 자르지 않는다', () => {
  const { W, restore } = loadWindows();
  try {
    const o = W.surfaceOptions('focus', 'darwin', { ...display.bounds });
    assert.equal(o.roundedCorners, false);
    assert.equal(o.enableLargerThanScreen, true);
    assert.equal(o.level, 'screen-saver');
    assert.equal(o.type, 'panel', 'focus()가 앱을 활성화하지 않는다');
    assert.equal(o.transparent, false);
    assert.deepEqual({ x: o.x, y: o.y, width: o.width, height: o.height }, display.bounds);
  } finally {
    restore();
  }
});

test('창 공장: macOS 창은 모든 Space·전체 화면 위(Dock 변환 없이), Windows 는 부르지 않는다', () => {
  const { E, W, restore } = loadWindows();
  try {
    const mac = W.createWindowFactory({ platform: 'darwin' });
    const made = [mac.pet(), mac.panel(), mac.bubble(), mac.focus(display, true)];
    made.push(mac.perch(made[1]));
    for (const win of made) {
      assert.deepEqual(win.allWorkspaces, { visible: true, options: { visibleOnFullScreen: true, skipTransformProcessType: true } }, win.petSurface);
      assert.equal(win.petPlatform, 'darwin');
    }
    assert.equal(made[1].petMaterial, 'hud');
    assert.equal(made[1].opts.type, 'panel');
    assert.equal(made[3].alwaysOnTop, true);

    const win = W.createWindowFactory({ platform: 'win32' });
    const panel = win.panel();
    assert.equal(panel.allWorkspaces, null);
    assert.equal(panel.petMaterial, 'acrylic');
    assert.equal(panel.opts.type, undefined);
    assert.equal(E.windows.length, 6);
  } finally {
    restore();
  }
});

test('창 공장: 페이지를 다 불러오면 petReady', async () => {
  const { W, restore } = loadWindows();
  try {
    const f = W.createWindowFactory({ platform: 'darwin' });
    const bubble = f.bubble();
    assert.equal(bubble.petReady, false);
    assert.equal(await bubble.petLoaded, true);
    assert.equal(bubble.petReady, true);
    assert.deepEqual(bubble.opts.width, C.BUBBLE_SIZE.width);
  } finally {
    restore();
  }
});

test('재질 전환: 투명도 줄이기면 불투명 면 — Windows 는 Acrylic 끄기, macOS 는 vibrancy 떼기, 되돌리면 다시', () => {
  const { W, restore } = loadWindows();
  try {
    const mac = W.createWindowFactory({ platform: 'darwin' }).panel();
    W.applyGlassMaterial(mac, { reduceTransparency: true });
    assert.equal(mac.vibrancy, null);
    assert.equal(mac.backgroundColor, W.SOLID_GLASS);
    assert.equal(mac.material, 'none', 'macOS 에서는 setBackgroundMaterial 을 부르지 않는다');
    W.applyGlassMaterial(mac, { reduceTransparency: false, highContrast: false });
    assert.equal(mac.vibrancy, 'hud');
    assert.equal(mac.backgroundColor, '#00000000');

    const win = W.createWindowFactory({ platform: 'win32' }).panel();
    W.applyGlassMaterial(win, { highContrast: true });
    assert.equal(win.material, 'none');
    assert.equal(win.backgroundColor, W.SOLID_GLASS);
    assert.equal(win.vibrancy, null);
    W.applyGlassMaterial(win, {});
    assert.equal(win.material, 'acrylic');
    assert.equal(win.backgroundColor, '#00000000');
    // platform 을 직접 주면 창에 기록된 값보다 우선한다
    W.applyGlassMaterial(win, { reduceTransparency: true }, 'darwin');
    assert.equal(win.material, 'acrylic', 'darwin 경로는 Acrylic 을 건드리지 않는다');
    assert.equal(win.backgroundColor, W.SOLID_GLASS);
  } finally {
    restore();
  }
});
