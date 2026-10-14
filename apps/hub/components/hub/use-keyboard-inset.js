"use client";

// 화면 키보드를 따라가는 표면 — 보이는 창(visualViewport)을 듣고 두 CSS 변수를 그 요소에 적는다.
// 빠른 메모(quick-memo.jsx)에만 있던 처리를 공용으로 옮긴 것이다: 전체 높이 기록 시트(Drawer sheet="full")가
// 같은 값을 쓴다. 값의 계산은 순수 함수(lib/visual-viewport.js)가 하고 여기는 듣고 적기만 한다.
//   keyboardVar — 바닥에서 키보드 위 끝까지의 높이(px).  viewportVar — 지금 보이는 높이(px).
// 끄면(enabled=false) 적어 둔 값을 지운다 — 스타일시트의 기본값(0px · 100dvh)으로 돌아간다.

import React from "react";
import { keyboardInset } from "@/lib/visual-viewport";

export function useKeyboardInset(ref, { enabled = true, keyboardVar, viewportVar } = {}) {
  React.useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof window === "undefined") return undefined;
    const viewport = window.visualViewport;
    const update = () => {
      const inset = keyboardInset({ innerHeight: window.innerHeight, viewportHeight: viewport?.height, offsetTop: viewport?.offsetTop });
      if (keyboardVar) el.style.setProperty(keyboardVar, `${inset.keyboard}px`);
      if (viewportVar) el.style.setProperty(viewportVar, `${inset.viewport}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      if (keyboardVar) el.style.removeProperty(keyboardVar);
      if (viewportVar) el.style.removeProperty(viewportVar);
    };
  }, [ref, enabled, keyboardVar, viewportVar]);
}
