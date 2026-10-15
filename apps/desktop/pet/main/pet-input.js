'use strict';
// 펫 입력 규칙 — 클릭 모델·세로 끌기·Esc 길게 누르기·전역 단축키. 순수 상태 기계라 Electron 없이 테스트한다.
//
// 클릭 모델(Mac PetClickView): 한 번 클릭 → 빠른 패널을 바로 연다(두 번째 클릭을 기다리지 않는다),
// 두 번 클릭 → 지속 위젯, 오른쪽 클릭 → 캐릭터 메뉴(렌더러가 pet:context-menu), 3px 넘게 움직이면 끌기.
// 끌기는 세로(screenY)가 기본이고, 가로(screenX)까지 오면 drag-move 에 dx 도 싣는다 — 펫은 자유롭게 끌고 놓으면
// 가까운 가장자리로 붙는다(pet-main). 렌더러가 screenX 를 보내지 않으면 메인이 커서 위치로 채운다.
// 펫 렌더러는 포인터 신호만 보낸다 — pointerdown: pet:press {pressed:true} + pet:drag {phase:'begin', screenY},
// pointermove: pet:drag {phase:'move', screenY}, pointerup: pet:drag {phase:'end'} + pet:press {pressed:false},
// 포인터를 잃으면 pet:drag {phase:'cancel'} (그 뒤의 pet:press {pressed:false} 는 이미 뗀 제스처라 아무 일도 없다).
// 순서가 섞여 와도 한 제스처로 묶고, 클릭·더블 클릭 판정은 메인이 한다.
const { createDragTracker, DRAG_THRESHOLD } = require('./pet-geometry');

const DOUBLE_CLICK_MS = 500; // Windows 기본 더블 클릭 시간
const ESC_HOLD_MS = 1300; // 집중 화면: Esc를 1.3초 누르면 중지 확인
const PET_QUICK_ACCELERATOR = 'Control+Alt+M';

function createPointerGesture(options = {}) {
  const now = options.now || Date.now;
  const doubleClickMs = options.doubleClickMs || DOUBLE_CLICK_MS;
  const tracker = createDragTracker(options.threshold || DRAG_THRESHOLD);
  let down = false;
  let lastClickAt = -Infinity;

  return {
    get isDown() { return down; },
    get isDragging() { return tracker.dragging; },
    // 누름 시작(pet:press true 또는 pet:drag begin). 이미 눌렸는데 시작 좌표가 없었으면 좌표만 채운다.
    down(screenY, screenX) {
      if (down) {
        if (!tracker.active && Number.isFinite(screenY)) tracker.begin(screenY, screenX);
        return [];
      }
      down = true;
      tracker.begin(screenY, screenX);
      return [{ type: 'press' }];
    },
    move(screenY, screenX) {
      if (!down) return [];
      const wasDragging = tracker.dragging;
      const dy = tracker.move(screenY, screenX);
      if (dy === null) return [];
      const step = tracker.tracksX ? { type: 'drag-move', dy, dx: tracker.lastDx } : { type: 'drag-move', dy };
      return wasDragging ? [step] : [{ type: 'drag-begin' }, step];
    },
    // 뗌(pet:drag end 또는 pet:press false). 끌기였으면 drag-end, 아니면 click / double-click.
    up() {
      if (!down) return [];
      down = false;
      if (tracker.end()) return [{ type: 'drag-end' }, { type: 'release' }];
      const at = now();
      if (at - lastClickAt <= doubleClickMs) {
        lastClickAt = -Infinity; // 세 번째 클릭은 새 한 번 클릭
        return [{ type: 'release' }, { type: 'double-click' }];
      }
      lastClickAt = at;
      return [{ type: 'release' }, { type: 'click' }];
    },
    // 창이 사라지거나 포인터를 잃었을 때 — 클릭으로 치지 않는다.
    cancel() {
      if (!down) return [];
      down = false;
      const wasDragging = tracker.end();
      return wasDragging ? [{ type: 'drag-end' }, { type: 'release' }] : [{ type: 'release' }];
    },
  };
}

