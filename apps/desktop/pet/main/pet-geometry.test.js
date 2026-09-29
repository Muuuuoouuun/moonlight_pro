'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/contract');
const G = require('./pet-geometry');

const WA = { x: 0, y: 0, width: 1440, height: 852 }; // 1440×900 화면, 작업 표시줄 48px
const PRIMARY = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: WA };
const RIGHT = { id: 2, bounds: { x: 1440, y: -200, width: 1920, height: 1080 }, workArea: { x: 1440, y: -200, width: 1920, height: 1032 } };

test('기본 위치: 오른쪽 가장자리에서 8px, 아래쪽 1/3 (y는 위에서부터)', () => {
  const pet = G.defaultPetBounds(WA);
  assert.deepEqual(pet, { x: 1440 - 56 - 8, y: Math.round(852 - 852 / 3 - 56), width: 56, height: 56 });
  // 작업 영역이 위에 있는 두 번째 화면에서도 같은 규칙.
  const other = G.defaultPetBounds(RIGHT.workArea);
  assert.equal(other.x, 1440 + 1920 - 64);
  assert.equal(other.y, Math.round(-200 + 1032 - 1032 / 3 - 56));
});

test('fitted: 작업 영역 8px 안쪽으로 밀고, 크면 줄인다', () => {
  assert.deepEqual(G.fitted({ x: -40, y: -40, width: 100, height: 100 }, WA), { x: 8, y: 8, width: 100, height: 100 });
  assert.deepEqual(G.fitted({ x: 1400, y: 820, width: 100, height: 100 }, WA), { x: 1440 - 8 - 100, y: 852 - 8 - 100, width: 100, height: 100 });
  assert.deepEqual(G.fitted({ x: 0, y: 0, width: 3000, height: 2000 }, WA), { x: 8, y: 8, width: 1424, height: 836 });
});

test('유리 크기: contract.glassSize, 메모는 걸친 띠 몫을 뺀다', () => {
  assert.deepEqual(G.panelGlassSize('tasks'), { width: 320, height: 488 });
  assert.deepEqual(G.panelGlassSize('memo'), { width: 504, height: 440 - 16 - 54 });
  assert.deepEqual(G.panelGlassSize('nope'), C.glassSize('tasks'));
  assert.equal(G.isPerched({ presentation: 'quick', mode: 'tasks' }), false);
  assert.equal(G.isPerched({ presentation: 'quick', mode: 'memo' }), true);
  assert.equal(G.isPerched({ presentation: 'widget', mode: 'tasks' }), true);
});

test('빠른 패널: 펫 왼쪽 10px, 세로 중심 정렬, 화면 안', () => {
  const pet = G.defaultPetBounds(WA);
  const glass = G.panelGlassSize('tasks');
  const frame = G.quickCompanionFrame(pet, glass, false, WA);
  assert.equal(frame.x + frame.width, pet.x - C.PANEL_GAP);
  assert.equal(frame.y + frame.height / 2, pet.y + 28);
  assert.deepEqual(G.glassFromCompanion(frame, false), frame);
  // 펫이 화면 위 끝에 붙어 있으면 패널은 아래로 밀린다.
  const top = G.quickCompanionFrame({ ...pet, y: 8 }, glass, false, WA);
  assert.equal(top.y, 8);
  // 걸친 메모: 덩어리(유리+54) 중심이 펫 중심, 유리는 띠 아래.
  const memo = G.quickCompanionFrame(pet, G.panelGlassSize('memo'), true, WA);
  const memoGlass = G.glassFromCompanion(memo, true);
  assert.equal(memo.height, 370 + 54);
  assert.equal(memoGlass.y, memo.y + 54);
  assert.equal(memoGlass.height, 370);
});

