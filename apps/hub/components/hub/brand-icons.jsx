"use client";

import React from "react";

// 브랜드 기호는 DB의 meta.glyph와 별개인 화면 자산이다. 작은 목록 행에서도 각
// 브랜드의 주제를 읽을 수 있도록 24px 그리드, 단색 1.6px 획, 둥근 끝을 공유한다.
// 채움은 눈·점·달처럼 작은 표지에만 쓴다. 2026-10-21 세트로 모두 저장소 고유 그림이며
// 원본은 docs/design-studies/2026-10-21-mywork-brand-develop/brand-tab-icons.json이다.
const MARKS = {
  "22nomad": {
    id: "robot",
    shape: <><rect x="4" y="8" width="16" height="11.5" rx="3.5"/><path d="M12 8V5"/><circle cx="12" cy="3.8" r="1.2"/><path d="M2 12.5v3M22 12.5v3"/><circle cx="9" cy="13.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="13.4" r="1.1" fill="currentColor" stroke="none"/><path d="M10 16.8h4"/></>,
  },
  bridgemaker: {
    id: "cross",
    shape: <path d="M10 3.5h4V8h4.5v4H14v8.5h-4V12H5.5V8H10z"/>,
  },
  classmoon: {
    id: "education",
    shape: <><path d="M12 8.5c-2.4-1.5-5.2-1.9-8.5-1.2v11.4c3.3-.7 6.1-.3 8.5 1.2 2.4-1.5 5.2-1.9 8.5-1.2V7.3c-3.3-.7-6.1-.3-8.5 1.2z"/><path d="M12 8.5v11.4"/><path d="M13.6 2.6a2.6 2.6 0 1 0 2.9 3.3 2 2 0 0 1-2.9-3.3z" fill="currentColor" stroke="none"/></>,
  },
  classin_side: {
    id: "classin-side",
    shape: <><path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8.5L7 20.5v-4H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M7.5 10h9M7.5 13h5.5"/></>,
  },
  holyfuncollector: {
    id: "angel",
    shape: <><ellipse cx="12" cy="3.6" rx="4.2" ry="1.3"/><circle cx="12" cy="13.5" r="7.2"/><path d="M9 12h.01M15 12h.01" strokeWidth="2.4"/><path d="M8.8 15.4c1.8 1.9 4.6 1.9 6.4 0"/></>,
  },
  moonpm: {
    id: "workflow",
    shape: <><rect x="2.5" y="4" width="7" height="5.5" rx="1.6"/><rect x="14.5" y="4" width="7" height="5.5" rx="1.6"/><rect x="14.5" y="14.5" width="7" height="5.5" rx="1.6"/><path d="M9.5 6.75h5M6 9.5v4.5a3.25 3.25 0 0 0 3.25 3.25h5.25"/></>,
  },
  politicofficer: {
    id: "balance",
    shape: <><path d="M12 3.5v16.5M8 20h8"/><path d="M4.5 7.5c2.4-1 4.9-1.5 7.5-1.5s5.1.5 7.5 1.5"/><path d="M4.5 7.5 2.5 13a3 3 0 0 0 4 0z"/><path d="M19.5 7.5 17.5 13a3 3 0 0 0 4 0z"/><circle cx="12" cy="3.5" r="1" fill="currentColor" stroke="none"/></>,
  },
  studyseagull: {
    id: "seagull",
    shape: <><circle cx="15" cy="7.5" r="2.6"/><path d="M17.6 7.3h3.2l-2.6 1.6"/><path d="M12.6 8.6C8.4 9 5 11.6 3 16.5c3.5-.5 6.6-.2 9.6.9 3.3 1.2 5.4-1 5-4.6l-.4-3.6"/><path d="M7.5 13.6c1.5-.1 3.2.3 4.8 1.1"/><path d="M10 17.6V21M13 18v3"/><circle cx="15.4" cy="7.2" r=".6" fill="currentColor" stroke="none"/></>,
  },
  gore: {
    id: "whale",
    shape: <><path d="M2.5 14c0-3.9 3.4-6.5 8-6.5 4 0 6.8 2 7.6 5.2.3 1.2 1.1 1.8 2.2 1.5L22 13.7c-.3 1.6-1.3 2.5-2.8 2.6-1.4 2.3-4.5 3.7-8.2 3.7-4.8 0-8.5-2.4-8.5-6z"/><path d="M19.6 14.5 21 10.6M19.6 14.5 16.8 11.4"/><circle cx="7" cy="12.4" r=".9" fill="currentColor" stroke="none"/><path d="M8 5.5V3.6M6.2 4.4 8 5.5l1.8-1.1"/></>,
  },
  sinabro: {
    id: "pen",
    shape: <><path d="M12 21v-7.5"/><circle cx="12" cy="11.5" r="2"/><path d="M12 2.8 6.2 9.6 9 20.2h6l2.8-10.6z"/><path d="M8.5 6.3h7"/></>,
  },
};

const ACADEMY = <><path d="M3 10 12 5l9 5-9 5-9-5Z"/><path d="M6 12v5c3 2.6 9 2.6 12 0v-5M21 10v6"/></>;
const GENERIC = <><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m12 8 4 4-4 4-4-4 4-4Z"/></>;

function markFor(brand) {
  const key = String(brand?.key || brand?.slug || "").toLowerCase();
  if (MARKS[key]) return MARKS[key];
  if (brand?.kind === "education" || /학원|academy|school/i.test(String(brand?.name || ""))) {
    return { id: "academy", shape: ACADEMY };
  }
  return { id: "generic", shape: GENERIC };
}

export function BrandIcon({ brand, size = 18, style }) {
  const mark = markFor(brand);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      data-brand-icon={mark.id} aria-hidden="true" focusable="false"
      style={{ flexShrink: 0, ...style }}>
      {mark.shape}
    </svg>
  );
}
