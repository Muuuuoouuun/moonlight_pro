"use client";

// 되돌리기 창을 가진 지연 실행(deferred write) — my-work가 확립한 계약의 공유 추출.
// 쓰기를 실행해놓고 역방향으로 취소하는 게 아니라, 쓰기 자체를 창이 닫힐 때까지 미룬다.
// 그래서 되돌리기는 "진짜 취소"다(네트워크 왕복·역연산 없음).
//
// 언마운트 시멘틱: **flush(즉시 실행)**. 기존 페이지별 구현은 언마운트에 clearTimeout만
// 해서, "완료됨" 영수증을 보여준 뒤 3.5초 안에 페이지를 떠나면 PATCH가 조용히 증발했다
// (2026-08-05 system-eval 발견). 실행 콜백은 fetch 중심이라 컴포넌트 생존이 필요 없고,
// React 18에서 언마운트 후 setState는 무해한 no-op이므로 flush가 안전하다.

import React from "react";

export const UNDO_WINDOW_MS = 3500;

export function useUndoableAction() {
  const timers = React.useRef(new Map()); // key → { timerId, run }

  React.useEffect(() => () => {
    timers.current.forEach(({ timerId, run }) => {
      clearTimeout(timerId);
      try { run(); } catch { /* flush 실패는 콜백 자신의 에러 처리에 맡긴다 */ }
    });
    timers.current.clear();
  }, []);

  // 같은 key로 재예약하면 이전 예약은 대체된다(타이머만 교체, 실행하지 않음).
  const schedule = React.useCallback((key, run, delay = UNDO_WINDOW_MS) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing.timerId);
    const timerId = setTimeout(() => {
      timers.current.delete(key);
      run();
    }, delay);
    timers.current.set(key, { timerId, run });
  }, []);

  // 창이 아직 열려 있으면 취소하고 true — 이미 실행됐으면 false(되돌릴 수 없음).
  const cancel = React.useCallback((key) => {
    const entry = timers.current.get(key);
    if (!entry) return false;
    clearTimeout(entry.timerId);
    timers.current.delete(key);
    return true;
  }, []);

  return { schedule, cancel };
}
