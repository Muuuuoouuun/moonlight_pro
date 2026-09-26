// 로컬 설정 화면(file://)에만 작은 다리를 연다. 원격 허브 페이지에는 아무것도 노출하지 않는다.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('moonlight', {
    getSettings: () => ipcRenderer.invoke('moonlight:get-settings'),
    setSettings: (patch) => ipcRenderer.invoke('moonlight:set-settings', patch),
    openExternal: (url) => ipcRenderer.invoke('moonlight:open-external', url),
  });
}
