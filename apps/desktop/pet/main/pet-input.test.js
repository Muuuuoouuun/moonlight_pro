'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('./pet-input');

const types = (actions) => actions.map((a) => a.type);

function clock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('한 번 클릭은 바로 click, 500ms 안의 두 번째는 double-click', () => {
  const time = clock();
  const g = I.createPointerGesture({ now: time.now });
  assert.deepEqual(types(g.down(500)), ['press']);
  assert.deepEqual(types(g.up()), ['release', 'click']);
  time.advance(200);
  g.down(500);
  assert.deepEqual(types(g.up()), ['release', 'double-click']);
  time.advance(100);
  g.down(500);
  assert.deepEqual(types(g.up()), ['release', 'click']); // 세 번째는 새 클릭
  time.advance(600);
  g.down(500);
  assert.deepEqual(types(g.up()), ['release', 'click']); // 너무 늦으면 두 번 다 한 번 클릭
});

test('3px 넘게 움직이면 끌기 — 클릭으로 치지 않는다', () => {
  const g = I.createPointerGesture({ now: () => 0 });
  g.down(400);
  assert.deepEqual(g.move(402), []);
  assert.deepEqual(g.move(396), [{ type: 'drag-begin' }, { type: 'drag-move', dy: -4 }]);
  assert.deepEqual(g.move(390), [{ type: 'drag-move', dy: -6 }]);
  assert.equal(g.isDragging, true);
  assert.deepEqual(types(g.up()), ['drag-end', 'release']);
  // 끌기 직후의 클릭은 더블 클릭 후보가 아니다.
  g.down(390);
  assert.deepEqual(types(g.up()), ['release', 'click']);
});

test('IPC 신호: press·drag가 섞여 와도 한 제스처', () => {
  const g = I.createPointerGesture({ now: () => 0 });
  // 렌더러가 press(좌표 없음) → drag begin(좌표) 순서로 보내도 시작 좌표를 잡는다.
  assert.deepEqual(types(I.applyPointerSignal(g, 'pet:press', { pressed: true, source: 'pet' })), ['press']);
  assert.deepEqual(I.applyPointerSignal(g, 'pet:drag', { phase: 'begin', screenY: 300 }), []);
  assert.deepEqual(types(I.applyPointerSignal(g, 'pet:drag', { phase: 'move', screenY: 320 })), ['drag-begin', 'drag-move']);
  assert.deepEqual(types(I.applyPointerSignal(g, 'pet:drag', { phase: 'end', screenY: 320 })), ['drag-end', 'release']);
  assert.deepEqual(I.applyPointerSignal(g, 'pet:press', { pressed: false }), []); // 이미 끝난 제스처
  assert.deepEqual(I.applyPointerSignal(g, 'pet:drag', { phase: 'move', screenY: 500 }), []);
  assert.deepEqual(I.applyPointerSignal(g, 'pet:drag', { phase: 'bogus' }), []);
  assert.deepEqual(I.applyPointerSignal(g, 'pet:press', null), []);
});

test('취소는 클릭이 아니다', () => {
  const g = I.createPointerGesture({ now: () => 0 });
  g.down(10);
  assert.deepEqual(types(g.cancel()), ['release']);
  assert.deepEqual(g.cancel(), []);
});