test('위젯: 덩어리의 오른쪽 위 = 펫의 오른쪽 위, 유리는 54px 아래', () => {
  const pet = G.petBoundsAt(200, WA);
  const glass = G.panelGlassSize('tasks');
  const frame = G.widgetCompanionFrame(pet, glass, true, WA);
  assert.equal(frame.x + frame.width, pet.x + pet.width);
  assert.equal(frame.y, pet.y);
  const g = G.glassFromCompanion(frame, true);
  assert.equal(g.y, pet.y + C.PERCH_STRIP);
  assert.equal(g.x + g.width, pet.x + pet.width);
  assert.deepEqual(G.petAlignedToCompanion(frame, WA), pet);
});

test('걸친 캐릭터: 유리 오른쪽 20px 안쪽, 유리 위 54px, 18px 겹침', () => {
  const glass = { x: 1038, y: 323, width: 320, height: 488 };
  assert.deepEqual(G.perchBounds(glass), { x: 1038 + 320 - 20 - 72, y: 323 - 54, width: 72, height: 72 });
  assert.equal(G.perchBounds(glass).y + 72 - glass.y, 18);
});

test('크기 바꾸기: 오른쪽 위 고정', () => {
  const frame = { x: 1000, y: 100, width: 320, height: 488 };
  const next = G.resizedKeepingTopRight(frame, { width: 504, height: 370 }, WA);
  assert.equal(next.x + next.width, 1320);
  assert.equal(next.y, 100);
  // 아래로 넘치면 화면 안으로 밀린다.
  const low = G.resizedKeepingTopRight({ x: 1000, y: 700, width: 320, height: 100 }, { width: 320, height: 564 }, WA);
  assert.equal(low.y + low.height, 852 - 8);
});

test('짧은 메시지: 펫 왼쪽 세로 중심, 326×130', () => {
  const pet = G.defaultPetBounds(WA);
  const b = G.bubbleBounds(pet, WA);
  assert.deepEqual([b.width, b.height], [326, 130]);
  assert.equal(b.x + b.width, pet.x - 10);
  assert.equal(b.y + 65, pet.y + 28);
});

test('끌기: 3px 전까지는 클릭, 넘으면 세로 이동만', () => {
  const drag = G.createDragTracker();
  drag.begin(500);
  assert.equal(drag.move(502), null);
  assert.equal(drag.move(498), null);
  assert.equal(drag.dragging, false);
  assert.equal(drag.move(503), 3);
  assert.equal(drag.dragging, true);
  assert.equal(drag.move(510), 7);
  assert.equal(drag.move(509), -1); // 끌기 뒤에는 작은 움직임도 따라간다
  assert.equal(drag.end(), true);
  assert.equal(drag.move(600), null); // 끝난 뒤 이동은 무시
  drag.begin(100);
  assert.equal(drag.end(), false);
  assert.deepEqual(G.movedVertically({ x: 10, y: 20, width: 56, height: 56 }, -100, WA), { x: 10, y: 8, width: 56, height: 56 });
});

test('멀티 모니터: 저장 위치는 그 화면 오른쪽 가장자리로, 빠진 화면은 가장 가까운 화면으로', () => {
  const displays = [PRIMARY, RIGHT];
  assert.deepEqual(G.resolvePetBounds(null, displays, PRIMARY), G.defaultPetBounds(WA));
  // 두 번째 화면에 저장된 위치.
  const onRight = G.resolvePetBounds({ x: 3296, y: 400 }, displays, PRIMARY);
  assert.deepEqual(onRight, { x: 1440 + 1920 - 64, y: 400, width: 56, height: 56 });
  // 두 번째 화면이 빠지면 주 화면 가장자리로, 세로는 작업 영역 안.
  const refit = G.resolvePetBounds({ x: 3296, y: 900 }, [PRIMARY], PRIMARY);
  assert.deepEqual(refit, { x: 1376, y: 852 - 8 - 56, width: 56, height: 56 });
  // 위로 벗어난 좌표도 안으로.
  assert.equal(G.resolvePetBounds({ x: 1376, y: -500 }, [PRIMARY], PRIMARY).y, 8);
  assert.equal(G.displayFor({ x: 5000, y: 0, width: 10, height: 10 }, displays).id, 2);
});

