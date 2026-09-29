'use strict';
// 펫 창 배치 규칙 — Electron 없이 테스트할 수 있게 순수 함수만 둔다.
// 좌표는 Electron 화면 좌표(Windows DIP · macOS pt), y는 위에서 아래로 자란다(Mac의 아래→위 좌표를 뒤집어 옮겼다).
// 작업 영역(workArea)은 Windows 작업 표시줄, macOS 메뉴 막대·Dock(오른쪽 Dock 포함)을 이미 뺀 값이라 같은 규칙이 둘 다 맞는다.
// 출처: prototypes/moonlight-pet-macos WindowCoordinator·PanelInteraction(PanelGeometry·ScreenDragTracker).
const C = require('../shared/contract');

const SAFE_INSET = 8; // Mac PanelGeometry.fitted — 작업 영역 가장자리에서 8px 안쪽
const DRAG_THRESHOLD = 3; // 3px 넘게 움직여야 끌기로 본다(그 전은 클릭)
const MIN_CONTENT_HEIGHT = 160;

const sideOf = (side) => (side === 'left' ? 'left' : 'right'); // 모르는 값은 기본(오른쪽)
const isLeft = (side) => side === 'left';

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

// 펫의 가로 자리: 고른 가장자리(side, 기본 오른쪽)에서 8px 안쪽.
function petEdgeX(workArea, side = 'right') {
  return isLeft(side)
    ? workArea.x + C.PET_EDGE_INSET
    : workArea.x + workArea.width - C.PET_SIZE - C.PET_EDGE_INSET;
}

// 처음 위치: 작업 영역 가장자리(기본 오른쪽)에서 8px, 아래쪽 1/3 지점(펫 아래 끝이 아래에서 1/3 높이).
function defaultPetBounds(workArea, side = 'right') {
  return round({
    x: petEdgeX(workArea, side),
    y: workArea.y + workArea.height - workArea.height / 3 - C.PET_SIZE,
    width: C.PET_SIZE,
    height: C.PET_SIZE,
  });
}

// 펫은 늘 그 화면의 한쪽 가장자리(기본 오른쪽)에 붙는다. 세로 위치만 기억하고 작업 영역 안으로 맞춘다.
function petBoundsAt(y, workArea, side = 'right') {
  const top = Math.min(Math.max(y, workArea.y + SAFE_INSET), workArea.y + workArea.height - SAFE_INSET - C.PET_SIZE);
  return round({ x: petEdgeX(workArea, side), y: top, width: C.PET_SIZE, height: C.PET_SIZE });
}

// 세로 자리를 작업 영역 안 비율(0 = 위 끝, 1 = 아래 끝)로 — 높이가 다른 모니터로 옮겨도 같은 높이감에 선다.
function petYRatio(y, workArea) {
  const top = workArea.y + SAFE_INSET;
  const span = workArea.height - SAFE_INSET * 2 - C.PET_SIZE;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (y - top) / span));
}
function petYFromRatio(ratio, workArea) {
  const span = Math.max(0, workArea.height - SAFE_INSET * 2 - C.PET_SIZE);
  return workArea.y + SAFE_INSET + Math.min(1, Math.max(0, ratio)) * span;
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

// 점을 담은 화면(bounds 기준), 없으면 작업 영역이 가장 가까운 화면.
function displayAt(point, displays) {
  if (!displays || !displays.length) return null;
  const inside = displays.find((d) => {
    const b = d.bounds || d.workArea;
    return point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height;
  });
  if (inside) return inside;
  return displays.reduce((a, b) => (distanceToRect(point, b.workArea) < distanceToRect(point, a.workArea) ? b : a));
}

// 저장된 자리(pet.position) → 지금 모니터 배치의 { bounds, side, displayId }.
//   { displayId, side, ratio, x, y } — displayId 화면이 있으면 그 화면의 같은 가장자리·같은 세로 비율.
//   그 화면이 빠졌으면 x·y 에 가장 가까운 화면으로(가장자리·비율 유지). 예전 모양 { x, y } 는 오른쪽·y 그대로.
//   아무것도 없으면 주 화면 오른쪽 기본 위치. 모니터가 빠지거나 해상도가 바뀌어도 같은 규칙으로 다시 맞춘다(refit).
function resolvePetPlacement(saved, displays, primary) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const side = sideOf(s.side);
  const hasRatio = Number.isFinite(s.ratio);
  const hasXY = Number.isFinite(s.x) && Number.isFinite(s.y);
  const list = displays && displays.length ? displays : [primary];
  let display = s.displayId !== undefined && s.displayId !== null ? list.find((d) => d.id === s.displayId) : null;
  if (!display && hasXY) display = displayFor({ x: s.x, y: s.y, width: C.PET_SIZE, height: C.PET_SIZE }, list);
  if (!display) display = primary;
  const wa = display.workArea;
  let bounds;
  if (hasRatio) bounds = petBoundsAt(petYFromRatio(s.ratio, wa), wa, side);
  else if (hasXY) bounds = petBoundsAt(s.y, wa, side);
  else bounds = defaultPetBounds(wa, side);
  return { bounds, side, displayId: display.id };
}

