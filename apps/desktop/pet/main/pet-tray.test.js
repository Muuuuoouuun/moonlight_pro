'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/contract');
const { petTrayItems, characterMenuTemplate } = require('./pet-tray');

test('트레이 항목: 이름·순서·동작', () => {
  const calls = [];
  const actions = {
    toggleQuick: () => calls.push(['quick']),
    showWidget: (mode) => calls.push(['widget', mode]),
    toggleBubble: () => calls.push(['bubble']),
    openMode: (mode) => calls.push(['mode', mode]),
    openHub: (p) => calls.push(['hub', p]),
  };
  const items = petTrayItems(actions);
  assert.deepEqual(items.map((i) => i.label), ['펫 빠른 기능', '할 일 위젯 열기', '짧은 메시지 보기', '알림 보기', 'Council 안건 준비', 'Hub 열기']);
  assert.equal(items[0].accelerator, 'Control+Alt+M');
  assert.equal(items[0].registerAccelerator, false); // 전역 단축키가 따로 등록한다
  items.forEach((i) => i.click());
  assert.deepEqual(calls, [['quick'], ['widget', 'tasks'], ['bubble'], ['mode', 'notifications'], ['mode', 'council'], ['hub', C.HUB_PATHS.tasks]]);
});

test('캐릭터 메뉴: 알림 보기 + 9종, 지금 캐릭터에 체크, 아이콘은 있을 때만', () => {
  const picked = [];
  let notices = 0;
  const menu = characterMenuTemplate({
    current: 'silver',
    onNotifications: () => { notices += 1; },
    onSelect: (key) => picked.push(key),
    iconFor: (c) => (c.key === 'pink' ? { fake: 'image' } : undefined),
  });
  assert.equal(menu[0].label, '알림 보기');
  assert.equal(menu[1].type, 'separator');
  const characters = menu.slice(2);
  assert.deepEqual(characters.map((i) => i.label), C.CHARACTERS.map((c) => c.name));
  assert.deepEqual(characters.filter((i) => i.checked).map((i) => i.label), ['글레이시아']);
  assert.ok(characters.find((i) => i.label === '님피아').icon);
  assert.equal('icon' in characters[0], false);
  menu[0].click();
  characters[3].click();
  assert.equal(notices, 1);
  assert.deepEqual(picked, ['red']);
});

const { displayChoices, petPlacementItems } = require('./pet-tray');

const MAIN = { id: 7, bounds: { x: 0, y: 0, width: 1512, height: 982 } };
const EXT_R = { id: 3, bounds: { x: 1512, y: -200, width: 1920, height: 1080 } };
const EXT_L = { id: 9, bounds: { x: -2560, y: 0, width: 2560, height: 1440 } };

test('모니터 이름: 주 모니터 먼저, 나머지는 왼쪽부터 모니터 2·3, 크기 포함', () => {
  assert.deepEqual(displayChoices([EXT_R, MAIN, EXT_L], 7), [
    { id: 7, label: '주 모니터 (1512×982)' },
    { id: 9, label: '모니터 2 (2560×1440)' },
    { id: 3, label: '모니터 3 (1920×1080)' },
  ]);
  assert.deepEqual(displayChoices([], 1), []);
  assert.deepEqual(displayChoices(null, 1), []);
});

test('자리 항목: 모니터로 옮기기(둘 이상일 때)·가장자리 둘·초기화·숨기기, 지금 값에 체크', () => {
  const calls = [];
  const actions = {
    moveToDisplay: (id) => calls.push(['display', id]),
    setSide: (side) => calls.push(['side', side]),
    resetPosition: () => calls.push(['reset']),
    setHidden: (hidden) => calls.push(['hidden', hidden]),
  };
  const items = petPlacementItems({ displays: [MAIN, EXT_R], primaryId: 7, displayId: 3, side: 'left', hidden: false }, actions);
  assert.deepEqual(items.map((i) => i.label || i.type), ['모니터로 옮기기', '왼쪽 가장자리로', '오른쪽 가장자리로', 'separator', '펫 위치 초기화', '펫 숨기기']);
  const monitors = items[0].submenu;
  assert.deepEqual(monitors.map((i) => [i.label, i.type, i.checked]), [['주 모니터 (1512×982)', 'radio', false], ['모니터 2 (1920×1080)', 'radio', true]]);
  assert.deepEqual(items.slice(1, 3).map((i) => [i.type, i.checked]), [['radio', true], ['radio', false]]);
  monitors[0].click();
  items[1].click();
  items[2].click();
  items[4].click();
  items[5].click();
  assert.deepEqual(calls, [['display', 7], ['side', 'left'], ['side', 'right'], ['reset'], ['hidden', true]]);
  // 모니터 하나면 '모니터로 옮기기'가 없고, 숨겨 두었으면 '펫 보이기'.
  const single = petPlacementItems({ displays: [MAIN], primaryId: 7, displayId: 7, side: 'right', hidden: true }, actions);
  assert.deepEqual(single.map((i) => i.label || i.type), ['왼쪽 가장자리로', '오른쪽 가장자리로', 'separator', '펫 위치 초기화', '펫 보이기']);
  assert.equal(single[1].checked, true);
  single.at(-1).click();
  assert.deepEqual(calls.at(-1), ['hidden', false]);
});