test('내용 높이 자르기: 160 ~ 작업 영역', () => {
  assert.equal(G.clampContentHeight(20, WA, false), 160);
  assert.equal(G.clampContentHeight(400.4, WA, false), 400);
  assert.equal(G.clampContentHeight(5000, WA, false), 852 - 16);
  assert.equal(G.clampContentHeight(5000, WA, true), 852 - 16 - 54);
  assert.equal(G.clampContentHeight('x', WA, false), null);
});

test('macOS 작업 영역: 메뉴 막대(위 38pt)와 오른쪽 Dock 을 뺀 영역의 오른쪽 가장자리에 붙는다', () => {
  // 1512×982 화면, 메뉴 막대 38pt, 오른쪽 Dock 70pt → workArea { x:0, y:38, width:1442, height:944 }
  const mac = { id: 3, bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 38, width: 1442, height: 944 } };
  const pet = G.defaultPetBounds(mac.workArea);
  assert.equal(pet.x + pet.width, 1442 - C.PET_EDGE_INSET, 'Dock 왼쪽 8pt');
  assert.ok(pet.y >= 38 + G.SAFE_INSET);
  // 위로 끌어도 메뉴 막대 아래 8pt 에서 멈춘다.
  assert.equal(G.petBoundsAt(0, mac.workArea).y, 38 + G.SAFE_INSET);
  // 저장 위치를 되살릴 때도 Dock 을 넘지 않는다.
  assert.equal(G.resolvePetBounds({ x: 1448, y: 300 }, [mac], mac).x, 1442 - C.PET_SIZE - C.PET_EDGE_INSET);
  // 빠른 패널도 메뉴 막대 아래로 밀린다.
  const quick = G.quickCompanionFrame(G.petBoundsAt(0, mac.workArea), G.panelGlassSize('tasks'), false, mac.workArea);
  assert.ok(quick.y >= 38 + G.SAFE_INSET);
});

// ── 가장자리(왼쪽·오른쪽)·모니터 옮기기·자유 끌기 (2026-09-29) ─────────────────────────
test('왼쪽 가장자리: 펫은 왼쪽 8px, 오른쪽 기본값은 그대로', () => {
  assert.equal(G.petEdgeX(WA, 'left'), 8);
  assert.equal(G.petEdgeX(WA, 'right'), 1440 - 56 - 8);
  assert.equal(G.petEdgeX(WA, 'nope'), 1440 - 56 - 8, '모르는 값은 오른쪽');
  assert.deepEqual(G.defaultPetBounds(WA, 'left'), { ...G.defaultPetBounds(WA), x: 8 });
  assert.deepEqual(G.petBoundsAt(200, WA, 'left'), { x: 8, y: 200, width: 56, height: 56 });
  assert.equal(G.petBoundsAt(200, RIGHT.workArea, 'left').x, 1440 + 8, '두 번째 화면의 왼쪽 가장자리');
  assert.deepEqual(G.petBoundsAt(200, WA), G.petBoundsAt(200, WA, 'right'));
});

