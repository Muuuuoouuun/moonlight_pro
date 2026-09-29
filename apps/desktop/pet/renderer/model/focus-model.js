// 집중 모드의 순수 규칙 — 1~120분, 남은 시간 표기, 진행률, Esc 길게 누르기 1.3초.
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const api = factory(C);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).focus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRESETS = Object.freeze([15, 25, 50]);
  const MIN = 1;
  const MAX = 120;
  const DEFAULT = 25;
  const HOLD_MS = 1300;

  function clampMinutes(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return DEFAULT;
    return Math.min(MAX, Math.max(MIN, n));
  }

  function formatRemaining(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function progress(remainingSec, minutes) {
    const total = clampMinutes(minutes) * 60;
    const left = Math.max(0, Number(remainingSec) || 0);
    return Math.min(1, Math.max(0, 1 - left / total));
  }

  function startLabel(minutes) { return `${clampMinutes(minutes)}분 집중 시작`; }

  // 셸의 집중 채널(pet:focus-start·stop·state)은 계약 봉투 { kind, data, error } 로 답한다. data 는 state.focus 모양.
  function focusFrom(result) {
    const data = result && result.kind === 'live' ? result.data : null;
    return data && typeof data === 'object' && typeof data.running === 'boolean' ? data : null;
  }
  // 시작 실패 문구(성공이면 null).
  function startError(result) {
    if (focusFrom(result)) return null;
    if (result && result.kind === 'invalid') return '집중 시간은 1~120분으로 골라 주세요.';
    return '집중 화면을 열지 못했어요. 다시 시도해 주세요.';
  }
  // 중지 확인은 메인이 Esc 1.3초를 잴 때마다 confirmRevision 을 올린다. 새 revision 에만 확인을 연다 —
  // 캐릭터·배지 같은 다른 상태 방송에 이미 닫은 확인이 다시 뜨지 않게. 집중이 끝나면 닫는다.
  // 메인이 확인을 거둘 때(확인 중 Esc — 보조 모니터 창에서 누른 것 포함, '계속 집중') dismissRevision 을 올린다.
  // 새 dismissRevision 이면 떠 있던 확인을 닫는다 — 페이지의 '중지' 버튼으로 연 확인은 다른 상태 방송에 닫히지 않는다.
  function confirmAfterState(view, focus) {
    const v = view || { confirming: false, seenRevision: 0, seenDismiss: 0 };
    const seenDismiss = Number(v.seenDismiss) || 0;
    const f = focus || {};
    const dismiss = Number(f.dismissRevision) || 0;
    if (!f.running) {
      return { confirming: false, seenRevision: Number(f.confirmRevision) || v.seenRevision, seenDismiss: Math.max(seenDismiss, dismiss) };
    }
    const revision = Number(f.confirmRevision) || 0;
    if (f.confirmStop === true && revision > v.seenRevision) return { confirming: true, seenRevision: revision, seenDismiss: Math.max(seenDismiss, dismiss) };
    if (dismiss > seenDismiss) return { confirming: false, seenRevision: Math.max(v.seenRevision, revision), seenDismiss: dismiss };
    return { confirming: v.confirming, seenRevision: Math.max(v.seenRevision, revision), seenDismiss };
  }

  // 집중 화면의 Esc keydown 하나를 어떻게 다룰까. 'dismiss' 떠 있는 확인을 닫는다(그 누름은 뗄 때까지 잠긴다),
  // 'hold' 1.3초 진행선을 그린다, 'ignore' 아무것도 하지 않는다(자동 반복·한글 조합 중·확인을 닫은 누름).
  function escDownAction(input) {
    const s = input || {};
    if (s.repeat || s.composing) return 'ignore';
    if (s.confirming) return 'dismiss';
    if (s.latched) return 'ignore';
    return 'hold';
  }

  return { PRESETS, MIN, MAX, DEFAULT, HOLD_MS, clampMinutes, formatRemaining, progress, startLabel, focusFrom, startError, confirmAfterState, escDownAction };
});