test('Esc 1.3초: 자동 반복은 무시, 떼면 취소', () => {
  const timers = [];
  let held = 0;
  const hold = I.createEscHold({
    onHold: () => { held += 1; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
    clearTimeout: (id) => { timers[id].cleared = true; },
  });
  assert.equal(I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' }), true);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1300);
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape', isAutoRepeat: true });
  assert.equal(timers.length, 1);
  I.escHoldInput(hold, { type: 'keyUp', key: 'Escape' });
  assert.equal(timers[0].cleared, true);
  assert.equal(hold.holding, false);
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' });
  timers[1].fn();
  assert.equal(held, 1);
  assert.equal(hold.holding, false);
  assert.equal(I.escHoldInput(hold, { type: 'keyDown', key: 'Escape', control: true }), false);
  assert.equal(I.escHoldInput(hold, { type: 'keyDown', key: 'a' }), false);
});

test('전역 단축키: Ctrl+Alt+M, 이미 쓰이면 경고만', () => {
  assert.equal(I.PET_QUICK_ACCELERATOR, 'Control+Alt+M');
  const registered = [];
  const warnings = [];
  const ok = I.registerShortcut({ register: (acc, fn) => { registered.push([acc, fn]); return true; } }, I.PET_QUICK_ACCELERATOR, () => {}, (m) => warnings.push(m));
  assert.equal(ok, true);
  assert.equal(registered[0][0], 'Control+Alt+M');
  assert.equal(I.registerShortcut({ register: () => false }, 'Control+Alt+M', () => {}, (m) => warnings.push(m)), false);
  assert.equal(I.registerShortcut({ register: () => { throw new Error('bad'); } }, 'x', () => {}, (m) => warnings.push(m)), false);
  assert.equal(warnings.length, 2);
});

test('Esc 길게 누르기가 끝난 뒤 계속 누르고 있어도(자동 반복) 다시 재지 않는다 — 떼면 다음 누름은 새로', () => {
  const timers = [];
  let held = 0;
  const hold = I.createEscHold({
    onHold: () => { held += 1; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
    clearTimeout: (id) => { timers[id].cleared = true; },
  });
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' });
  timers[0].fn();
  assert.equal(held, 1);
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape', isAutoRepeat: true });
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape', isAutoRepeat: true });
  assert.equal(timers.length, 1, '자동 반복이 타이머를 다시 걸지 않는다');
  I.escHoldInput(hold, { type: 'keyUp', key: 'Escape' });
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' });
  assert.equal(timers.length, 2, '뗀 뒤 새 누름은 다시 잰다');
  hold.cancel();
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' });
  assert.equal(timers.length, 3, '취소(창 blur) 뒤에도 새로 잰다');
});

test('중지 확인이 떠 있을 때 Esc keyDown 은 확인을 닫고, 뗄 때까지 새 1.3초를 재지 않는다', () => {
  const timers = [];
  let confirming = false;
  let held = 0;
  let dismissed = 0;
  const hold = I.createEscHold({
    onHold: () => { held += 1; confirming = true; },
    isConfirming: () => confirming,
    onDismiss: () => { dismissed += 1; confirming = false; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
    clearTimeout: (id) => { timers[id].cleared = true; },
  });
  // 1.3초 눌러 확인을 연 뒤 뗀다.
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' });
  timers[0].fn();
  I.escHoldInput(hold, { type: 'keyUp', key: 'Escape' });
  assert.equal(held, 1);
  // 확인이 떠 있는 동안 새로 누르면 닫기만 한다.
  assert.equal(hold.keyDown(), false);
  assert.equal(dismissed, 1, 'Esc keyDown 이 확인을 닫는다');
  assert.equal(timers.length, 1, '닫은 누름은 1.3초를 재지 않는다');
  assert.equal(hold.latched, true);
  // 계속 누르고 있어도(자동 반복) 다시 열리지 않는다.
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape', isAutoRepeat: true });
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape', isAutoRepeat: true });
  assert.equal(timers.length, 1);
  assert.equal(held, 1, '확인이 다시 열리지 않는다');
  // 떼고 새로 누르면 다시 잰다.
  I.escHoldInput(hold, { type: 'keyUp', key: 'Escape' });
  assert.equal(hold.latched, false);
  I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' });
  assert.equal(timers.length, 2, '뗀 뒤 새 누름은 다시 잰다');
  assert.equal(dismissed, 1);
});

test('latch(): 페이지가 확인을 닫은 지금 눌린 Esc 를 keyUp 까지 잠그고, 눌린 키가 없으면 다음 누름을 삼키지 않는다', () => {
  const timers = [];
  let held = 0;
  const hold = I.createEscHold({
    onHold: () => { held += 1; },
    isConfirming: () => { throw new Error('판정 실패는 확인이 없는 것으로'); },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
    clearTimeout: (id) => { timers[id].cleared = true; },
  });
  // 버튼으로 연 확인(메인은 모른다)을 Esc 로 닫는 경우: 메인은 이미 재기 시작했다.
  assert.equal(hold.keyDown(), true);
  assert.equal(hold.latch(), true);
  assert.equal(timers[0].cleared, true, '재던 1.3초를 버린다');
  hold.keyDown();
  assert.equal(timers.length, 1, '잠긴 누름은 다시 재지 않는다');
  assert.equal(held, 0);
  hold.keyUp();
  assert.equal(hold.latch(), false, '눌린 키가 없으면 잠그지 않는다');
  assert.equal(hold.keyDown(), true, '다음 누름은 새로 잰다');
});

test('전역 단축키는 macOS 에서도 같은 문자열 — Control(⌃)+Alt(⌥)+M, CommandOrControl 이 아니다(프로토타입 ⌃⌥M)', () => {
  assert.doesNotMatch(I.PET_QUICK_ACCELERATOR, /Command|Cmd|Super|Meta/);
  assert.deepEqual(I.PET_QUICK_ACCELERATOR.split('+'), ['Control', 'Alt', 'M']);
});

test('Esc 길게 누르기는 수정키 없는 Esc 만 — macOS 의 ⌘Esc(meta)도 재지 않는다', () => {
  const calls = [];
  const hold = { keyDown: () => calls.push('down'), keyUp: () => calls.push('up') };
  for (const mod of ['meta', 'control', 'alt', 'shift']) {
    assert.equal(I.escHoldInput(hold, { type: 'keyDown', key: 'Escape', [mod]: true }), false, mod);
  }
  assert.equal(I.escHoldInput(hold, { type: 'keyDown', key: 'Escape' }), true);
  assert.equal(I.escHoldInput(hold, { type: 'keyUp', key: 'Escape' }), true);
  assert.deepEqual(calls, ['down', 'up']);
});

test('가로 좌표가 오면 끌기는 두 축 — drag-move 에 dx 를 싣고, 가로 3px 만으로도 끌기', () => {
  const g = I.createPointerGesture({ now: () => 0 });
  assert.deepEqual(I.applyPointerSignal(g, 'pet:press', { pressed: true }), [{ type: 'press' }]);
  // press 에는 좌표가 없고 begin 이 두 축을 채운다.
  assert.deepEqual(I.applyPointerSignal(g, 'pet:drag', { phase: 'begin', screenY: 300, screenX: 1000 }), []);
  assert.deepEqual(I.applyPointerSignal(g, 'pet:drag', { phase: 'move', screenY: 301, screenX: 1002 }), []);
  assert.deepEqual(I.applyPointerSignal(g, 'pet:drag', { phase: 'move', screenY: 300, screenX: 997 }),
    [{ type: 'drag-begin' }, { type: 'drag-move', dy: 0, dx: -3 }]);
  assert.deepEqual(I.applyPointerSignal(g, 'pet:drag', { phase: 'move', screenY: 320, screenX: 900 }), [{ type: 'drag-move', dy: 20, dx: -97 }]);
  assert.deepEqual(types(I.applyPointerSignal(g, 'pet:drag', { phase: 'end', screenY: 320, screenX: 900 })), ['drag-end', 'release']);
  // 가로 없이 오면 예전 모양 그대로(dx 없음).
  const v = I.createPointerGesture({ now: () => 0 });
  v.down(500);
  assert.deepEqual(v.move(510), [{ type: 'drag-begin' }, { type: 'drag-move', dy: 10 }]);
});
