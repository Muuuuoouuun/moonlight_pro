'use strict';
// 펫 창 배치 규칙 — Electron 없이 테스트할 수 있게 순수 함수만 둔다.
// 좌표는 Windows DIP, y는 위에서 아래로 자란다(Mac의 아래→위 좌표를 뒤집어 옮겼다).
// 출처: prototypes/moonlight-pet-macos WindowCoordinator·PanelInteraction(PanelGeometry·ScreenDragTracker).
const C = require('../shared/contract');

const SAFE_INSET = 8; // Mac PanelGeometry.fitted — 작업 영역 가장자리에서 8px 안쪽
const DRAG_THRESHOLD = 3; // 3px 넘게 움직여야 끌기로 본다(그 전은 클릭)
const MIN_CONTENT_HEIGHT = 160;

const round = (rect) => ({
  x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
});

// 펫 모드별 유리 창 크기. Acrylic 창은 시스템 그림자를 쓰므로 Mac의 8px 여백을 뺀 유리만 창이 된다
// (contract.glassSize). 메모는 Mac 크기에 걸친 캐릭터 띠(54px)가 이미 들어 있어(MEMO_ALREADY_HAS_STRIP)
// 그만큼 뺀다 — 걸친 캐릭터는 유리 창이 아니라 따로 뜬 72×72 창이 그린다.
function panelGlassSize(mode) {
  const size = C.glassSize(mode);
  if (mode === 'memo' && C.MEMO_ALREADY_HAS_STRIP) return { width: size.width, height: size.height - C.PERCH_STRIP };
  return size;
}

// 걸친 캐릭터가 보이는가: 지속 위젯은 언제나, 빠른 패널은 메모일 때만(2026-09-25 메모 걸치기 스펙).
function isPerched({ presentation, mode }) {
  return presentation === 'widget' || mode === 'memo';
}

// 창 전체를 작업 영역의 8px 안쪽으로 밀어 넣는다. 너무 크면 작업 영역에 맞춰 줄인다.
function fitted(frame, workArea, inset = SAFE_INSET) {
  const safe = {
    x: workArea.x + inset,
    y: workArea.y + inset,
    width: Math.max(1, workArea.width - inset * 2),
    height: Math.max(1, workArea.height - inset * 2),
  };
  const width = Math.min(frame.width, safe.width);
  const height = Math.min(frame.height, safe.height);
  const x = Math.min(Math.max(frame.x, safe.x), safe.x + safe.width - width);
  const y = Math.min(Math.max(frame.y, safe.y), safe.y + safe.height - height);
  return round({ x, y, width, height });
}

// 처음 위치: 작업 영역 오른쪽 가장자리에서 8px, 아래쪽 1/3 지점(펫 아래 끝이 아래에서 1/3 높이).
function defaultPetBounds(workArea) {
  return round({
    x: workArea.x + workArea.width - C.PET_SIZE - C.PET_EDGE_INSET,
    y: workArea.y + workArea.height - workArea.height / 3 - C.PET_SIZE,
    width: C.PET_SIZE,
    height: C.PET_SIZE,
  });
}

// 펫은 늘 그 화면의 오른쪽 가장자리에 붙는다. 세로 위치만 기억하고 작업 영역 안으로 맞춘다.
function petBoundsAt(y, workArea) {
  const x = workArea.x + workArea.width - C.PET_SIZE - C.PET_EDGE_INSET;
  const top = Math.min(Math.max(y, workArea.y + SAFE_INSET), workArea.y + workArea.height - SAFE_INSET - C.PET_SIZE);
  return round({ x, y: top, width: C.PET_SIZE, height: C.PET_SIZE });
}

