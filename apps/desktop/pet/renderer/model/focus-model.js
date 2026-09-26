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

  return { PRESETS, MIN, MAX, DEFAULT, HOLD_MS, clampMinutes, formatRemaining, progress, startLabel };
});
