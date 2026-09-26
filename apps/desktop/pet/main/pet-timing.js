'use strict';
// 시간 규칙 두 가지 — 짧은 메시지 줄 세우기와 집중 타이머. 타이머를 주입받아 테스트한다.
const C = require('../shared/contract');

// 짧은 메시지(326×130): 8초 보이고, 다음 것은 1초 뒤. 패널·집중 화면이 열려 있으면 기다린다(Mac PetActivityStore).
// canShow() → 지금 띄워도 되는가, show(notice) / hide() → 창 조작.
function createBubbleQueue(options) {
  const set = options.setTimeout || setTimeout;
  const clear = options.clearTimeout || clearTimeout;
  const showMs = options.showMs || C.LIMITS.bubbleShowMs;
  const gapMs = options.gapMs || C.LIMITS.bubbleGapMs;
  const maxQueued = options.maxQueued || 20;
  const queue = [];
  let current = null;
  let showTimer = null;
  let gapTimer = null;
  let last = null;

  function pump() {
    if (current || gapTimer !== null || !queue.length || !options.canShow()) return false;
    present(queue.shift());
    return true;
  }

  function present(notice) {
    current = notice || null;
    if (notice) last = notice;
    options.show(current);
    if (showTimer !== null) clear(showTimer);
    showTimer = set(() => {
      showTimer = null;
      dismiss();
    }, showMs);
  }

  // 보이던 메시지를 내린다. 다음 메시지는 1초 뒤에.
  function dismiss({ gap = true } = {}) {
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
    toggle() {
      if (current !== null || options.isVisible?.()) {
        dismiss();
        return false;
      }
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
