// 할 일 화면의 순수 규칙 — 정렬, 입력 검증, 완료 뒤 3초 유예(Mac TaskCompletionFeedback 이식).
// 유예는 표시 전용이다: 저장은 허브가 확인하고, 여기서는 방금 완료한 행을 원래 자리에 3초 남겼다가 숨긴다.
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const api = factory(C);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).tasks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const MAX_TITLE = C.LIMITS.taskTitle;
  const GRACE_MS = C.LIMITS.taskDoneGraceMs;

  const isDone = (task) => !!task && task.status === 'done';

  function validateTitle(text) {
    const value = String(text == null ? '' : text).trim();
    if (!value.length || value.length > MAX_TITLE) {
      return { ok: false, value, error: `할 일은 1~${MAX_TITLE}자로 적어 주세요.` };
    }
    return { ok: true, value, error: null };
  }

  // 남은 할 일 먼저, 각 무리 안에서는 허브가 준 순서를 지킨다(안정 정렬).
  function orderTasks(tasks) {
    const list = Array.isArray(tasks) ? tasks.filter((t) => t && t.id != null) : [];
    return list.filter((t) => !isDone(t)).concat(list.filter(isDone));
  }

  // 유예 관리자. 타이머는 주입한다(테스트는 가짜 시계를 쓴다).
  function createGrace(options) {
    const opts = options || {};
    const delay = opts.delayMs == null ? GRACE_MS : opts.delayMs;
    const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = opts.clearTimer || ((h) => clearTimeout(h));
    const onChange = opts.onChange || (() => {});
    let entries = [];
    let seq = 0;

    function cancel(id, silent) {
      const hit = entries.filter((e) => e.id === id);
      if (!hit.length) return false;
      hit.forEach((e) => clearTimer(e.timer));
      entries = entries.filter((e) => e.id !== id);
      if (!silent) onChange();
      return true;
    }

    function retain(id, order) {
      cancel(id, true);
      const token = ++seq;
      const ids = Array.isArray(order) ? order : [];
      const position = ids.indexOf(id) < 0 ? ids.length : ids.indexOf(id);
      const timer = setTimer(() => {
        if (entries.some((e) => e.token === token)) cancel(id);
      }, delay);
      entries.push({
        id, token, timer,
        preceding: new Set(ids.slice(0, position)),
        following: new Set(ids.slice(position + 1)),
      });
      onChange();
    }

    function reset() {
      entries.forEach((e) => clearTimer(e.timer));
      const had = entries.length > 0;
      entries = [];
      if (had) onChange();
    }

    const isRetained = (id) => entries.some((e) => e.id === id);

    // 기본 목록: 남은 할 일 + 유예 중인 완료 행(원래 이웃 사이 자리).
    function visible(source, includeCompleted) {
      const ordered = orderTasks(source);
      if (includeCompleted) return ordered;
      const result = ordered.filter((t) => !isDone(t));
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        const task = ordered.find((t) => t.id === entry.id && isDone(t));
        if (!task) continue;
        let at = result.findIndex((t) => entry.following.has(t.id));
        if (at < 0) {
          let last = -1;
          result.forEach((t, idx) => { if (entry.preceding.has(t.id)) last = idx; });
          at = last >= 0 ? last + 1 : result.length;
        }
        result.splice(at, 0, task);
      }
      return result;
    }

    return { retain, cancel: (id) => cancel(id), reset, isRetained, visible, get size() { return entries.length; } };
  }

  function openCount(tasks) {
    return (Array.isArray(tasks) ? tasks : []).filter((t) => !isDone(t)).length;
  }

  // 목록 위 한 줄. 실패·로딩 중에는 "남은 0개"라고 말하지 않는다.
  function countLabel({ loading, failed, visibleTasks }) {
    if (loading) return '불러오는 중…';
    if (failed) return '할 일 확인 필요';
    return `남은 ${openCount(visibleTasks)}개`;
  }

  function emptyMessage(completedCount) {
    return completedCount > 0 ? '남은 할 일을 모두 마쳤어요.' : '할 일 하나부터 적어볼까요?';
  }

  function shortTitle(title, max) {
    const limit = max || 30;
    const text = String(title || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  return { MAX_TITLE, GRACE_MS, isDone, validateTitle, orderTasks, createGrace, openCount, countLabel, emptyMessage, shortTitle };
});
