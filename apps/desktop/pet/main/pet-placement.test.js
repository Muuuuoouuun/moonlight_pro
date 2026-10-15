'use strict';
// 펫 자리 편의 기능(2026-09-29 "모니터 사이드 바꿀 수 있게 (확장 모니터로 옮기기)") — 셸(pet-main.install)을 모니터 둘의
// Electron 대역 위에서 돌려 가장자리 바꾸기·모니터 옮기기·자유 끌기 붙이기·숨기기·초기화·모니터 변화를 고정한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createElectronDouble, useElectron } = require('./test-support/electron-double');
const C = require('../shared/contract');
const G = require('./pet-geometry');

const MAIN = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const EXT = { id: 2, bounds: { x: 1440, y: -180, width: 1920, height: 1080 }, workArea: { x: 1440, y: -180, width: 1920, height: 1040 } };

async function boot(t, { userData, displays = [MAIN, EXT], ...extra } = {}) {
  const dir = userData || fs.mkdtempSync(path.join(os.tmpdir(), 'pet-placement-'));
  const E2 = createElectronDouble({ userData: dir, displays });
  const restore = useElectron(E2);
  for (const key of Object.keys(require.cache)) if (/[\\/]pet[\\/]main[\\/]pet-(main|windows|store)\.js$/.test(key)) delete require.cache[key];
  const { install, POSITION_KEY, HIDDEN_KEY } = require('./pet-main');
  let menus = 0;
  const pet = install({
    app: E2.electron.app,
    getHubUrl: () => '',
    hub: null,
    registerShortcut: false,
    activate: false,
    log: () => {},
    onMenusChanged: () => { menus += 1; },
    ...extra,
  });
  await pet.ready;
  const done = () => {
    pet.dispose();
    restore();
  };
  if (t) t.after(done);
  const call = (channel, payload, win = pet.windows.pet) => E2.invoke(channel, win, payload);
  return { E2, pet, w: pet.windows, call, dir, menus: () => menus, POSITION_KEY, HIDDEN_KEY, done };
}

