'use strict';
// 셸의 플랫폼 갈래 — macOS 는 비활성 패널로 띄우고(허브 창을 올리지 않는다) 걸친 캐릭터·말풍선을 처음 쓸 때 만든다.
// Windows 는 이식 당시 흐름 그대로(show·focus, 네 창을 미리, DWM·활성 유지 도우미).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createElectronDouble, useElectron } = require('./test-support/electron-double');

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot(t, platform, extra = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-platform-'));
  const E = createElectronDouble({ userData });
  const restore = useElectron(E);
  for (const key of Object.keys(require.cache)) if (/[\\/]pet[\\/]main[\\/]pet-(main|windows)\.js$/.test(key)) delete require.cache[key];
  const { install } = require('./pet-main');
  const kept = [];
  const pet = install({
    app: E.electron.app,
    getHubUrl: () => '',
    registerShortcut: false,
    activate: true,
    hub: null,
    log: () => {},
    platform,
    activationKeeper: { keep: (win) => { kept.push(win.petSurface); return platform === 'win32'; }, dispose() {} },
    ...extra,
  });
  await pet.ready;
  t.after(() => {
    pet.dispose();
    restore();
  });
  return { E, pet, kept };
}

test('macOS: 걸친 캐릭터·말풍선 창은 처음 쓸 때 만든다 — 대기 중에는 펫·패널 둘만', async (t) => {
  const { E, pet } = await boot(t, 'darwin');
  assert.equal(pet.platform, 'darwin');
  assert.deepEqual(pet.windows.created(), { perch: false, bubble: false });
  assert.deepEqual(E.windows.map((w) => w.petSurface), ['pet', 'panel']);

  pet.openQuick(); // 할 일: 걸치지 않는다
  assert.equal(pet.windows.created().perch, false);
  pet.collapse();
  pet.showWidget('tasks'); // 위젯: 걸친 캐릭터
  assert.equal(pet.windows.created().perch, true);
  const perch = E.windows.find((w) => w.petSurface === 'perch');
  assert.equal(perch.isVisible(), true);
  assert.equal(perch.opts.parent, pet.windows.panel);
  pet.collapse();
  assert.equal(perch.isVisible(), false);

  pet.pushNotice({ id: 'n1', title: '첫 말풍선' });
  assert.equal(pet.windows.created().bubble, true);
  const bubble = E.windows.find((w) => w.petSurface === 'bubble');
  assert.equal(bubble.isVisible(), false, '페이지를 불러오기 전엔 띄우지 않는다');
  await settle();
  assert.equal(bubble.isVisible(), true);
  assert.deepEqual(bubble.webContents.sent.filter(([c]) => c === 'pet:notice').map(([, p]) => p.notice.id), ['n1']);
  assert.equal(bubble.calls.includes('show'), false, '말풍선은 showInactive 로만');
});

test('macOS: 불러오는 중인 말풍선을 내리면 늦게 띄우지 않는다', async (t) => {
  const { E, pet } = await boot(t, 'darwin');
  pet.pushNotice({ id: 'n1', title: '곧 내림' });
  pet.toggleBubble(); // 떠 있는 차례를 내린다
  await settle();
  const bubble = E.windows.find((w) => w.petSurface === 'bubble');
  assert.equal(bubble.isVisible(), false);
  assert.equal(bubble.webContents.sent.filter(([c]) => c === 'pet:notice').length, 0);
});

test('macOS: 빠른 패널은 showInactive + focus(앱 활성화 없이 키 창), show()를 부르지 않는다', async (t) => {
  const { E, pet } = await boot(t, 'darwin');
  pet.openQuick();
  const panel = pet.windows.panel;
  assert.deepEqual(panel.calls, ['showInactive', 'focus']);
  assert.equal(panel.isFocused(), true);
  assert.deepEqual(E.electron.app.focusCalls, [], '키 창이 되면 앱을 활성화하지 않는다');
});

test('macOS: 키 창이 못 되어도 앱을 활성화하지 않는다(허브 창이 따라 올라오지 않게) — 150ms 뒤 다시 잡는다', async (t) => {
  const { E, pet } = await boot(t, 'darwin');
  const panel = pet.windows.panel;
  let tries = 0;
  panel.focus = function focus() { tries += 1; this.calls.push('focus'); this.focused = tries >= 2; };
  pet.openQuick();
  assert.deepEqual(E.electron.app.focusCalls, [], 'app.focus({steal}) 없음');
  assert.deepEqual(panel.calls, ['showInactive', 'focus']);
  await settle(200);
  assert.deepEqual(panel.calls, ['showInactive', 'focus', 'focus']);
  assert.equal(panel.isFocused(), true);
  assert.equal(panel.calls.includes('show'), false);
  await settle(200);
  assert.equal(tries, 2, '잡은 뒤에는 더 부르지 않는다');
});

