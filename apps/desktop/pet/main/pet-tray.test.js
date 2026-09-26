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