test('가장자리 바꾸기: 왼쪽 8px, 상태 side, 저장 모양 { displayId, side, ratio, x, y }, 빠른 패널·말풍선은 가운데 쪽', async (t) => {
  const { pet, w, menus, POSITION_KEY } = await boot(t);
  assert.equal(pet.state().side, 'right');
  const y = pet.petBounds.y;
  pet.setSide('left');
  assert.deepEqual(pet.petBounds, { x: 8, y, width: 56, height: 56 });
  assert.deepEqual(w.pet.getBounds(), pet.petBounds);
  assert.equal(pet.state().side, 'left');
  const saved = pet.store.get(POSITION_KEY);
  assert.deepEqual(Object.keys(saved).sort(), ['displayId', 'ratio', 'side', 'x', 'y']);
  assert.equal(saved.displayId, 1);
  assert.equal(saved.side, 'left');
  assert.equal(saved.ratio, Math.round(G.petYRatio(y, MAIN.workArea) * 1e5) / 1e5);
  assert.ok(menus() >= 1, '트레이 메뉴를 다시 만든다');
  pet.openQuick();
  const glass = w.panel.getBounds();
  assert.equal(glass.x, 8 + 56 + C.PANEL_GAP, '빠른 패널은 펫 오른쪽');
  pet.collapse();
  pet.pushNotice({ id: 'n1', kind: 'event', title: '말풍선' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(w.bubble.getBounds().x, 8 + 56 + C.PANEL_GAP, '말풍선도 펫 오른쪽');
});

test('왼쪽 위젯: 덩어리 왼쪽 위 = 펫 왼쪽 위, 걸친 캐릭터는 유리 왼쪽 20px, 모드를 바꿔도 왼쪽 위 고정, 접으면 제자리', async (t) => {
  const { pet, w } = await boot(t);
  pet.setSide('left');
  const before = pet.petBounds;
  pet.showWidget('tasks');
  const glass = w.panel.getBounds();
  assert.equal(glass.x, before.x);
  const expected = G.glassFromCompanion(G.widgetCompanionFrame(before, G.panelGlassSize('tasks'), true, MAIN.workArea, 'left'), true);
  assert.deepEqual(glass, expected);
  assert.deepEqual(w.perch.getBounds(), G.perchBounds(glass, 'left'));
  pet.setMode('memo');
  const memo = w.panel.getBounds();
  assert.equal(memo.x, glass.x, '왼쪽 위 고정');
  assert.equal(memo.y, glass.y);
  pet.collapse();
  assert.equal(pet.petBounds.x, 8);
  assert.equal(pet.petBounds.y, memo.y - C.PERCH_STRIP);
});

test('모니터로 옮기기: 같은 가장자리·같은 세로 비율, 위젯은 새 자리에서 다시 열린다', async (t) => {
  const { pet, w, POSITION_KEY } = await boot(t);
  const ratio = G.petYRatio(pet.petBounds.y, MAIN.workArea);
  pet.showWidget('calendar');
  pet.moveToDisplay(2);
  assert.equal(pet.petBounds.x, EXT.workArea.x + EXT.workArea.width - 64);
  assert.equal(pet.petBounds.y, Math.round(G.petYFromRatio(ratio, EXT.workArea)));
  assert.equal(pet.store.get(POSITION_KEY).displayId, 2);
  const s = pet.state();
  assert.equal(s.presentation, 'widget');
  assert.equal(s.mode, 'calendar');
  assert.ok(w.panel.getBounds().x >= EXT.workArea.x, '위젯도 두 번째 모니터로');
  pet.moveToDisplay(999); // 없는 모니터는 무시
  assert.equal(pet.store.get(POSITION_KEY).displayId, 2);
});

test('자유 끌기: 가로로도 움직이고, 놓으면 가운데가 있는 화면의 가까운 가장자리로 — 다른 모니터로도 건너간다', async (t) => {
  const { pet, w, call, E2, POSITION_KEY } = await boot(t);
  const start = pet.petBounds;
  const cx = start.x + 28;
  const cy = start.y + 28;
  await call('pet:press', { pressed: true, source: 'pet' });
  await call('pet:drag', { phase: 'begin', screenY: cy, screenX: cx });
  await call('pet:drag', { phase: 'move', screenY: cy + 10, screenX: cx - 900 });
  assert.equal(pet.petBounds.x, start.x - 900, '끄는 동안은 가장자리에 붙지 않는다');
  await call('pet:drag', { phase: 'end', screenY: cy + 10, screenX: cx - 900 });
  await call('pet:press', { pressed: false, source: 'pet' });
  assert.deepEqual(pet.petBounds, { x: 8, y: start.y + 10, width: 56, height: 56 }, '가운데 왼쪽 → 왼쪽 가장자리');
  assert.equal(pet.state().side, 'left');
  assert.equal(pet.state().panelOpen, false, '끌기는 클릭이 아니다');
  assert.equal(pet.store.get(POSITION_KEY).side, 'left');
  // 렌더러가 screenX 를 보내지 않으면 커서 위치로 채운다 — 두 번째 모니터 왼쪽 절반으로.
  E2.electron.screen.cursor = { x: 36, y: 0 };
  await call('pet:drag', { phase: 'begin', screenY: 400 });
  E2.electron.screen.cursor = { x: 1900, y: 0 };
  await call('pet:drag', { phase: 'move', screenY: 400 });
  await call('pet:drag', { phase: 'end', screenY: 400 });
  assert.equal(pet.petBounds.x, EXT.workArea.x + 8, '두 번째 모니터 왼쪽 가장자리');
  assert.equal(pet.store.get(POSITION_KEY).displayId, 2);
  // 세로만 끌면 예전과 같다(가장자리 그대로).
  E2.electron.screen.cursor = null;
  const before = pet.petBounds;
  await call('pet:drag', { phase: 'begin', screenY: 300 });
  await call('pet:drag', { phase: 'move', screenY: 340 });
  await call('pet:drag', { phase: 'end', screenY: 340 });
  assert.deepEqual(pet.petBounds, { ...before, y: before.y + 40 });
  assert.equal(w.pet.getBounds().x, before.x);
});

test('끌다가 포인터를 잃어도(cancel) 가장자리로 붙이고 저장한다', async (t) => {
  const { pet, call, POSITION_KEY } = await boot(t);
  const start = pet.petBounds;
  await call('pet:drag', { phase: 'begin', screenY: 300, screenX: start.x });
  await call('pet:drag', { phase: 'move', screenY: 300, screenX: start.x - 1000 });
  await call('pet:drag', { phase: 'cancel' });
  assert.equal(pet.petBounds.x, 8);
  assert.equal(pet.store.get(POSITION_KEY).side, 'left');
  assert.equal(pet.state().panelOpen, false);
});

test('숨기기: 펫·패널을 내리고 저장, 알림은 기다린다 — ⌃⌥M(빠른 기능)은 다시 보이며 연다', async (t) => {
  const { pet, w, HIDDEN_KEY, dir, done } = await boot(null);
  pet.openQuick();
  pet.setHidden(true);
  assert.equal(pet.state().hidden, true);
  assert.equal(pet.state().panelOpen, false, '떠 있던 패널을 접는다');
  assert.equal(w.pet.isVisible(), false);
  assert.equal(pet.store.get(HIDDEN_KEY), true);
  assert.deepEqual(pet.trayItems().filter((i) => /^펫 (보이기|숨기기)$/.test(i.label)).map((i) => i.label), ['펫 보이기']);
  pet.pushNotice({ id: 'wait', kind: 'event', title: '기다림' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pet.windows.created().bubble && pet.windows.bubble.isVisible(), false, '숨긴 동안 말풍선 없음');
  pet.store.flush();
  done();
  // 끄고 켜도 숨김 유지.
  const again = await boot(null, { userData: dir });
  assert.equal(again.pet.hidden, true);
  assert.equal(again.w.pet.isVisible(), false);
  again.pet.toggleQuick(); // 전역 단축키와 같은 동작
  assert.equal(again.pet.hidden, false);
  assert.equal(again.pet.state().panelOpen, true);
  assert.equal(again.w.pet.isVisible(), true);
  assert.equal(again.pet.store.get(HIDDEN_KEY), null);
  again.done();
});

test('펫 위치 초기화: 주 모니터 오른쪽 아래쪽 1/3, 숨겨 두었어도 다시 보인다', async (t) => {
  const { pet } = await boot(t);
  pet.moveToDisplay(2);
  pet.setSide('left');
  pet.setHidden(true);
  pet.resetPosition();
  assert.deepEqual(pet.petBounds, G.defaultPetBounds(MAIN.workArea));
  assert.equal(pet.state().side, 'right');
  assert.equal(pet.hidden, false);
});

test('펫 오른쪽 클릭 메뉴: 캐릭터 뒤에 자리 항목, 모니터 둘이면 모니터로 옮기기', async (t) => {
  const { pet, call, E2 } = await boot(t);
  await call('pet:context-menu', {});
  const menu = E2.popups.at(-1).template;
  const labels = menu.map((i) => i.label || i.type);
  const at = labels.indexOf('모니터로 옮기기');
  assert.ok(at > labels.indexOf(C.CHARACTERS.at(-1).name));
  assert.deepEqual(labels.slice(at), ['모니터로 옮기기', '왼쪽 가장자리로', '오른쪽 가장자리로', 'separator', '펫 위치 초기화', '펫 숨기기']);
  assert.deepEqual(menu[at].submenu.map((i) => [i.label, i.checked]), [['주 모니터 (1440×900)', true], ['모니터 2 (1920×1080)', false]]);
  menu[at].submenu[1].click();
  assert.equal(pet.state().side, 'right');
  assert.ok(pet.petBounds.x > 1440);
});

test('모니터가 빠지면 가까운 모니터의 같은 가장자리로, 돌아오면 원래 모니터로(빠진 동안 저장하지 않는다)', async (t) => {
  const { pet, E2, menus, POSITION_KEY } = await boot(t);
  pet.moveToDisplay(2);
  pet.setSide('left');
  const onExt = pet.petBounds;
  const saved = pet.store.get(POSITION_KEY);
  const screen = E2.electron.screen;
  const count = menus();
  screen.displays = [MAIN];
  screen.emit('display-removed');
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(pet.petBounds.x, 8, '주 모니터 왼쪽 가장자리');
  assert.equal(pet.petBounds.y, Math.round(G.petYFromRatio(saved.ratio, MAIN.workArea)), '같은 세로 비율');
  assert.deepEqual(pet.store.get(POSITION_KEY), saved, '밀려난 자리는 저장하지 않는다');
  assert.ok(menus() > count, '모니터 목록이 바뀌어 메뉴를 다시 만든다');
  screen.displays = [MAIN, EXT];
  screen.emit('display-added');
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.deepEqual(pet.petBounds, onExt, '돌아온 모니터의 원래 자리');
});

test('macOS 자식 창 밀림 보정: 걸친 캐릭터를 띄울 때 한 번, 셸이 옮기지 않은 자리로 가면(move) 다시 — 1pt 비켰다가 제자리', async (t) => {
  const { pet, w } = await boot(t, { platform: 'darwin' });
  pet.setSide('left');
  const perchWin = w.perch;
  const shown = [];
  const origSet = perchWin.setBounds.bind(perchWin);
  perchWin.setBounds = (rect) => { shown.push(rect.x); origSet(rect); };
  pet.showWidget('memo');
  const want = G.perchBounds(w.panel.getBounds(), 'left');
  assert.deepEqual(w.perch.getBounds(), want);
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.deepEqual(shown.slice(-2), [want.x + 1, want.x], '띄운 뒤 1pt 비켰다가 제자리');
  perchWin.setBounds = origSet;
  const moves = [];
  const setBounds = w.perch.setBounds.bind(w.perch);
  w.perch.setBounds = (rect) => { moves.push(rect.x); setBounds(rect); w.perch.emit('move'); };
  setBounds({ ...want, x: want.x + 1400 }); // AppKit 이 옛 상대 자리로 민 것처럼
  w.perch.emit('move');
  w.perch.emit('move'); // 같은 밀림의 알림이 겹쳐도 보정은 한 번
  assert.equal(w.perch.getBounds().x, want.x + 1400, '밀어내는 도중에는 옮기지 않는다');
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.deepEqual(w.perch.getBounds(), want);
  assert.deepEqual(moves, [want.x + 1, want.x], '1pt 비켰다가 제자리(창 서버가 같은 값 놓기를 건너뛰지 않게)');
  // 셸이 옮긴 자리(제자리)에서 온 move 는 보정하지 않는다.
  w.perch.emit('move');
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(moves.length, 2);
  pet.collapse();
  setBounds({ ...want, x: 5 });
  w.perch.emit('move');
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(w.perch.getBounds().x, 5, '패널이 접혀 있으면 건드리지 않는다');
});

test('잠자기·화면 잠금 동안 허브 폴링을 멈추고, 깨어나면 다시 켠다(돌고 있었을 때만)', async (t) => {
  const calls = [];
  const hub = { startPolling: () => calls.push('start'), stopPolling: () => calls.push('stop') };
  const { E2, pet } = await boot(t, { hub });
  const power = E2.electron.powerMonitor;
  assert.deepEqual(calls, ['start'], '창을 그린 뒤 켠다');
  power.emit('lock-screen');
  power.emit('suspend'); // 이미 멈췄으면 다시 부르지 않는다
  assert.deepEqual(calls, ['start', 'stop']);
  power.emit('resume');
  power.emit('unlock-screen');
  assert.deepEqual(calls, ['start', 'stop', 'start']);
  pet.dispose();
  assert.equal(power.listenerCount('suspend') + power.listenerCount('resume') + power.listenerCount('lock-screen') + power.listenerCount('unlock-screen'), 0, 'dispose 가 떼어 낸다');
});

test('허브 폴링을 켜지 않았으면(허브 없음) 깨어나도 켜지 않는다', async (t) => {
  const { E2 } = await boot(t, { hub: null });
  const power = E2.electron.powerMonitor;
  power.emit('suspend');
  power.emit('resume');
  assert.ok(power.listenerCount('resume') >= 1);
});

test('말풍선 페이지를 불러오지 못하면 빈 말풍선을 띄우지 않는다', async (t) => {
  const { pet, E2 } = await boot(t, { platform: 'darwin' });
  const bubble = pet.windows.bubble; // 늦게 만든 창 — 불러오기 실패를 흉내 낸다
  bubble.webContents.emit('did-fail-load');
  await new Promise((resolve) => setTimeout(resolve, 20));
  pet.pushNotice({ id: 'x', title: '안 보여야 함' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(bubble.isVisible(), false);
  assert.equal(bubble.webContents.sent.filter(([c]) => c === 'pet:notice').length, 0);
  assert.ok(E2);
});
