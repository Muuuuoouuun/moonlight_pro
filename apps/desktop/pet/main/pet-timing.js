'use strict';
// 시간 규칙 두 가지 — 짧은 메시지 줄 세우기와 집중 타이머. 타이머를 주입받아 테스트한다.
const C = require('../shared/contract');

// 짧은 메시지(326×130): 8초 보이고, 다음 것은 1초 뒤. 패널·집중 화면이 열려 있으면 기다린다(Mac PetActivityStore).
// canShow() → 지금 띄워도 되는가, show(notice) / hide() → 창 조작.
// isValid(notice) → 줄에서 기다린 알림이 보이기 직전에도 유효한가(선택). false 면 건너뛰고 다음 것을 본다 —
// 패널·집중 화면이 열려 있는 동안 읽음·숨김·시작한 일정이 된 알림을 나중에 띄우지 않는다.
function createBubbleQueue(options) {
  const set = options.setTimeout || setTimeout;
  const clear = options.clearTimeout || clearTimeout;
  const showMs = options.showMs || C.LIMITS.bubbleShowMs;
  const gapMs = options.gapMs || C.LIMITS.bubbleGapMs;
  const maxQueued = options.maxQueued || 20;
  const queue = [];
  let current = null;
  let presentSeq = 0; // 띄울 때·내릴 때마다 올린다 — 늦게 끝난 show 결과가 새 차례의 타이머를 켜지 않게
  let showTimer = null;
  let gapTimer = null;
  let last = null;

  function stillValid(notice) {
    if (typeof options.isValid !== 'function') return true;
    try {
      return options.isValid(notice) !== false;
    } catch {
      return false;
    }
  }

  function pump() {
    if (current || gapTimer !== null || !queue.length || !options.canShow()) return false;
    while (queue.length) {
      const next = queue.shift();
      if (!stillValid(next)) continue;
      present(next);
      return true;
    }
    return false;
  }

  // options.show 가 false 면 못 띄웠다(말풍선 페이지를 불러오지 못함) — 빈 말풍선 대신 이 차례를 거둔다.
  // Promise 면(창이 아직 페이지를 불러오는 중) 실제로 뜬 뒤부터 showMs 를 잰다. 그 밖(undefined·true)은 곧바로.
  function present(notice) {
    current = notice || null;
    if (notice) last = notice;
    const seq = ++presentSeq;
    if (showTimer !== null) clear(showTimer);
    showTimer = null;
    const arm = () => {
      if (seq !== presentSeq) return;
      showTimer = set(() => {
        showTimer = null;
        dismiss();
      }, showMs);
    };
    const failed = () => {
      if (seq === presentSeq) dismiss({ gap: false });
    };
    let shown;
    try {
      shown = options.show(current);
    } catch {
      shown = false;
    }
    if (shown && typeof shown.then === 'function') shown.then((ok) => (ok === false ? failed() : arm()), failed);
    else if (shown === false) failed();
    else arm();
  }

  // 보이던 메시지를 내린다. 다음 메시지는 1초 뒤에.
  function dismiss({ gap = true } = {}) {
    presentSeq += 1;
    if (showTimer !== null) clear(showTimer);
    showTimer = null;
    const was = current !== null || options.isVisible?.();
    current = null;
    if (was) options.hide();
    if (gap && was && gapTimer === null) {
      gapTimer = set(() => {
        gapTimer = null;
        pump();
      }, gapMs);
    }
  }

  return {
    // 새 알림 후보. 같은 id가 이미 줄에 있으면 무시한다.
    push(notice) {
      if (!notice || typeof notice !== 'object') return false;
      if (notice.id !== undefined && (queue.some((n) => n.id === notice.id) || (current && current.id === notice.id))) return false;
      queue.push(notice);
      while (queue.length > maxQueued) queue.shift();
      pump();
      return true;
    },
    pump,
    dismiss,
    // 트레이 "짧은 메시지 보기": 떠 있으면 내리고, 아니면 마지막 메시지(없으면 null)를 띄운다.
    // 마지막 메시지도 pump() 와 같은 isValid 로 다시 거른다 — 그사이 읽음·숨김·시작한 일정이 됐으면
    // 그 알림 대신 기본 인사(null)를 띄우고 잊는다.
    toggle() {
      if (current !== null || options.isVisible?.()) {
        dismiss();
        return false;
      }
      if (last && !stillValid(last)) last = null;
      present(last);
      return true;
    },
    get current() { return current; },
    get queued() { return queue.length; },
    get last() { return last; },
  };
}

// 집중 시간: 1~120분(Mac AppModel.startFocus). 잘못된 값은 null.
function clampFocusMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(120, Math.max(1, Math.round(n)));
}

function remainingSeconds(endsAt, now) {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

module.exports = { createBubbleQueue, clampFocusMinutes, remainingSeconds };
