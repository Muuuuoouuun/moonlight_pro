"use client";

import React from "react";
import {
  SIDEBAR_WIDTH,
  clampSidebarWidth,
  nextSidebarWidth,
  shouldCollapseSidebar,
} from "@/lib/hub-preferences";

// 펼친 사이드바의 오른쪽 경계 — WAI-ARIA window splitter.
// 드래그 중에는 React 상태를 거치지 않고 셸의 --hub-sidebar-w만 바꾼다. 셸 상태가 바뀌면
// 현재 페이지 전체가 매 프레임 다시 그려지기 때문이다. 손을 뗄 때 한 번만 onCommit 또는 onCollapse로 확정한다.
// 왼쪽으로 collapseThreshold(140px) 미만까지 드래그하면 아이콘 레일(56px) 미리보기를 띄우고,
// 손을 떼면 사이드바를 최소화한다.
export function SidebarResizer({ width, shellRef, onCommit, onCollapse }) {
  const dragRef = React.useRef(null);

  const preview = (element, value, isCollapsing = false) => {
    shellRef.current?.style.setProperty("--hub-sidebar-w", `${value}px`);
    element.setAttribute("aria-valuenow", String(value));
    if (isCollapsing) {
      shellRef.current?.setAttribute("data-sidebar-collapse-preview", "true");
    } else {
      shellRef.current?.removeAttribute("data-sidebar-collapse-preview");
    }
  };

  const endDrag = (event, commit) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    shellRef.current?.removeAttribute("data-sidebar-resizing");
    shellRef.current?.removeAttribute("data-sidebar-collapse-preview");

    if (!commit) {
      preview(event.currentTarget, drag.startWidth, false);
      return;
    }

    if (drag.collapsed) {
      // 펼친 너비 변수는 드래그 시작 전 값으로 되돌려두어, 나중에 다시 펼칠 때 이전 너비로 복원되게 한다.
      preview(event.currentTarget, drag.startWidth, false);
      if (typeof onCollapse === "function") {
        onCollapse();
      } else {
        onCommit?.(SIDEBAR_WIDTH.min);
      }
      return;
    }

    if (drag.value !== drag.startWidth) onCommit?.(drag.value);
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
      title="드래그해서 너비 조절 · 왼쪽 끝으로 드래그하면 최소화 · 더블클릭하면 기본 너비"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = { startX: event.clientX, startWidth: width, value: width, collapsed: false };
        shellRef.current?.setAttribute("data-sidebar-resizing", "true");
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const rawWidth = drag.startWidth + event.clientX - drag.startX;
        if (shouldCollapseSidebar(rawWidth)) {
          drag.collapsed = true;
          preview(event.currentTarget, SIDEBAR_WIDTH.rail, true);
        } else {
          drag.collapsed = false;
          drag.value = clampSidebarWidth(rawWidth);
          preview(event.currentTarget, drag.value, false);
        }
      }}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
      onLostPointerCapture={(event) => endDrag(event, true)}
      onKeyDown={(event) => {
        const next = nextSidebarWidth(width, event.key);
        if (next === null) return;
        event.preventDefault();
        if (next !== width) onCommit?.(next);
      }}
      onDoubleClick={() => {
        if (width !== SIDEBAR_WIDTH.default) onCommit?.(SIDEBAR_WIDTH.default);
      }}
    />
  );
}
