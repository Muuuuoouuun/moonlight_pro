'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAppMenuTemplate, buildDockMenuTemplate } = require('./menu-template');

const noop = () => {};
const widgetItem = { label: '위젯 열기', click: noop };
const actions = { quickCapture: noop, showSettings: noop, quit: noop, goBack: noop, goForward: noop, showWindow: noop };
const build = (platform) => buildAppMenuTemplate({ platform, quickAccelerator: 'CommandOrControl+Shift+Space', widgetItem, actions });
const labels = (submenu) => submenu.map((item) => item.label || item.type);
const roles = (submenu) => submenu.map((item) => item.role).filter(Boolean);

test('macOS: 첫 메뉴는 앱 메뉴이고 정보·서비스·숨기기·종료 role이 있다', () => {
  const [app] = build('darwin');
  assert.equal(app.label, 'Moonlight');
  for (const role of ['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit']) {
    assert.ok(roles(app.submenu).includes(role), role);
  }
  // 종료는 click이 아니라 role(⌘Q) — before-quit이 quitting 플래그를 세운다.
  const quit = app.submenu.find((item) => item.role === 'quit');
  assert.equal(quit.click, undefined);
});

test('macOS: 앱 메뉴에 빠른 입력·위젯·설정(⌘,)이 있다', () => {
  const [app] = build('darwin');
  assert.ok(app.submenu.some((item) => item.label === '빠른 입력' && item.registerAccelerator === false));
  assert.ok(app.submenu.includes(widgetItem));
  const settings = app.submenu.find((item) => item.accelerator === 'Command+,');
  assert.ok(settings && settings.click === actions.showSettings);
});

test('macOS: 편집 메뉴 role이 전부 있다(없으면 ⌘C/⌘V/⌘A가 죽는다)', () => {
  const edit = build('darwin').find((menu) => menu.label === '편집');
  assert.ok(edit);
  assert.deepEqual(roles(edit.submenu), ['undo', 'redo', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'delete', 'selectAll']);
});

test('macOS: 윈도우 메뉴와 ⌘[ ⌘] 뒤로·앞으로', () => {
  const menus = build('darwin');
  assert.deepEqual(menus.map((menu) => menu.label), ['Moonlight', '편집', '보기', '윈도우']);
  assert.equal(menus.find((menu) => menu.label === '윈도우').role, 'window');
  const view = menus.find((menu) => menu.label === '보기').submenu;
  assert.equal(view.find((item) => item.label === '뒤로').accelerator, 'Command+[');
  assert.equal(view.find((item) => item.label === '앞으로').accelerator, 'Command+]');
});

test('Windows: 예전 모양 그대로(앱·보기 두 메뉴, Alt+Left/Right, 사용자 종료)', () => {
  const menus = build('win32');
  assert.deepEqual(menus.map((menu) => menu.label), ['Moonlight', '보기']);
  assert.deepEqual(labels(menus[0].submenu), ['빠른 입력', '위젯 열기', '허브 주소 바꾸기', 'separator', '종료']);
  const quit = menus[0].submenu.at(-1);
  assert.equal(quit.accelerator, 'CommandOrControl+Q');
  assert.equal(quit.click, actions.quit);
  const view = menus[1].submenu;
  assert.equal(view.find((item) => item.label === '뒤로').accelerator, 'Alt+Left');
  assert.equal(view.find((item) => item.label === '앞으로').accelerator, 'Alt+Right');
  assert.ok(!JSON.stringify(menus).includes('pasteAndMatchStyle'));
});

test('Dock 메뉴: 열기·빠른 입력·위젯', () => {
  const dock = buildDockMenuTemplate({ quickAccelerator: 'CommandOrControl+Shift+Space', widgetItem, actions });
  assert.deepEqual(labels(dock), ['열기', '빠른 입력', '위젯 열기']);
  assert.equal(dock[0].click, actions.showWindow);
});
