// Settings stay file-only. Main-process checks bind the narrow session intent API to the current Hub main frame.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('moonlight', {
    getSettings: () => ipcRenderer.invoke('moonlight:get-settings'),
    setSettings: (patch) => ipcRenderer.invoke('moonlight:set-settings', patch),
    openExternal: (url) => ipcRenderer.invoke('moonlight:open-external', url),
  });
}

if (['https:', 'http:'].includes(window.location.protocol)) {
  contextBridge.exposeInMainWorld('moonlightSession', {
    state: () => ipcRenderer.invoke('moonlight:session-state'),
    logout: () => ipcRenderer.invoke('moonlight:session-logout'),
    beginLogin: () => ipcRenderer.invoke('moonlight:session-begin-login'),
    cancelLogin: (attempt) => ipcRenderer.invoke('moonlight:session-cancel-login', attempt),
    acceptLogin: (attempt) => ipcRenderer.invoke('moonlight:session-accept-login', attempt),
  });
}