function intersectionArea(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function distanceToRect(point, rect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

// 창이 가장 많이 겹치는 화면, 없으면 가장 가까운 화면. displays = [{ id, bounds, workArea }].
function displayFor(rect, displays) {
  if (!displays || !displays.length) return null;
  let best = null;
  let bestArea = 0;
  for (const display of displays) {
    const area = intersectionArea(rect, display.bounds || display.workArea);
    if (area > bestArea) {
      best = display;
      bestArea = area;
    }
  }
  if (best) return best;
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  return displays.reduce((a, b) => (distanceToRect(centre, b.workArea) < distanceToRect(centre, a.workArea) ? b : a));
}

// 저장된 위치(pet.position {x, y}) → 지금 모니터 배치의 펫 자리. 없으면 주 화면 기본 위치.
// 모니터가 빠지거나 해상도가 바뀌어도 같은 규칙으로 다시 맞춘다(멀티 모니터 refit).
function resolvePetBounds(saved, displays, primary) {
  const valid = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y);
  if (!valid) return defaultPetBounds(primary.workArea);
  const display = displayFor({ x: saved.x, y: saved.y, width: C.PET_SIZE, height: C.PET_SIZE }, displays) || primary;
  return petBoundsAt(saved.y, display.workArea);
}

// 빠른 패널·위젯은 유리와(걸쳤으면) 그 위 54px 띠를 한 덩어리(companion)로 놓는다.
function companionSize(glass, perched) {
  return { width: glass.width, height: glass.height + (perched ? C.PERCH_STRIP : 0) };
}

// 빠른 패널: 펫 왼쪽 10px, 덩어리의 세로 중심을 펫 세로 중심에 맞춘다.
function quickCompanionFrame(pet, glass, perched, workArea) {
  const size = companionSize(glass, perched);
  return fitted({
    x: pet.x - C.PANEL_GAP - size.width,
    y: pet.y + pet.height / 2 - size.height / 2,
    ...size,
  }, workArea);
}

// 지속 위젯: 덩어리의 오른쪽 위가 펫의 오른쪽 위에 온다(그동안 펫은 숨는다).
function widgetCompanionFrame(pet, glass, perched, workArea) {
  const size = companionSize(glass, perched);
  return fitted({ x: pet.x + pet.width - size.width, y: pet.y, ...size }, workArea);
}

// 크기를 바꿀 때 오른쪽 위를 고정한다(Mac resizedKeepingTopRight — 위에서 자라는 좌표계라 y는 그대로).
function resizedKeepingTopRight(frame, size, workArea) {
  return fitted({ x: frame.x + frame.width - size.width, y: frame.y, ...size }, workArea);
}

function glassFromCompanion(companion, perched) {
  const strip = perched ? C.PERCH_STRIP : 0;
  return round({ x: companion.x, y: companion.y + strip, width: companion.width, height: companion.height - strip });
}

// 걸친 캐릭터 창: 유리 오른쪽에서 20px 안쪽, 유리 위 54px에서 시작하는 72×72(유리와 18px 겹침).
function perchBounds(glass) {
  return round({
    x: glass.x + glass.width - C.PERCH_INSET_RIGHT - C.PERCH_SIZE,
    y: glass.y - C.PERCH_STRIP,
    width: C.PERCH_SIZE,
    height: C.PERCH_SIZE,
  });
}

// 위젯에서 펫이 돌아올 자리: 덩어리 오른쪽 위(Mac alignPet — 펫 위 끝 = 위젯 위 끝).
function petAlignedToCompanion(companion, workArea) {
  return petBoundsAt(companion.y, workArea);
}

// 짧은 메시지: 펫 왼쪽, 세로 중심(Mac previewWindow 자리).
function bubbleBounds(pet, workArea) {
  const { width, height } = C.BUBBLE_SIZE;
  return fitted({ x: pet.x - C.PANEL_GAP - width, y: pet.y + pet.height / 2 - height / 2, width, height }, workArea);
}

// 패널이 요청한 유리 높이를 자른다: 최소 160, 최대는 작업 영역 안쪽(걸친 띠 몫은 뺀다).
function clampContentHeight(value, workArea, perched) {
  const px = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(px)) return null;
  const max = workArea.height - SAFE_INSET * 2 - (perched ? C.PERCH_STRIP : 0);
  return Math.round(Math.min(Math.max(px, MIN_CONTENT_HEIGHT), Math.max(MIN_CONTENT_HEIGHT, max)));
}

// 세로 끌기(화면 좌표). 3px을 넘기 전엔 클릭 후보(null), 넘은 뒤엔 직전 위치와의 거리(dy)를 돌려준다.
function createDragTracker(threshold = DRAG_THRESHOLD) {
  let previous = null;
  let dragging = false;
  return {
    begin(screenY) {
      previous = Number.isFinite(screenY) ? screenY : null;
      dragging = false;
    },
    move(screenY) {
      if (previous === null || !Number.isFinite(screenY)) return null;
      if (!dragging) {
        if (Math.abs(screenY - previous) < threshold) return null;
        dragging = true;
      }
      const dy = screenY - previous;
      previous = screenY;
      return dy;
    },
    // 끝낸 제스처가 끌기였는지 돌려준다.
    end() {
      const was = dragging;
      previous = null;
      dragging = false;
      return was;
    },
    get active() { return previous !== null; },
    get dragging() { return dragging; },
  };
}

// 창을 세로로 dy만큼 옮기고 작업 영역에 맞춘다.
function movedVertically(frame, dy, workArea) {
  return fitted({ ...frame, y: frame.y + dy }, workArea);
}

module.exports = {
  SAFE_INSET,
  DRAG_THRESHOLD,
  MIN_CONTENT_HEIGHT,
  panelGlassSize,
  isPerched,
  fitted,
  defaultPetBounds,
  petBoundsAt,
  displayFor,
  resolvePetBounds,
  companionSize,
  quickCompanionFrame,
  widgetCompanionFrame,
  resizedKeepingTopRight,
  glassFromCompanion,
  perchBounds,
  petAlignedToCompanion,
  bubbleBounds,
  clampContentHeight,
  createDragTracker,
  movedVertically,
};