test('왼쪽 가장자리 거울: 빠른 패널·말풍선은 펫 오른쪽 10px, 위젯은 왼쪽 위 고정, 걸친 캐릭터는 유리 왼쪽 20px', () => {
  const pet = G.defaultPetBounds(WA, 'left');
  const glass = G.panelGlassSize('tasks');
  const quick = G.quickCompanionFrame(pet, glass, false, WA, 'left');
  assert.equal(quick.x, pet.x + pet.width + C.PANEL_GAP);
  assert.equal(quick.y + quick.height / 2, pet.y + 28);
  const right = G.quickCompanionFrame(G.defaultPetBounds(WA), glass, false, WA, 'right');
  assert.equal(quick.y, right.y, '세로 자리는 가장자리와 무관');
  const bubble = G.bubbleBounds(pet, WA, 'left');
  assert.equal(bubble.x, pet.x + pet.width + 10);
  assert.equal(bubble.y + 65, pet.y + 28);
  const top = G.petBoundsAt(200, WA, 'left');
  const widget = G.widgetCompanionFrame(top, glass, true, WA, 'left');
  assert.equal(widget.x, top.x);
  assert.equal(widget.y, top.y);
  assert.deepEqual(G.petAlignedToCompanion(widget, WA, 'left'), top);
  const g = G.glassFromCompanion(widget, true);
  const perch = G.perchBounds(g, 'left');
  assert.deepEqual(perch, { x: g.x + 20, y: g.y - 54, width: 72, height: 72 });
  // 오른쪽 거울과 대칭: 유리 바깥 모서리에서 캐릭터까지 20px.
  const rightPerch = G.perchBounds(g, 'right');
  assert.equal((g.x + g.width) - (rightPerch.x + rightPerch.width), perch.x - g.x);
});

test('왼쪽 가장자리 크기 바꾸기: 왼쪽 위 고정, 오른쪽은 예전 그대로', () => {
  const frame = { x: 16, y: 100, width: 320, height: 488 };
  const left = G.resizedKeepingOuterTop(frame, { width: 504, height: 370 }, WA, 'left');
  assert.deepEqual([left.x, left.y, left.width], [16, 100, 504]);
  const r = { x: 1000, y: 100, width: 320, height: 488 };
  assert.deepEqual(G.resizedKeepingOuterTop(r, { width: 504, height: 370 }, WA, 'right'), G.resizedKeepingTopRight(r, { width: 504, height: 370 }, WA));
});

test('세로 비율: 작업 영역 안 0~1, 높이가 다른 모니터로 옮겨도 같은 높이감', () => {
  assert.equal(G.petYRatio(8, WA), 0);
  assert.equal(G.petYRatio(852 - 8 - 56, WA), 1);
  assert.equal(G.petYRatio(-100, WA), 0);
  const mid = G.petYFromRatio(0.5, WA);
  assert.equal(mid, 8 + 0.5 * (852 - 16 - 56));
  // 주 화면 가운데 → 두 번째(더 큰) 화면 가운데.
  const pet = G.petBoundsAt(mid, WA, 'right');
  const moved = G.petBoundsOnDisplay(RIGHT, 'left', G.petYRatio(pet.y, WA));
  assert.equal(moved.x, 1440 + 8);
  assert.equal(moved.y, Math.round(-200 + 8 + 0.5 * (1032 - 16 - 56)));
  // 비율 왕복은 정수 y 를 그대로 되살린다.
  for (const y of [8, 123, 400, 788]) assert.equal(G.petBoundsAt(G.petYFromRatio(G.petYRatio(y, WA), WA), WA).y, y);
});

