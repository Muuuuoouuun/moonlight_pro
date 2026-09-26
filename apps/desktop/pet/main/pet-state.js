'use strict';
// 펫 상태 — 메인 프로세스 메모리 하나. 바뀔 때마다 onChange(snapshot)으로 모든 펫 창에 'pet:state-changed'를 보낸다.
// 캐릭터 선택만 저장한다(petPreview.character, Mac UserDefaults 이름). 창 위치는 pet-main이 pet.position에 둔다.
const C = require('../shared/contract');

const PRESENTATIONS = Object.freeze(['quick', 'widget']);
const HUB_STATUSES = Object.freeze(['connected', 'unauthorized', 'not-configured', 'offline', 'unknown']);
const CHARACTER_KEY = 'petPreview.character';

function emptyFocus() {
  return { running: false, remainingSec: 0, minutes: 25, totalSec: 0, confirmStop: false, confirmRevision: 0 };
}

// characters: 렌더러가 그대로 쓰는 목록. assetUrl(fileName) → 이미지 주소(file://…).
function characterList(assetUrl) {
  return C.CHARACTERS.map((c) => ({
    key: c.key,
    name: c.name,
    role: c.role,
    officeId: c.officeId,
    color: c.color,
    wash: c.wash,
    portrait: assetUrl(c.portrait),
    cutout: assetUrl(c.cutout),
  }));
}

function createPetState(options = {}) {
  const store = options.store || null;
  const onChange = options.onChange || (() => {});
  const assetUrl = options.assetUrl || ((name) => name);
  const saved = store ? store.get(CHARACTER_KEY) : null;
  const state = {
    character: C.CHARACTERS.some((c) => c.key === saved) ? saved : C.DEFAULT_CHARACTER,
    characters: characterList(assetUrl),
    mode: 'tasks',
    presentation: 'quick',
    pinned: false,
    panelOpen: false,
    perched: false,
    hubUrl: typeof options.hubUrl === 'string' ? options.hubUrl : '',
    hubStatus: 'unknown',
    badge: 0,
    prefs: { reduceTransparency: false, highContrast: false, reduceMotion: false },
    focus: emptyFocus(),
  };

  const snapshot = () => JSON.parse(JSON.stringify(state));
  const emit = () => onChange(snapshot());

  // 바뀐 값이 있을 때만 알린다. 결과는 바뀌었는지.
  function patch(partial, { silent = false } = {}) {
    let changed = false;
    for (const [key, value] of Object.entries(partial)) {
      if (!(key in state) || key === 'characters') continue;
      const next = key === 'prefs' || key === 'focus' ? { ...state[key], ...value } : value;
      if (JSON.stringify(state[key]) !== JSON.stringify(next)) {
        state[key] = next;
        changed = true;
      }
    }
    if (changed && !silent) emit();
    return changed;
  }

  return {
    get: snapshot,
    get character() { return state.character; },
    get mode() { return state.mode; },
    get presentation() { return state.presentation; },
    get panelOpen() { return state.panelOpen; },
    get focus() { return { ...state.focus }; },
    patch,
    emit,
    setCharacter(key) {
      if (!C.CHARACTERS.some((c) => c.key === key)) return false;
      if (store) store.set(CHARACTER_KEY, key);
      patch({ character: key });
      return true;
    },
    setMode(mode) {
      if (!C.MODES.includes(mode)) return false;
      patch({ mode });
      return true;
    },
    setHubStatus(status) {
      if (!HUB_STATUSES.includes(status)) return false;
      patch({ hubStatus: status });
      return true;
    },
    setBadge(count) {
      const n = Number(count);
      if (!Number.isFinite(n) || n < 0) return false;
      patch({ badge: Math.min(Math.floor(n), 9999) });
      return true;
    },
  };
}

module.exports = { PRESENTATIONS, HUB_STATUSES, CHARACTER_KEY, emptyFocus, characterList, createPetState };
