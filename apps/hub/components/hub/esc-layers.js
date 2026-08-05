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