test('저장 자리 풀기: 모니터·가장자리·비율, 빠진 모니터는 가까운 모니터의 같은 가장자리', () => {
  const displays = [PRIMARY, RIGHT];
  const onRight = G.resolvePetPlacement({ displayId: 2, side: 'left', ratio: 0 }, displays, PRIMARY);
  assert.deepEqual(onRight, { bounds: { x: 1448, y: -192, width: 56, height: 56 }, side: 'left', displayId: 2 });
  // 두 번째 화면이 빠지면 x·y 에 가장 가까운 주 화면으로 — 가장자리·비율은 그대로.
  const gone = G.resolvePetPlacement({ displayId: 2, side: 'left', ratio: 1, x: 1448, y: 772 }, [PRIMARY], PRIMARY);
  assert.deepEqual(gone, { bounds: { x: 8, y: 852 - 8 - 56, width: 56, height: 56 }, side: 'left', displayId: 1 });
  // 예전 모양 { x, y } 는 오른쪽, 아무것도 없으면 주 화면 기본(오른쪽).
  assert.equal(G.resolvePetPlacement({ x: 100, y: 300 }, displays, PRIMARY).side, 'right');
  assert.deepEqual(G.resolvePetPlacement(null, displays, PRIMARY), { bounds: G.defaultPetBounds(WA), side: 'right', displayId: 1 });
  // 모니터·가장자리만 있으면 그 화면 기본 높이.
  assert.deepEqual(G.resolvePetPlacement({ displayId: 2, side: 'left' }, displays, PRIMARY).bounds, G.defaultPetBounds(RIGHT.workArea, 'left'));
  // 해상도가 바뀌어도(같은 id, 다른 작업 영역) 비율로 다시 선다.
  const smaller = { ...PRIMARY, workArea: { x: 0, y: 0, width: 1280, height: 672 } };
  assert.deepEqual(G.resolvePetPlacement({ displayId: 1, side: 'right', ratio: 1 }, [smaller], smaller).bounds, { x: 1280 - 64, y: 672 - 64, width: 56, height: 56 });
});

test('자유 끌기: 가운데가 있는 화면 안에 그리고, 놓으면 가까운 가장자리로 붙는다(다른 모니터 포함)', () => {
  const displays = [PRIMARY, RIGHT];
  // 주 화면 한가운데보다 왼쪽 → 왼쪽 가장자리.
  const leftDrop = G.snapPetToEdge({ x: 500, y: 300, width: 56, height: 56 }, displays);
  assert.deepEqual(leftDrop, { bounds: { x: 8, y: 300, width: 56, height: 56 }, side: 'left', displayId: 1 });
  // 가운데를 넘으면 오른쪽.
  assert.equal(G.snapPetToEdge({ x: 720, y: 300, width: 56, height: 56 }, displays).side, 'right');
  // 두 번째 화면 왼쪽 절반 → 그 화면 왼쪽 가장자리, 세로는 그 작업 영역 안.
  const other = G.snapPetToEdge({ x: 1500, y: -900, width: 56, height: 56 }, displays);
  assert.deepEqual(other, { bounds: { x: 1448, y: -192, width: 56, height: 56 }, side: 'left', displayId: 2 });
  // 끄는 동안: 가운데가 주 화면을 벗어나면 두 번째 화면 작업 영역 안으로.
  assert.deepEqual(G.freeDragBounds({ x: 1420, y: 300 }, displays), { x: 1448, y: 300, width: 56, height: 56 });
  assert.deepEqual(G.freeDragBounds({ x: 1380, y: 300 }, displays), { x: 1376, y: 300, width: 56, height: 56 });
  assert.deepEqual(G.freeDragBounds({ x: -500, y: 5000 }, displays), { x: 8, y: 852 - 8 - 56, width: 56, height: 56 });
  assert.equal(G.displayAt({ x: 1500, y: 0 }, displays).id, 2);
  assert.equal(G.displayAt({ x: 9000, y: 0 }, displays).id, 2, '밖이면 가까운 화면');
});

test('끌기 추적: 가로를 주면 두 축 3px 문턱, 넘은 뒤 lastDx', () => {
  const drag = G.createDragTracker();
  drag.begin(500, 100);
  assert.equal(drag.tracksX, true);
  assert.equal(drag.move(501, 102), null);
  assert.equal(drag.move(500, 104), 0, '가로 4px 로 끌기 시작(세로 0)');
  assert.equal(drag.lastDx, 4);
  assert.equal(drag.move(510, 90), 10);
  assert.equal(drag.lastDx, -14);
  assert.equal(drag.end(), true);
  assert.equal(drag.lastDx, 0);
  drag.begin(500);
  assert.equal(drag.tracksX, false);
  assert.equal(drag.move(501, 300), null, '가로를 처음에 주지 않았으면 세로만 본다');
});
