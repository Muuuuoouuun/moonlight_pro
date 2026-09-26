'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../shared/contract');

const source = fs.readFileSync(path.join(__dirname, 'pet-preload.js'), 'utf8');

// 프리로드를 가짜 electron으로 돌려 노출된 다리를 꺼낸다.
function loadBridge(protocol = 'file:') {
  const exposed = {};
  const calls = [];
  const listeners = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } },
    ipcRenderer: {
      invoke: (channel, payload) => {
        calls.push([channel, payload]);
        return Promise.resolve({ channel });
      },
      on: (event, listener) => listeners.push([event, listener]),
      removeListener: (event, listener) => {
        const index = listeners.findIndex(([e, l]) => e === event && l === listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    },
  };
  const sandbox = {
    require: (name) => {
      assert.equal(name, 'electron', 'preload may only require electron');
      return electron;
    },
    window: { location: { protocol } },
  };
  vm.runInNewContext(source, sandbox);
  return { bridge: exposed.moonlightPet, calls, listeners };
}

test('프리로드 목록은 contract.PET_INVOKE·PET_EVENTS와 같다', () => {
  const channels = [...source.matchAll(/'(pet:[a-z-]+)'/g)].map((m) => m[1]);
  const expected = [...C.PET_INVOKE, ...C.PET_EVENTS];
  assert.deepEqual([...channels].sort(), [...expected].sort());
  assert.equal(new Set(channels).size, channels.length);
  assert.doesNotMatch(source, /nodeIntegration|require\('\.\.?\//);
});

test('허용된 채널만 invoke, 나머지는 거절', async () => {
  const { bridge, calls } = loadBridge();
  assert.deepEqual(Object.keys(bridge).sort(), ['invoke', 'on']);
  for (const channel of C.PET_INVOKE) await bridge.invoke(channel, { a: 1 });
  assert.deepEqual(calls.map(([c]) => c), [...C.PET_INVOKE]);
  await bridge.invoke('pet:state');
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['pet:state', {}])); // vm 영역의 {}라 JSON으로 비교
  await assert.rejects(bridge.invoke('moonlight-widget:pin', true), /unknown channel/);
  await assert.rejects(bridge.invoke('pet:state-changed'), /unknown channel/); // 이벤트는 invoke 대상이 아니다
  await assert.rejects(bridge.invoke(undefined), /unknown channel/);
});

test('허용된 이벤트만 구독, 해제 함수가 리스너를 지운다', () => {
  const { bridge, listeners } = loadBridge();
  const seen = [];
  const off = bridge.on('pet:badge', (payload) => seen.push(payload));
  assert.equal(listeners.length, 1);
  listeners[0][1]({ sender: 'ignored' }, { count: 3 });
  assert.deepEqual(seen, [{ count: 3 }]); // IPC 이벤트 객체는 페이지로 넘기지 않는다
  off();
  assert.equal(listeners.length, 0);
  assert.throws(() => bridge.on('pet:tasks-list', () => {}), /unknown event/);
  assert.throws(() => bridge.on('pet:badge', 'nope'), /handler/);
});

test('원격 페이지에는 다리를 열지 않는다', () => {
  assert.equal(loadBridge('https:').bridge, undefined);
});