test('macOS: 그래도 키 창이 못 되면 유예 안에서 300ms 에 한 번 더 — 그 뒤로는 부르지 않는다', async (t) => {
  const { E, pet } = await boot(t, 'darwin');
  const panel = pet.windows.panel;
  let tries = 0;
  panel.focus = function focus() { tries += 1; this.calls.push('focus'); this.focused = tries >= 3; };
  pet.openQuick();
  assert.equal(panel.isFocused(), false);
  await settle(200);
  assert.equal(tries, 2);
  assert.equal(panel.isFocused(), false);
  await settle(150);
  assert.equal(tries, 3);
  assert.equal(panel.isFocused(), true);
  await settle(200);
  assert.equal(tries, 3);
  assert.deepEqual(E.electron.app.focusCalls, []);
  assert.equal(panel.calls.includes('show'), false);
});

test('macOS: 활성 유지 도우미·DWM 없이 — 남은 위젯이 blur 돼도 아무 일 없다(vibrancy active)', async (t) => {
  const { pet } = await boot(t, 'darwin');
  const dwm = await pet.dwmReady;
  assert.equal(dwm.error, 'platform');
  pet.showWidget('tasks');
  pet.windows.panel.emit('blur');
  assert.equal(pet.state().panelOpen, true, '지속 위젯은 남는다');
});

test('macOS: 집중 화면은 showInactive + focus 로 띄우고 띄운 뒤 화면 전체로 다시 맞춘다', async (t) => {
  const { E, pet } = await boot(t, 'darwin');
  pet.startFocus(1);
  const [focus] = pet.windows.focus();
  assert.deepEqual(focus.calls, ['showInactive', 'focus']);
  assert.deepEqual(focus.getBounds(), E.display.bounds);
  assert.equal(focus.opts.enableLargerThanScreen, true);
  assert.deepEqual(focus.allWorkspaces.options, { visibleOnFullScreen: true, skipTransformProcessType: true });
  pet.stopFocus();
});

test('Windows: 네 창을 미리 만들고 show·focus 로 띄운다(이식 당시 흐름 그대로)', async (t) => {
  const { E, pet, kept } = await boot(t, 'win32');
  assert.deepEqual(pet.windows.created(), { perch: true, bubble: true });
  assert.deepEqual(E.windows.map((w) => w.petSurface), ['pet', 'panel', 'perch', 'bubble']);
  pet.openQuick();
  assert.deepEqual(pet.windows.panel.calls, ['show', 'focus']);
  assert.deepEqual(E.electron.app.focusCalls, []);
  pet.collapse();
  pet.showWidget('tasks');
  pet.windows.panel.emit('blur');
  assert.deepEqual(kept, ['panel'], '초점을 잃고 남은 Acrylic 위젯은 WM_NCACTIVATE 로 블러를 되살린다');
  pet.pushNotice({ id: 'w1', title: '바로' });
  const bubble = E.windows.find((w) => w.petSurface === 'bubble');
  assert.equal(bubble.isVisible(), false, '패널이 열려 있으면 기다린다');
  pet.collapse();
  assert.equal(bubble.isVisible(), true, '이미 불러온 말풍선은 곧바로');
  pet.startFocus(1);
  assert.deepEqual(pet.windows.focus()[0].calls, ['show', 'focus']);
  pet.stopFocus();
});

test('lazyWindows 옵션은 플랫폼 기본값보다 우선한다', async (t) => {
  const { pet } = await boot(t, 'win32', { lazyWindows: true });
  assert.deepEqual(pet.windows.created(), { perch: false, bubble: false });
});

test('캐릭터 메뉴 얼굴: macOS 는 20·40px 두 배율, Windows 는 20px 하나', () => {
  const { menuIcon } = require('./pet-main');
  const sized = [];
  const image = { resize: ({ width }) => { sized.push(width); return { width, toPNG: () => Buffer.from([width]) }; } };
  const reps = [];
  const nativeImage = { createEmpty: () => ({ addRepresentation: (r) => reps.push(r), isEmpty: () => reps.length === 0 }) };
  const one = menuIcon(nativeImage, image, 'win32');
  assert.equal(one.width, 20);
  assert.deepEqual(sized, [20]);
  const mac = menuIcon(nativeImage, image, 'darwin');
  assert.deepEqual(reps.map((r) => [r.scaleFactor, r.buffer[0]]), [[1, 20], [2, 40]]);
  assert.equal(typeof mac.addRepresentation, 'function');
});
