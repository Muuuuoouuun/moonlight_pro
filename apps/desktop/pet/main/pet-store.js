'use strict';
// 펫 로컬 저장 — userData/pet-store.json 하나에 키별 JSON 값을 둔다(Mac UserDefaults 이름 그대로).
// 쓰기는 모아서(기본 150ms) 임시 파일 → 이름 바꾸기로 원자적으로 남기고, 종료 전에 flush()한다.
// 한 파일에는 한 인스턴스만 — 같은 경로로 다시 만들면 같은 객체를 돌려준다(두 메모리 사본이 서로의 쓰기를 덮지 않게).
// 허브 모델(pet-hub)은 셸이 넘기는 ctx.store 를 쓴다.
const fs = require('node:fs');
const path = require('node:path');

const STORE_FILE = 'pet-store.json';
const MAX_VALUE_BYTES = 4 * 1024 * 1024; // 알림 전달 기록(noticesKept 1000건)도 넉넉히 담는다

// 렌더러가 pet:store-get/set으로 만질 수 있는 키(정확히 같은 이름만).
// origin이 붙는 허브 키(petHub.pending.v1.<origin> 보류 명령, petNotices.delivery.v1.<origin> 알림 전달 기록)는
// 메인 프로세스의 허브 모델만 쓴다 — 렌더러가 쓰면 보류 명령이 주입되거나 메모리 사본과 어긋난다.
const STORE_KEYS = Object.freeze([
  'petPreview.character',
  'petPreview.memo',
  'petPreview.capturedMemos',
  'petPreview.taskDraft',
  'petNotices.banners',
  'petCouncil.draft',
  'petCouncil.source',
  'pet.position',
]);
const MAIN_ONLY_PREFIXES = Object.freeze(['petHub.pending.v1.', 'petNotices.delivery.v1.']);

function isAllowedStoreKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 300) return false;
  if (/[\u0000-\u001f\u007f]/.test(key)) return false;
  return STORE_KEYS.includes(key);
}

// 값은 JSON으로 왕복할 수 있어야 한다. undefined·함수·순환 참조·너무 큰 값은 거절한다.
function encodeValue(value) {
  if (value === undefined) return { ok: false, reason: 'undefined' };
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (typeof text !== 'string') return { ok: false, reason: 'not-json' };
  if (Buffer.byteLength(text, 'utf8') > MAX_VALUE_BYTES) return { ok: false, reason: 'too-large' };
  return { ok: true, value: JSON.parse(text) };
}

function readFileSafe(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const instances = new Map();

function createPetStore(file, options = {}) {
  const resolved = path.resolve(file);
  const existing = instances.get(resolved.toLowerCase());
  if (existing) return existing;
  const store = openPetStore(resolved, options);
  instances.set(resolved.toLowerCase(), store);
  return store;
}

function openPetStore(file, options = {}) {
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 150;
  const data = readFileSafe(file);
  let timer = null;
  let dirty = false;

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return true;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(data)}\n`);
      fs.renameSync(temp, file);
      dirty = false;
      return true;
    } catch {
      return false;
    }
  }

  function schedule() {
    dirty = true;
    if (delayMs <= 0) {
      flush();
      return;
    }
    if (timer) return;
    timer = setTimeout(flush, delayMs);
    if (timer.unref) timer.unref();
  }

  return {
    file,
    // 없는 키는 null.
    get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    // null이면 지운다. 결과 { ok, reason? }.
    set(key, value) {
      if (typeof key !== 'string' || !key || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return { ok: false, reason: 'key' };
      }
      if (value === null) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          delete data[key];
          schedule();
        }
        return { ok: true };
      }
      const encoded = encodeValue(value);
      if (!encoded.ok) return encoded;
      data[key] = encoded.value;
      schedule();
      return { ok: true };
    },
    keys() {
      return Object.keys(data);
    },
    flush,
  };
}

module.exports = { STORE_FILE, STORE_KEYS, MAIN_ONLY_PREFIXES, MAX_VALUE_BYTES, isAllowedStoreKey, encodeValue, createPetStore };
