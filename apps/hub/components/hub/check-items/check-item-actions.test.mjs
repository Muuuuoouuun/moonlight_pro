import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberMinutes, rememberedMinutes } from './check-item-actions.js';

// 2026-10-07 통합 검증에서 잡은 회귀: catch 블록에 바인딩 없는 `status`를 읽는 줄이 섞여 있어, Node에서는
// 저장소 읽기가 실패하면 기본값 대신 ReferenceError가 났다(브라우저는 `window.status`로 지나가 숨었다).
function withStorage(storage, run) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  try { return run(); }
  finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true, writable: true });
    else delete globalThis.localStorage;
  }
}

test('소요 시간 기억은 저장소가 막혀도 기본값으로 돌고 던지지 않는다', () => {
  const blocked = { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); } };
  withStorage(blocked, () => {
    assert.equal(rememberedMinutes('deal', 20), 20);
    assert.doesNotThrow(() => rememberMinutes('deal', 30));
  });
});

test('기억된 값이 깨져 있으면 기본값, 허용 목록 밖이면 기본값, 맞으면 그 값', () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  withStorage(storage, () => {
    assert.equal(rememberedMinutes('deal', 20), 20, '아무것도 없을 때');
    memory.set('mlp.checkScheduleMinutes', 'not json');
    assert.equal(rememberedMinutes('deal', 20), 20, '깨진 JSON');
    assert.doesNotThrow(() => rememberMinutes('deal', 45), '깨진 JSON 위에 저장을 시도해도 던지지 않는다');
    memory.clear();
    rememberMinutes('deal', 45);
    assert.equal(rememberedMinutes('deal', 20), 45);
    rememberMinutes('deal', 7);
    assert.equal(rememberedMinutes('deal', 20), 20, '허용 목록(15·30·45·60) 밖');
  });
});
