// 펫 창 전용 다리 `window.moonlightPet` — { invoke(channel, payload), on(event, handler) }.
// 샌드박스 프리로드라 로컬 모듈(contract.js)을 불러올 수 없다. 아래 두 목록은 contract.PET_INVOKE·PET_EVENTS와
// 같아야 하고(pet-preload.test.js가 확인), 메인은 보낸 쪽이 펫 창의 최상위 프레임인지 다시 따진다.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = Object.freeze([
  'pet:state', 'pet:set-character', 'pet:set-mode', 'pet:set-presentation', 'pet:collapse', 'pet:open-hub', 'pet:open-external',
  'pet:drag', 'pet:press', 'pet:resize-content', 'pet:context-menu',
  'pet:store-get', 'pet:store-set',
  'pet:hub-session', 'pet:tasks-list', 'pet:tasks-add', 'pet:tasks-toggle',
  'pet:journal-read', 'pet:journal-save', 'pet:calendar-week',
  'pet:notices-list', 'pet:notices-read', 'pet:notices-hide', 'pet:notices-read-all',
  'pet:chat-send', 'pet:chat-cancel', 'pet:chat-session', 'pet:council-handoff',
  'pet:focus-start', 'pet:focus-stop', 'pet:focus-state',
]);
const EVENTS = Object.freeze(['pet:state-changed', 'pet:wash', 'pet:notice', 'pet:badge', 'pet:chat-reply', 'pet:focus-tick', 'pet:hub-status']);

function rejectChannel(channel) {
  return Promise.reject(new Error(`moonlightPet: unknown channel ${String(channel)}`));
}

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('moonlightPet', Object.freeze({
    invoke(channel, payload) {
      if (typeof channel !== 'string' || !INVOKE.includes(channel)) return rejectChannel(channel);
      return ipcRenderer.invoke(channel, payload === undefined ? {} : payload);
    },
    on(event, handler) {
      if (typeof event !== 'string' || !EVENTS.includes(event)) throw new Error(`moonlightPet: unknown event ${String(event)}`);
      if (typeof handler !== 'function') throw new Error('moonlightPet: handler must be a function');
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on(event, listener);
      return () => ipcRenderer.removeListener(event, listener);
    },
  }));
}
