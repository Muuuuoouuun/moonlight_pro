// 빠른 입력 위젯 창 전용 다리. 허브의 /widget 페이지가 `window.moonlightWidget`이 있는지 보고 쓴다.
// 샌드박스 프리로드라 로컬 모듈을 불러올 수 없다 — 채널 목록은 widget-window.js의 WIDGET_CHANNELS와 같아야
// 하고(widget-window.test.js가 확인), 메인은 보낸 쪽이 위젯 창의 허브 페이지인지 다시 따진다.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = Object.freeze({
  pin: 'moonlight-widget:pin',
  isPinned: 'moonlight-widget:is-pinned',
  close: 'moonlight-widget:close',
  openMain: 'moonlight-widget:open-main',
  setHeight: 'moonlight-widget:set-height',
});

if (window.location.protocol === 'https:' || window.location.protocol === 'http:') {
  contextBridge.exposeInMainWorld('moonlightWidget', Object.freeze({
    pin: (pinned) => ipcRenderer.invoke(CHANNELS.pin, pinned === true),
    isPinned: () => ipcRenderer.sendSync(CHANNELS.isPinned) === true,
    close: () => ipcRenderer.send(CHANNELS.close),
    openMain: (path) => ipcRenderer.invoke(CHANNELS.openMain, typeof path === 'string' ? path : ''),
    setHeight: (px) => ipcRenderer.invoke(CHANNELS.setHeight, Number(px)),
  }));
}
