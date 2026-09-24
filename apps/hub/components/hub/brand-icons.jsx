"use client";

import React from "react";

// 브랜드 기호는 DB의 meta.glyph와 별개인 화면 자산이다. 작은 목록 행에서도 각
// 브랜드의 주제를 읽을 수 있도록 24px 그리드, 단색 1.7px 획을 공유한다.
const MARKS = {
  "22nomad": {
    id: "robot",
    shape: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 7V4m-2 0h4M8 20v1m8-1v1"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M9 17h6"/></>,
  },
  bridgemaker: {
    id: "cross",
    shape: <path d="M10 21h4v-9h5V8h-5V3h-4v5H5v4h5v9Z"/>,
  },
  classmoon: {
    id: "education",
    shape: <><path d="M12 7c-2.5-1.6-5.4-2-9-1v13c3.6-1 6.5-.6 9 1 2.5-1.6 5.4-2 9-1V6c-3.6-1-6.5-.6-9 1Zm0 0v13"/><path d="M6 10h3m6 0h3M6 14h3m6 0h3"/></>,
  },
  classin_side: {
    id: "classin-side",
    shape: <><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 13h5"/><circle cx="17" cy="13" r="1" fill="currentColor" stroke="none"/></>,
  },
  holyfuncollector: {
    id: "angel",
    shape: <><ellipse cx="12" cy="4" rx="3.5" ry="1.2"/><circle cx="12" cy="9" r="2.2"/><path d="M9.3 11.4C6 10.5 3.7 12 3 15.6c1.7-.7 3.3-.7 4.8.2M14.7 11.4c3.3-.9 5.6.6 6.3 4.2-1.7-.7-3.3-.7-4.8.2M9.1 13.3 7.5 20h9l-1.6-6.7"/></>,
  },
  moonpm: {
    id: "workflow",
    shape: <><rect x="3" y="4" width="7" height="6" rx="1.2"/><rect x="15" y="4" width="6" height="6" rx="1.2"/><rect x="15" y="15" width="6" height="6" rx="1.2"/><path d="M10 7h5m-5 0h2v11h3"/></>,
  },
  politicofficer: {
    id: "balance",
    shape: <><path d="M12 4v16m-5 0h10M5 8h14M7 8l-3 6h6L7 8Zm10 0-3 6h6l-3-6Z"/><circle cx="12" cy="4" r="1"/></>,
  },
  studyseagull: {
    id: "seagull",
    // Lucide Bird 윤곽을 18px 행 크기에 맞춰 조정했다. 라이선스: brand-icons.LICENSE.
    shape: <><path d="M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20m18-13 2 .5-2 .5M10 18v3m4-3.25V21M7 18a6 6 0 0 0 3.84-10.61"/></>,
  },
  gore: {
    id: "whale",
    // SVG Repo Animals 24, CC0: https://www.svgrepo.com/svg/232106/whale
    viewBox: "0 0 512 512",
    filled: true,
    shape: <><path d="M113.54,241.604c-1.078-49.502-47.607-88.814-99.167-77.249c-6.168,1.383-10.985,6.2-12.368,12.368 c-6.139,27.375,2.017,55.54,21.82,75.344c2.71,2.71,5.584,5.188,8.584,7.455c-3.001,2.268-5.872,4.752-8.584,7.463 c-19.802,19.802-27.959,47.969-21.82,75.343c1.383,6.168,6.2,10.986,12.368,12.368c32.611,7.314,63.269-5.75,81.638-28.903 c19.784,37.994,55.306,67.943,96.907,86.054c74.853-29.739,137.213-91.062,143.227-170.243H113.54z"/><path d="M495.66,241.604H368.905c-5.052,80.573-59.043,146.548-130.303,184.962C375.692,456.533,512,373.949,512,257.943 C512,248.918,504.684,241.604,495.66,241.604z M439.056,310.907c-11.938,0-21.615-9.677-21.615-21.615s9.677-21.615,21.615-21.615 s21.615,9.677,21.615,21.615S450.994,310.907,439.056,310.907z"/><path d="M318.671,79.249c-21.716,0-39.384,17.667-39.384,39.384v79.49c0,9.024,7.316,16.34,16.34,16.34 c9.024,0,16.34-7.316,16.34-16.34v-79.49c0-3.697,3.008-6.705,6.705-6.705c3.698,0,6.706,3.009,6.706,6.705v18.204 c0,9.024,7.316,16.34,16.34,16.34s16.34-7.316,16.34-16.34v-18.204C358.056,96.915,340.389,79.249,318.671,79.249z"/><path d="M229.753,101.135c-21.716,0-39.384,17.667-39.384,39.384v18.204c0,9.024,7.316,16.34,16.34,16.34s16.34-7.316,16.34-16.34 v-18.204c0-3.697,3.008-6.705,6.705-6.705c3.698,0,6.706,3.009,6.706,6.705v57.604c0,9.024,7.316,16.34,16.34,16.34 s16.34-7.316,16.34-16.34v-57.604C269.138,118.802,251.471,101.135,229.753,101.135z"/></>,
  },
  sinabro: {
    id: "pen",
    // Phosphor Pen Nib, MIT: brand-icons.LICENSE
    viewBox: "0 0 256 256",
    filled: true,
    shape: <><path d="M248,92.68a15.86,15.86,0,0,0-4.69-11.31L174.63,12.68a16,16,0,0,0-22.63,0L123.57,41.11l-58,21.77A16.06,16.06,0,0,0,55.35,75.23L32.11,214.68A8,8,0,0,0,40,224a8.4,8.4,0,0,0,1.32-.11l139.44-23.24a16,16,0,0,0,12.35-10.17l21.77-58L243.31,104A15.87,15.87,0,0,0,248,92.68Zm-69.87,92.19L63.32,204l47.37-47.37a28,28,0,1,0-11.32-11.32L52,192.7,71.13,77.86,126,57.29,198.7,130ZM112,132a12,12,0,1,1,12,12A12,12,0,0,1,112,132Zm96-15.32L139.31,48l24-24L232,92.68Z"/></>,
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
    <svg width={size} height={size} viewBox={mark.viewBox || "0 0 24 24"} fill={mark.filled ? "currentColor" : "none"}
      stroke={mark.filled ? "none" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      data-brand-icon={mark.id} aria-hidden="true" focusable="false"
      style={{ flexShrink: 0, ...style }}>
      {mark.shape}
    </svg>
  );
}
