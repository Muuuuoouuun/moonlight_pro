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

module.exports = { petTrayItems, characterMenuTemplate };
