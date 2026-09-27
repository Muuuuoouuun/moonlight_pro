'use strict';
// 펫 상태 — 메인 프로세스 메모리 하나. 바뀔 때마다 onChange(snapshot)으로 모든 펫 창에 'pet:state-changed'를 보낸다.
// 캐릭터 선택만 저장한다(petPreview.character, Mac UserDefaults 이름). 창 위치는 pet-main이 pet.position에 둔다.
const C = require('../shared/contract');

const PRESENTATIONS = Object.freeze(['quick', 'widget']);
const HUB_STATUSES = Object.freeze(['connected', 'unauthorized', 'not-configured', 'offline', 'unknown']);
const CHARACTER_KEY = 'petPreview.character';

// 'pet:set-mode' 의 목적지(선택). 알림에서 열 때 그 날짜·그 대화로 연다 — 채널 이름은 그대로, payload 만 넓혔다.
//   { mode: 'calendar', date: 'YYYY-MM-DD' | ISO 날짜시각 }  → 그 날이 든 주, 그 날을 고른 일정
//   { mode: 'council', ownerId, scope? }                     → 그 담당·범위 대화(scope 없으면 'all')
// 읽을 수 없는 값은 null(모드만 바꾼다). 날짜시각은 이 PC 시간대의 날짜로 바꾼다.
function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function modeTargetFrom(mode, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (mode === 'calendar' && typeof p.date === 'string' && p.date.length <= 40) {
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date);
    if (plain) {
      const d = new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
      return d.getMonth() === Number(plain[2]) - 1 && d.getDate() === Number(plain[3]) ? { mode, date: p.date } : null;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.date)) return null;
    const ms = Date.parse(p.date);
    return Number.isFinite(ms) ? { mode, date: localDateKey(new Date(ms)) } : null;
  }
  if (mode === 'council' && typeof p.ownerId === 'string' && p.ownerId && p.ownerId.length <= 64) {
    const scope = typeof p.scope === 'string' && p.scope && p.scope.length <= 32 ? p.scope : 'all';
    return { mode, ownerId: p.ownerId, scope };
  }
  return null;
}

function emptyFocus() {
  return { running: false, remainingSec: 0, minutes: 25, totalSec: 0, confirmStop: false, confirmRevision: 0, dismissRevision: 0 };
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
    // 마지막 목적지 { seq, mode, date? | ownerId?, scope? } — 패널은 새 seq 에만 그 날짜·대화를 고른다.
    modeTarget: null,
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
    // target(modeTargetFrom 결과)이 있으면 같은 모드여도 새 seq 로 알린다 — 패널이 그 날짜·대화를 다시 고른다.
    setMode(mode, target = null) {
      if (!C.MODES.includes(mode)) return false;
      if (target && target.mode === mode) {
        const seq = (state.modeTarget ? state.modeTarget.seq : 0) + 1;
        patch({ mode, modeTarget: { ...target, seq } });
      } else {
        patch({ mode });
      }
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

module.exports = { PRESENTATIONS, HUB_STATUSES, CHARACTER_KEY, emptyFocus, characterList, modeTargetFrom, createPetState };
