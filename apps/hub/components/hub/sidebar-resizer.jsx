"use client";

import React from "react";
import { SIDEBAR_WIDTH, clampSidebarWidth, nextSidebarWidth } from "@/lib/hub-preferences";

// 펼친 사이드바의 오른쪽 경계 — WAI-ARIA window splitter.
// 드래그 중에는 React 상태를 거치지 않고 셸의 --hub-sidebar-w만 바꾼다. 셸 상태가 바뀌면
// 현재 페이지 전체가 매 프레임 다시 그려지기 때문이다. 손을 뗄 때 한 번만 onCommit으로 확정한다.
export function SidebarResizer({ width, shellRef, onCommit }) {
  const dragRef = React.useRef(null);

  const preview = (element, value) => {
    shellRef.current?.style.setProperty("--hub-sidebar-w", `${value}px`);
    element.setAttribute("aria-valuenow", String(value));
  };

  const endDrag = (event, commit) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    shellRef.current?.removeAttribute("data-sidebar-resizing");
    if (!commit) {
      preview(event.currentTarget, drag.startWidth);
      return;
    }
    if (drag.value !== drag.startWidth) onCommit(drag.value);
  };

  return (
    <div
      className="hub-sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="사이드바 너비"
      aria-controls="hub-mobile-navigation"
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title="드래그해서 너비 조절 · 더블클릭하면 기본 너비"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = { startX: event.clientX, startWidth: width, value: width };
        shellRef.current?.setAttribute("data-sidebar-resizing", "true");
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        drag.value = clampSidebarWidth(drag.startWidth + event.clientX - drag.startX);
        preview(event.currentTarget, drag.value);
      }}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
      onLostPointerCapture={(event) => endDrag(event, true)}
      onKeyDown={(event) => {
        const next = nextSidebarWidth(width, event.key);
        if (next === null) return;
        event.preventDefault();
        if (next !== width) onCommit(next);
      }}
      onDoubleClick={() => {
        if (width !== SIDEBAR_WIDTH.default) onCommit(SIDEBAR_WIDTH.default);
      }}
    />
  );
}