// IPC 신호 → 제스처 동작. payload는 렌더러가 보낸 그대로라 한 번 더 거른다.
function applyPointerSignal(gesture, channel, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const screenY = Number.isFinite(p.screenY) ? p.screenY : undefined;
  const screenX = Number.isFinite(p.screenX) ? p.screenX : undefined;
  if (channel === 'pet:press') return p.pressed === true ? gesture.down(screenY, screenX) : gesture.up();
  if (channel === 'pet:drag') {
    if (p.phase === 'begin') return gesture.down(screenY, screenX);
    if (p.phase === 'move') return gesture.move(screenY, screenX);
    if (p.phase === 'end') return gesture.up();
    // 렌더러가 포인터를 잃었다(pointercancel·lostpointercapture·창 blur) — 클릭으로 치지 않는다.
    if (p.phase === 'cancel') return gesture.cancel();
  }
  return [];
}

// 집중 화면의 Esc 길게 누르기. 자동 반복 keyDown은 타이머를 다시 시작하지 않는다 — 길게 누르기가 한 번 끝난 뒤에도
// 키를 뗄 때까지는 다시 재지 않는다(계속 누르고 있어도 확인은 한 번).
// 중지 확인이 떠 있을 때(isConfirming() → true)의 Esc keyDown 은 확인을 닫고(onDismiss) 새 1.3초를 재지 않는다 —
// 그 누름은 keyUp 까지 잠겨서, 닫은 뒤에도 Esc 를 계속 누르고 있으면 확인이 다시 열리지 않는다.
// latch() 는 페이지가 확인을 닫았을 때(버튼으로 연 확인을 Esc 로 닫은 경우 등) 지금 눌린 Esc 를 같은 방식으로 잠근다.
function createEscHold(options = {}) {
  const holdMs = options.holdMs || ESC_HOLD_MS;
  const set = options.setTimeout || setTimeout;
  const clear = options.clearTimeout || clearTimeout;
  const onHold = options.onHold || (() => {});
  const onDismiss = options.onDismiss || (() => {});
  const isConfirming = typeof options.isConfirming === 'function' ? options.isConfirming : () => false;
  let timer = null;
  let pressed = false; // keyDown 을 받고 아직 keyUp·cancel 이 없다
  let latched = false; // 이번 누름은 이미 쓰였다(확인을 열었거나 닫았다) — keyUp·cancel 까지 다시 재지 않는다

  function stopTimer() {
    if (timer !== null) clear(timer);
    timer = null;
  }

  function confirming() {
    try {
      return isConfirming() === true;
    } catch {
      return false;
    }
  }

  return {
    keyDown() {
      pressed = true;
      if (timer !== null || latched) return false;
      if (confirming()) {
        latched = true;
        onDismiss();
        return false;
      }
      timer = set(() => {
        timer = null;
        latched = true;
        onHold();
      }, holdMs);
      return true;
    },
    keyUp() {
      const wasTiming = timer !== null;
      stopTimer();
      pressed = false;
      latched = false;
      return wasTiming;
    },
    cancel() {
      stopTimer();
      pressed = false;
      latched = false;
    },
    // 지금 눌린 Esc 를 keyUp 까지 잠근다(재던 1.3초도 버린다). 눌린 키가 없으면 아무 일도 없다 — 다음 누름을 삼키지 않게.
    latch() {
      if (!pressed) return false;
      stopTimer();
      latched = true;
      return true;
    },
    get holding() { return timer !== null; },
    get latched() { return latched; },
  };
}

// before-input-event 입력 → Esc 길게 누르기. 수정 키 없는 Escape만 잰다(결과: 이 입력을 쟀는가). 키는 막지 않는다 —
// 페이지가 같은 Esc 로 진행선을 그리고 떠 있는 중지 확인을 닫는다.
function escHoldInput(escHold, input) {
  if (!input || input.key !== 'Escape') return false;
  if (input.alt || input.control || input.meta || input.shift) return false;
  if (input.type === 'keyDown') {
    escHold.keyDown();
    return true;
  }
  if (input.type === 'keyUp') {
    escHold.keyUp();
    return true;
  }
  return false;
}

// 전역 단축키 등록. 다른 앱이 쓰고 있으면 false(경고만, 앱은 계속).
function registerShortcut(globalShortcut, accelerator, action, warn = console.warn) {
  try {
    if (globalShortcut.register(accelerator, action)) return true;
  } catch { /* 잘못된 가속기 */ }
  warn(`shortcut ${accelerator} is taken by another app`);
  return false;
}

module.exports = {
  DOUBLE_CLICK_MS,
  ESC_HOLD_MS,
  PET_QUICK_ACCELERATOR,
  createPointerGesture,
  applyPointerSignal,
  createEscHold,
  escHoldInput,
  registerShortcut,
};
