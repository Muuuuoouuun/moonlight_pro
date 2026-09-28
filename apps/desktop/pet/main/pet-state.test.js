'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/contract');
const { createPetState, modeTargetFrom, CHARACTER_KEY } = require('./pet-state');

function memoryStore(initial = {}) {
  const data = { ...initial };
  return { get: (k) => (k in data ? data[k] : null), set: (k, v) => { data[k] = v; return { ok: true }; }, data };
}

test('기본 캐릭터는 글레이시아(silver), 저장된 선택을 되살린다', () => {
  assert.equal(createPetState({ store: memoryStore() }).get().character, 'silver');
  assert.equal(createPetState({ store: memoryStore({ [CHARACTER_KEY]: 'pink' }) }).get().character, 'pink');
  assert.equal(createPetState({ store: memoryStore({ [CHARACTER_KEY]: 'nope' }) }).get().character, 'silver');
});

test('상태 모양: 계약의 필드와 캐릭터 9종', () => {
  const state = createPetState({ assetUrl: (name) => `file:///assets/${name}`, hubUrl: 'https://hub.example.com' }).get();
  for (const key of ['character', 'characters', 'mode', 'presentation', 'pinned', 'hubUrl', 'hubStatus', 'badge', 'prefs', 'focus']) {
    assert.ok(key in state, key);
  }
  assert.equal(state.characters.length, 9);
  assert.deepEqual(state.characters.map((c) => c.key), C.CHARACTERS.map((c) => c.key));
  assert.equal(state.characters[7].portrait, 'file:///assets/portrait-silver.png');
  assert.deepEqual(Object.keys(state.prefs).sort(), ['highContrast', 'reduceMotion', 'reduceTransparency']);
  assert.deepEqual(Object.keys(state.focus).slice(0, 3), ['running', 'remainingSec', 'minutes']);
  assert.equal(state.presentation, 'quick');
  assert.equal(state.hubUrl, 'https://hub.example.com');
});

test('바뀔 때만 알리고, 저장은 캐릭터만', () => {
  const store = memoryStore();
  const seen = [];
  const s = createPetState({ store, onChange: (snap) => seen.push(snap) });
  assert.equal(s.setCharacter('red'), true);
  assert.equal(store.data[CHARACTER_KEY], 'red');
  assert.equal(seen.length, 1);
  assert.equal(s.setCharacter('red'), true);
  assert.equal(seen.length, 1); // 같은 값
  assert.equal(s.setCharacter('x'), false);
  assert.equal(s.setMode('memo'), true);
  assert.equal(s.setMode('bogus'), false);
  assert.equal(s.setHubStatus('unauthorized'), true);
  assert.equal(s.setHubStatus('weird'), false);
  assert.equal(s.setBadge(3.7), true);
  assert.equal(s.setBadge(-1), false);
  s.patch({ prefs: { reduceMotion: true } });
  s.patch({ focus: { running: true, remainingSec: 60 } });
  const last = seen.at(-1);
  assert.equal(last.mode, 'memo');
  assert.equal(last.badge, 3);
  assert.equal(last.hubStatus, 'unauthorized');
  assert.deepEqual(last.prefs, { reduceTransparency: false, highContrast: false, reduceMotion: true });
  assert.equal(last.focus.running, true);
  assert.equal(last.focus.minutes, 25);
  // 스냅숏은 복사본
  last.mode = 'tasks';
  assert.equal(s.get().mode, 'memo');
  assert.equal(s.patch({ characters: [] }), false);
  assert.equal(s.patch({ unknownKey: 1 }), false);
});

test('모드 목적지: 일정은 그 날짜(날짜시각은 이 PC 날짜), Council 은 담당·범위 — 같은 모드여도 새 seq 로 알린다', () => {
  assert.deepEqual(modeTargetFrom('calendar', { mode: 'calendar', date: '2026-09-28' }), { mode: 'calendar', date: '2026-09-28' });
  const local = new Date(2026, 8, 28, 9, 30);
  assert.deepEqual(modeTargetFrom('calendar', { date: local.toISOString() }), { mode: 'calendar', date: '2026-09-28' });
  assert.equal(modeTargetFrom('calendar', { date: '2026-02-30' }), null, '없는 날짜');
  assert.equal(modeTargetFrom('calendar', { date: 'tomorrow' }), null);
  assert.equal(modeTargetFrom('calendar', {}), null);
  assert.deepEqual(modeTargetFrom('council', { ownerId: 'eevee', scope: 'classin' }), { mode: 'council', ownerId: 'eevee', scope: 'classin' });
  assert.deepEqual(modeTargetFrom('council', { ownerId: 'eevee' }), { mode: 'council', ownerId: 'eevee', scope: 'all' });
  assert.equal(modeTargetFrom('council', { ownerId: '' }), null);
  assert.equal(modeTargetFrom('council', { ownerId: 'x'.repeat(65) }), null);
  assert.equal(modeTargetFrom('tasks', { date: '2026-09-28' }), null, '목적지가 없는 모드');
  assert.equal(modeTargetFrom('calendar', null), null);

  const seen = [];
  const s = createPetState({ onChange: (snap) => seen.push(snap) });
  assert.equal(s.get().modeTarget, null);
  s.setMode('calendar', modeTargetFrom('calendar', { date: '2026-09-28' }));
  assert.deepEqual(s.get().modeTarget, { mode: 'calendar', date: '2026-09-28', seq: 1 });
  assert.equal(s.get().mode, 'calendar');
  const count = seen.length;
  s.setMode('calendar', modeTargetFrom('calendar', { date: '2026-09-28' }));
  assert.equal(seen.length, count + 1, '같은 모드·같은 날짜여도 다시 알린다');
  assert.equal(s.get().modeTarget.seq, 2);
  s.setMode('tasks');
  assert.equal(s.get().modeTarget.seq, 2, '목적지 없는 전환은 목적지를 건드리지 않는다');
  s.setMode('tasks', { mode: 'calendar', date: '2026-09-28' });
  assert.equal(s.get().modeTarget.seq, 2, '다른 모드의 목적지는 무시한다');
});