// 예전 호출(자리만). 저장 모양은 resolvePetPlacement 참고.
function resolvePetBounds(saved, displays, primary) {
  return resolvePetPlacement(saved, displays, primary).bounds;
}

// 다른 모니터로 옮기기: 같은 가장자리, 같은 세로 비율.
function petBoundsOnDisplay(display, side, ratio) {
  const wa = display.workArea;
  return petBoundsAt(petYFromRatio(Number.isFinite(ratio) ? ratio : 2 / 3, wa), wa, side);
}

// 자유 끌기 중의 펫 자리: 펫 가운데가 있는 화면의 작업 영역 안(8px). 가운데가 화면을 넘어가면 그 화면으로 건너간다.
function freeDragBounds(raw, displays) {
  const rect = { x: raw.x, y: raw.y, width: C.PET_SIZE, height: C.PET_SIZE };
  const display = displayAt({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, displays);
  return display ? fitted(rect, display.workArea) : round(rect);
}

// 끌기를 놓으면: 펫 가운데가 있는 화면의 가까운 가장자리(왼쪽·오른쪽)로 붙고, 세로는 그 작업 영역 안.
function snapPetToEdge(rect, displays) {
  const centre = { x: rect.x + (rect.width || C.PET_SIZE) / 2, y: rect.y + (rect.height || C.PET_SIZE) / 2 };
  const display = displayAt(centre, displays);
  const wa = display.workArea;
  const side = centre.x < wa.x + wa.width / 2 ? 'left' : 'right';
  return { bounds: petBoundsAt(rect.y, wa, side), side, displayId: display.id };
}

// 빠른 패널·위젯은 유리와(걸쳤으면) 그 위 54px 띠를 한 덩어리(companion)로 놓는다.
function companionSize(glass, perched) {
  return { width: glass.width, height: glass.height + (perched ? C.PERCH_STRIP : 0) };
}

// 빠른 패널: 펫의 화면 가운데 쪽 10px(오른쪽 가장자리면 왼쪽), 덩어리의 세로 중심을 펫 세로 중심에 맞춘다.
function quickCompanionFrame(pet, glass, perched, workArea, side = 'right') {
  const size = companionSize(glass, perched);
  return fitted({
    x: isLeft(side) ? pet.x + pet.width + C.PANEL_GAP : pet.x - C.PANEL_GAP - size.width,
    y: pet.y + pet.height / 2 - size.height / 2,
    ...size,
  }, workArea);
}

// 지속 위젯: 덩어리의 바깥쪽 위 모서리가 펫의 바깥쪽 위 모서리에 온다(오른쪽 가장자리면 오른쪽 위, 왼쪽이면 왼쪽 위).
// 그동안 펫은 숨는다.
function widgetCompanionFrame(pet, glass, perched, workArea, side = 'right') {
  const size = companionSize(glass, perched);
  return fitted({ x: isLeft(side) ? pet.x : pet.x + pet.width - size.width, y: pet.y, ...size }, workArea);
}

// 크기를 바꿀 때 오른쪽 위를 고정한다(Mac resizedKeepingTopRight — 위에서 자라는 좌표계라 y는 그대로).
function resizedKeepingTopRight(frame, size, workArea) {
  return fitted({ x: frame.x + frame.width - size.width, y: frame.y, ...size }, workArea);
}

// 가장자리 쪽 위 모서리를 고정한다 — 오른쪽 가장자리면 오른쪽 위(위와 같다), 왼쪽이면 왼쪽 위.
function resizedKeepingOuterTop(frame, size, workArea, side = 'right') {
  if (!isLeft(side)) return resizedKeepingTopRight(frame, size, workArea);
  return fitted({ x: frame.x, y: frame.y, ...size }, workArea);
}

function glassFromCompanion(companion, perched) {
  const strip = perched ? C.PERCH_STRIP : 0;
  return round({ x: companion.x, y: companion.y + strip, width: companion.width, height: companion.height - strip });
}

// 걸친 캐릭터 창: 유리 바깥쪽(오른쪽 가장자리면 오른쪽, 왼쪽이면 왼쪽)에서 20px 안쪽,
// 유리 위 54px에서 시작하는 72×72(유리와 18px 겹침).
function perchBounds(glass, side = 'right') {
  return round({
    x: isLeft(side) ? glass.x + C.PERCH_INSET_RIGHT : glass.x + glass.width - C.PERCH_INSET_RIGHT - C.PERCH_SIZE,
    y: glass.y - C.PERCH_STRIP,
    width: C.PERCH_SIZE,
    height: C.PERCH_SIZE,
  });
}

// 위젯에서 펫이 돌아올 자리: 덩어리의 바깥쪽 위(Mac alignPet — 펫 위 끝 = 위젯 위 끝).
function petAlignedToCompanion(companion, workArea, side = 'right') {
  return petBoundsAt(companion.y, workArea, side);
}

// 짧은 메시지: 펫의 화면 가운데 쪽(오른쪽 가장자리면 왼쪽), 세로 중심(Mac previewWindow 자리).
function bubbleBounds(pet, workArea, side = 'right') {
  const { width, height } = C.BUBBLE_SIZE;
  const x = isLeft(side) ? pet.x + pet.width + C.PANEL_GAP : pet.x - C.PANEL_GAP - width;
  return fitted({ x, y: pet.y + pet.height / 2 - height / 2, width, height }, workArea);
}

// 패널이 요청한 유리 높이를 자른다: 최소 160, 최대는 작업 영역 안쪽(걸친 띠 몫은 뺀다).
function clampContentHeight(value, workArea, perched) {
  const px = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(px)) return null;
  const max = workArea.height - SAFE_INSET * 2 - (perched ? C.PERCH_STRIP : 0);
  return Math.round(Math.min(Math.max(px, MIN_CONTENT_HEIGHT), Math.max(MIN_CONTENT_HEIGHT, max)));
}

