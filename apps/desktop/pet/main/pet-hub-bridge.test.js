'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/contract');
const B = require('./pet-hub-bridge');

test('허브 채널: 세션부터 Council 넘기기까지, 집중은 셸', () => {
  assert.deepEqual(B.HUB_CHANNELS, [
    'pet:hub-session', 'pet:tasks-list', 'pet:tasks-add', 'pet:tasks-toggle',
    'pet:journal-read', 'pet:journal-save', 'pet:calendar-week',
    'pet:notices-list', 'pet:notices-read', 'pet:notices-hide', 'pet:notices-read-all',
    'pet:chat-send', 'pet:chat-cancel', 'pet:chat-session', 'pet:council-handoff',
  ]);
  assert.deepEqual(B.FOCUS_CHANNELS, ['pet:focus-start', 'pet:focus-stop', 'pet:focus-state']);
  for (const channel of [...B.HUB_CHANNELS, ...B.FOCUS_CHANNELS]) assert.ok(C.PET_INVOKE.includes(channel));
});

test('hub가 없으면 not-configured', async () => {
  const call = B.createHubBridge(() => null);
  assert.deepEqual(await call('pet:tasks-list', {}), { kind: 'not-configured', data: null, error: 'hub', httpStatus: 0 });
});

test('invoke 또는 채널 이름 함수로 위임하고 봉투를 맞춘다', async () => {
  const seen = [];
  const viaInvoke = B.createHubBridge(() => ({
    invoke: async (channel, payload, meta) => {
      seen.push([channel, payload, meta]);
      return { kind: 'live', data: { tasks: [] } };
    },
  }));
  assert.deepEqual(await viaInvoke('pet:tasks-list', { a: 1 }, { surface: 'panel' }), { kind: 'live', data: { tasks: [] }, error: null, httpStatus: 0 });
  assert.deepEqual(seen, [['pet:tasks-list', { a: 1 }, { surface: 'panel' }]]);

  const viaKeys = B.createHubBridge(() => ({ 'pet:hub-session': async () => ({ kind: 'unauthorized', httpStatus: 401, error: 401 }) }));
  assert.deepEqual(await viaKeys('pet:hub-session', {}), { kind: 'unauthorized', data: null, error: '401', httpStatus: 401 });
  assert.equal((await viaKeys('pet:tasks-list', {})).error, 'channel');

  const broken = B.createHubBridge(() => ({ invoke: async () => ({ kind: 'weird' }) }));
  assert.equal((await broken('pet:tasks-list')).kind, 'invalid');
  const throws = B.createHubBridge(() => ({ invoke: async () => { throw new Error('socket hang up'); } }));
  assert.deepEqual(await throws('pet:tasks-list'), { kind: 'error', data: null, error: 'socket hang up', httpStatus: 0 });
});

test('봉투 → 허브 상태', () => {
  assert.equal(B.statusFromEnvelope({ kind: 'unauthorized' }), 'unauthorized');
  assert.equal(B.statusFromEnvelope({ kind: 'live' }), 'connected');
  assert.equal(B.statusFromEnvelope({ kind: 'partial' }), 'connected');
  assert.equal(B.statusFromEnvelope({ kind: 'not-configured' }), 'not-configured');
  assert.equal(B.statusFromEnvelope({ kind: 'error' }), null);
});

test('허브 모듈 모양: 팩토리·함수·객체', () => {
  const ctx = { tag: 1 };
  const made = { invoke: () => {} };
  assert.equal(B.hubFromModule({ createPetHub: (c) => (c === ctx ? made : null) }, ctx), made);
  assert.equal(B.hubFromModule({ create: () => made }, ctx), made);
  assert.equal(B.hubFromModule(() => made, ctx), made);
  assert.equal(B.hubFromModule(made, ctx), made);
  assert.equal(B.hubFromModule({}, ctx), null);
  assert.equal(B.hubFromModule(null, ctx), null);
});
