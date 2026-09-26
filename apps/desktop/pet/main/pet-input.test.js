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
