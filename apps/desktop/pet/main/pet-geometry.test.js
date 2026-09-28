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
