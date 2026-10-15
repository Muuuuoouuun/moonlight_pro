// 앱 메뉴 템플릿 — Electron 없이 플랫폼별 모양을 테스트할 수 있게 순수 함수로 둔다.
// macOS는 첫 메뉴가 앱 메뉴(정보·서비스·숨기기·종료)여야 하고, 편집 메뉴의 role이 없으면 ⌘C/⌘V/⌘A가
// 허브 페이지·펫 패널의 입력 칸에서도 동작하지 않는다. Windows 모양은 예전 그대로 둔다.
'use strict';

const isMac = (platform) => platform === 'darwin';

// 편집 메뉴(macOS 전용) — role만으로 클립보드·실행 취소가 웹 페이지 입력에 닿는다.
function editMenu() {
  return {
    label: '편집',
    submenu: [
      { label: '실행 취소', role: 'undo' },
      { label: '다시 실행', role: 'redo' },
      { type: 'separator' },
      { label: '잘라내기', role: 'cut' },
      { label: '복사', role: 'copy' },
      { label: '붙여넣기', role: 'paste' },
      { label: '서식 없이 붙여넣기', role: 'pasteAndMatchStyle' },
      { label: '삭제', role: 'delete' },
      { label: '모두 선택', role: 'selectAll' },
    ],
  };
}

// '로그인 시 자동 실행' 체크 항목(트레이·macOS 앱 메뉴). Electron 은 누른 뒤의 checked 를 item 에 실어 click 을 부른다.
function loginItemMenuItem({ checked, onToggle }) {
  return {
    label: '로그인 시 자동 실행',
    type: 'checkbox',
    checked: Boolean(checked),
    click: (item) => onToggle(Boolean(item && item.checked)),
  };
}

// macOS 앱 메뉴 — 이름은 Moonlight, 종료는 role(⌘Q)이라 before-quit 경로를 그대로 탄다.
// loginItem(선택): 패키징한 앱에서만 main.js 가 넘긴다(개발 실행은 Electron 자체를 로그인 항목에 올리므로 넣지 않는다).
function macAppMenu({ name, quickCapture, widgetItem, showSettings, loginItem }) {
  return {
    label: name,
    submenu: [
      { label: `${name} 정보`, role: 'about' },
      { type: 'separator' },
      { label: '설정… (허브 주소)', accelerator: 'Command+,', click: showSettings },
      ...(loginItem ? [loginItem] : []),
      { type: 'separator' },
      quickCapture,
      widgetItem,
      { type: 'separator' },
      { label: '서비스', role: 'services' },
      { type: 'separator' },
      { label: `${name} 숨기기`, role: 'hide' },
      { label: '다른 항목 숨기기', role: 'hideOthers' },
      { label: '모두 보기', role: 'unhide' },
      { type: 'separator' },
      { label: `${name} 종료`, role: 'quit' },
    ],
  };
}

function windowMenu() {
  return {
    label: '윈도우',
    role: 'window',
    submenu: [
      { label: '최소화', role: 'minimize' },
      { label: '확대/축소', role: 'zoom' },
      { label: '윈도우 닫기', role: 'close' },
      { type: 'separator' },
      { label: '모두 앞으로 가져오기', role: 'front' },
    ],
  };
}

function viewMenu({ platform, goBack, goForward }) {
  const mac = isMac(platform);
  return {
    label: '보기',
    submenu: [
      { label: '새로고침', role: 'reload' },
      { label: '강력 새로고침', role: 'forceReload' },
      { type: 'separator' },
      { label: '뒤로', accelerator: mac ? 'Command+[' : 'Alt+Left', click: goBack },
      { label: '앞으로', accelerator: mac ? 'Command+]' : 'Alt+Right', click: goForward },
      { type: 'separator' },
      { label: '실제 크기', role: 'resetZoom' },
      { label: '확대', role: 'zoomIn' },
      { label: '축소', role: 'zoomOut' },
      { type: 'separator' },
      { label: '전체 화면', role: 'togglefullscreen' },
      { label: '개발자 도구', role: 'toggleDevTools' },
    ],
  };
}

// options: { platform, name, quickAccelerator, widgetItem, loginItem?, actions: { quickCapture, showSettings, quit, goBack, goForward } }
// loginItem 은 macOS 앱 메뉴에만 들어간다(Windows 는 트레이 메뉴에 있다).
function buildAppMenuTemplate({ platform, name = 'Moonlight', quickAccelerator, widgetItem, loginItem = null, actions }) {
  const quickCapture = { label: '빠른 입력', accelerator: quickAccelerator, registerAccelerator: false, click: actions.quickCapture };
  const view = viewMenu({ platform, goBack: actions.goBack, goForward: actions.goForward });
  if (isMac(platform)) {
    return [
      macAppMenu({ name, quickCapture, widgetItem, showSettings: actions.showSettings, loginItem }),
      editMenu(),
      view,
      windowMenu(),
    ];
  }
  return [
    {
      label: name,
      submenu: [
        quickCapture,
        widgetItem,
        { label: '허브 주소 바꾸기', click: actions.showSettings },
        { type: 'separator' },
        { label: '종료', accelerator: 'CommandOrControl+Q', click: actions.quit },
      ],
    },
    view,
  ];
}

// Dock 아이콘 우클릭 메뉴(macOS) — 창을 띄우지 않고도 빠른 입력·위젯을 연다.
function buildDockMenuTemplate({ quickAccelerator, widgetItem, actions }) {
  return [
    { label: '열기', click: actions.showWindow },
    { label: '빠른 입력', accelerator: quickAccelerator, registerAccelerator: false, click: actions.quickCapture },
    widgetItem,
  ];
}

module.exports = { buildAppMenuTemplate, buildDockMenuTemplate, loginItemMenuItem, editMenu, isMac };
