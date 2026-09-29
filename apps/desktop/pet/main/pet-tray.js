'use strict';
// 펫 메뉴 템플릿 — 트레이 항목(main.js의 트레이 메뉴에 끼워 넣는다)과 펫 오른쪽 클릭 캐릭터 메뉴.
// Menu.buildFromTemplate에 그대로 넣는 순수 객체만 만든다. Mac 상태 막대 메뉴(PetApplication)와 같은 순서다.
const C = require('../shared/contract');
const { PET_QUICK_ACCELERATOR } = require('./pet-input');

// actions: { toggleQuick, showWidget, toggleBubble, openMode, openHub }
function petTrayItems(actions) {
  return [
    { label: '펫 빠른 기능', accelerator: PET_QUICK_ACCELERATOR, registerAccelerator: false, click: () => actions.toggleQuick() },
    { label: '할 일 위젯 열기', click: () => actions.showWidget('tasks') },
    { label: '짧은 메시지 보기', click: () => actions.toggleBubble() },
    { label: '알림 보기', click: () => actions.openMode('notifications') },
    { label: 'Council 안건 준비', click: () => actions.openMode('council') },
    { label: 'Hub 열기', click: () => actions.openHub(C.HUB_PATHS.tasks) },
  ];
}

// 펫 오른쪽 클릭: 알림 보기 + 캐릭터 9종(20px 얼굴, 지금 캐릭터에 체크).
// iconFor(character) → nativeImage | undefined (자산이 없으면 아이콘 없이).
function characterMenuTemplate({ current, onNotifications, onSelect, iconFor = () => undefined }) {
  return [
    { label: '알림 보기', click: () => onNotifications() },
    { type: 'separator' },
    ...C.CHARACTERS.map((c) => {
      const item = {
        label: c.name,
        type: 'checkbox',
        checked: c.key === current,
        click: () => onSelect(c.key),
      };
      const icon = iconFor(c);
      if (icon) item.icon = icon;
      return item;
    }),
  ];
}

// 모니터 이름: 주 모니터가 먼저, 나머지는 왼쪽→오른쪽(같으면 위→아래) 순서로 '모니터 2', '모니터 3'…
// 크기는 화면 좌표(DIP·pt) 그대로 붙인다. displays = [{ id, bounds }], 결과 [{ id, label }].
function displayChoices(displays, primaryId) {
  const list = Array.isArray(displays) ? displays.filter((d) => d && d.bounds) : [];
  const primary = list.filter((d) => d.id === primaryId);
  const others = list.filter((d) => d.id !== primaryId)
    .sort((a, b) => (a.bounds.x - b.bounds.x) || (a.bounds.y - b.bounds.y));
  const size = (d) => `${Math.round(d.bounds.width)}×${Math.round(d.bounds.height)}`;
  return [
    ...primary.map((d) => ({ id: d.id, label: `주 모니터 (${size(d)})` })),
    ...others.map((d, i) => ({ id: d.id, label: `모니터 ${i + (primary.length ? 2 : 1)} (${size(d)})` })),
  ];
}

// 펫 자리 항목 — 트레이 펫 묶음과 펫 오른쪽 클릭 메뉴가 같이 쓴다.
// placement: { displays: [{ id, bounds }], primaryId, displayId, side: 'left'|'right', hidden }
// actions: { moveToDisplay(id), setSide(side), resetPosition(), setHidden(hidden) }
// '모니터로 옮기기'는 모니터가 둘 이상일 때만 보인다(하나면 고를 것이 없다).
function petPlacementItems(placement, actions) {
  const p = placement || {};
  const choices = displayChoices(p.displays, p.primaryId);
  const items = [];
  if (choices.length > 1) {
    items.push({
      label: '모니터로 옮기기',
      submenu: choices.map((c) => ({
        label: c.label,
        type: 'radio',
        checked: c.id === p.displayId,
        click: () => actions.moveToDisplay(c.id),
      })),
    });
  }
  items.push(
    { label: '왼쪽 가장자리로', type: 'radio', checked: p.side === 'left', click: () => actions.setSide('left') },
    { label: '오른쪽 가장자리로', type: 'radio', checked: p.side !== 'left', click: () => actions.setSide('right') },
    { type: 'separator' },
    { label: '펫 위치 초기화', click: () => actions.resetPosition() },
    p.hidden
      ? { label: '펫 보이기', click: () => actions.setHidden(false) }
      : { label: '펫 숨기기', click: () => actions.setHidden(true) },
  );
  return items;
}

module.exports = { petTrayItems, characterMenuTemplate, displayChoices, petPlacementItems };
