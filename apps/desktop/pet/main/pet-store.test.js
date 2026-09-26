'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPetStore, isAllowedStoreKey, STORE_FILE } = require('./pet-store');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pet-store-')), STORE_FILE);

test('키 허용 목록: Mac UserDefaults 이름과 origin 접두사만', () => {
  for (const key of ['petPreview.character', 'petPreview.memo', 'petPreview.capturedMemos', 'petPreview.taskDraft',
    'petNotices.banners', 'petCouncil.draft', 'petCouncil.source', 'pet.position',
    'petHub.pending.v1.https://hub.example.com', 'petNotices.delivery.v1.http://127.0.0.1:3000']) {
    assert.equal(isAllowedStoreKey(key), true, key);
  }
  for (const key of ['', 'petHub.pending.v1.', 'other', '__proto__', 'petPreview.characterX', 'pet.position\n', 42, null]) {
    assert.equal(isAllowedStoreKey(key), false, String(key));
  }
});

test('get/set/삭제와 다시 읽기', () => {
  const file = tempFile();
  const store = createPetStore(file, { delayMs: 0 });
  assert.equal(store.get('petPreview.memo'), null);
  assert.deepEqual(store.set('petPreview.memo', '한 줄 메모'), { ok: true });
  assert.deepEqual(store.set('pet.position', { x: 1376, y: 512 }), { ok: true });
  assert.equal(store.get('petPreview.memo'), '한 줄 메모');
  const again = createPetStore(file);
  assert.deepEqual(again.get('pet.position'), { x: 1376, y: 512 });
  store.set('petPreview.memo', null);
  assert.equal(createPetStore(file).get('petPreview.memo'), null);
  assert.deepEqual(createPetStore(file).keys(), ['pet.position']);
});

test('값은 JSON 왕복 복사본으로 저장하고, 못 쓰는 값은 거절', () => {
  const store = createPetStore(tempFile(), { delayMs: 0 });
  const value = { list: [1, 2], when: new Date(0) };
  store.set('petNotices.banners', value);
  value.list.push(3);
  assert.deepEqual(store.get('petNotices.banners'), { list: [1, 2], when: '1970-01-01T00:00:00.000Z' });
  const loop = {};
  loop.self = loop;
  assert.equal(store.set('petNotices.banners', loop).ok, false);
  assert.equal(store.set('petNotices.banners', undefined).ok, false);
  assert.equal(store.set('petNotices.banners', 'x'.repeat(5 * 1024 * 1024)).reason, 'too-large');
});

test('모아 쓰기: flush 전에는 파일이 없고, flush 뒤에 남는다', () => {
  const file = tempFile();
  const store = createPetStore(file, { delayMs: 10000 });
  store.set('petPreview.taskDraft', '초안');
  assert.equal(fs.existsSync(file), false);
  assert.equal(store.flush(), true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))['petPreview.taskDraft'], '초안');
});

test('깨진 파일은 빈 저장소로 연다', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(createPetStore(file).keys(), []);
  fs.writeFileSync(file, '[1,2]');
  assert.deepEqual(createPetStore(file).keys(), []);
});