// 끌기(화면 좌표). 3px을 넘기 전엔 클릭 후보(null), 넘은 뒤엔 직전 위치와의 거리(dy)를 돌려준다.
// 가로 좌표(screenX)도 받으면 두 축 중 하나라도 3px 을 넘을 때 끌기가 되고, 직전 가로 거리는 lastDx 로 읽는다
// (가로를 주지 않으면 예전과 같이 세로만 — lastDx 는 0).
function createDragTracker(threshold = DRAG_THRESHOLD) {
  let previous = null;
  let previousX = null;
  let lastDx = 0;
  let dragging = false;
  return {
    begin(screenY, screenX) {
      previous = Number.isFinite(screenY) ? screenY : null;
      previousX = previous !== null && Number.isFinite(screenX) ? screenX : null;
      lastDx = 0;
      dragging = false;
    },
    move(screenY, screenX) {
      if (previous === null || !Number.isFinite(screenY)) return null;
      const dx = previousX !== null && Number.isFinite(screenX) ? screenX - previousX : 0;
      if (!dragging) {
        if (Math.abs(screenY - previous) < threshold && Math.abs(dx) < threshold) return null;
        dragging = true;
      }
      const dy = screenY - previous;
      previous = screenY;
      if (previousX !== null && Number.isFinite(screenX)) previousX = screenX;
      lastDx = dx;
      return dy;
    },
    // 끝낸 제스처가 끌기였는지 돌려준다.
    end() {
      const was = dragging;
      previous = null;
      previousX = null;
      lastDx = 0;
      dragging = false;
      return was;
    },
    get lastDx() { return lastDx; },
    get tracksX() { return previousX !== null; },
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
  petEdgeX,
  defaultPetBounds,
  petBoundsAt,
  petYRatio,
  petYFromRatio,
  displayFor,
  displayAt,
  resolvePetPlacement,
  resolvePetBounds,
  petBoundsOnDisplay,
  freeDragBounds,
  snapPetToEdge,
  companionSize,
  quickCompanionFrame,
  widgetCompanionFrame,
  resizedKeepingTopRight,
  resizedKeepingOuterTop,
  glassFromCompanion,
  perchBounds,
  petAlignedToCompanion,
  bubbleBounds,
  clampContentHeight,
  createDragTracker,
  movedVertically,
};
