// ESC 레이어 스택 — 겹쳐 뜬 표면(드로어 위 ⌘K 팔레트 등)에서 ESC는 최상위 레이어 하나만
// 닫아야 한다. Drawer와 CommandPalette가 무조건 window keydown을 각자 처리하면서 ESC 한 번에
// 둘 다 닫히고, dirty 드로어면 원치 않은 "변경사항을 버릴까요?" confirm까지 떴다(2026-08-05
// system-eval U-S2). 모듈 스코프 스택이라 파일이 달라도 등록 순서 = 시각적 스택 순서를 공유한다.

const stack = [];
let seq = 0;

export function pushEscLayer() {
  seq += 1;
  const token = seq;
  stack.push(token);
  return token;
}

export function popEscLayer(token) {
  const index = stack.lastIndexOf(token);
  if (index !== -1) stack.splice(index, 1);
}

export function isTopEscLayer(token) {
  return stack.length > 0 && stack[stack.length - 1] === token;
}

export function hasOpenEscLayer() {
  return stack.length > 0;
}

// 안드로이드 시스템 뒤로 가기 등 물리적 ESC 키가 없는 모바일 환경에서 최상위 오버레이 하나만 닫는다.
// 각 오버레이(Drawer · CommandPalette · ShortcutOverlay · FloatingMentorWidget)는 window keydown('Escape')을
// 듣고 isTopEscLayer로 최상위만 처리하므로, EditDrawer 미저장 확인이나 GlobalQuickCapture 저장 중 닫기 방지
// 계약도 그대로 유지된다.
export function dismissTopEscLayer(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (stack.length === 0 || !targetWindow || typeof targetWindow.dispatchEvent !== 'function') return false;
  const EventCtor = targetWindow.KeyboardEvent;
  const event = typeof EventCtor === 'function'
    ? new EventCtor('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    : { type: 'keydown', key: 'Escape', bubbles: true, cancelable: true, preventDefault() {} };
  targetWindow.dispatchEvent(event);
  return true;
}

