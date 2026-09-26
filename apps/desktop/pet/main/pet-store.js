'use strict';
// 펫 로컬 저장 — userData/pet-store.json 하나에 키별 JSON 값을 둔다(Mac UserDefaults 이름 그대로).
// 쓰기는 모아서(기본 150ms) 임시 파일 → 이름 바꾸기로 원자적으로 남기고, 종료 전에 flush()한다.
// 허브 패키지(pet-hub-client)도 이 모듈을 이름으로 가져다 쓴다: createPetStore(file) → { get, set, … }.
const fs = require('node:fs');
const path = require('node:path');

const STORE_FILE = 'pet-store.json';
const MAX_VALUE_BYTES = 4 * 1024 * 1024; // 알림 전달 기록(noticesKept 1000건)도 넉넉히 담는다

// 렌더러가 pet:store-get/set으로 만질 수 있는 키. 정확히 같은 이름 또는 origin이 붙는 접두사.
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
const STORE_KEY_PREFIXES = Object.freeze(['petHub.pending.v1.', 'petNotices.delivery.v1.']);

function isAllowedStoreKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 300) return false;
  if (/[\u0000-\u001f\u007f]/.test(key)) return false;
  if (STORE_KEYS.includes(key)) return true;
  return STORE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix) && key.length > prefix.length);
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

function createPetStore(file, options = {}) {
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

module.exports = { STORE_FILE, STORE_KEYS, STORE_KEY_PREFIXES, MAX_VALUE_BYTES, isAllowedStoreKey, encodeValue, createPetStore };
