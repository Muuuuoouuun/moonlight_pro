import React from 'react';

// 에너지 1~5를 달 위상으로 — 점선 빈 달(지침) → 초승 → 반달 → 볼록 → 보름(활기). 운영자 선택 2026-09-25.
// 색이 아니라 밝은 면의 넓이가 값을 말한다(§5.3). 입력 표면(오늘·홈 원탭, 리뷰 팝업)에서만 쓴다.
// 오른쪽부터 차오른다: 바깥 오른쪽 반원 + 경계선(타원 호)의 볼록 방향으로 넓이를 정한다.
const LIT = {
  2: 'M8 1A7 7 0 0 1 8 15A4.6 7 0 0 0 8 1Z',
  3: 'M8 1A7 7 0 0 1 8 15Z',
  4: 'M8 1A7 7 0 0 1 8 15A4.6 7 0 0 1 8 1Z',
};

export function EnergyMoon({ level, size = 18, className }) {
  const value = Number.isInteger(level) && level >= 1 && level <= 5 ? level : 1;
  return <svg className={['energy-moon', className].filter(Boolean).join(' ')} data-level={value}
    width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    {value === 5
      ? <circle cx="8" cy="8" r="7" fill="currentColor" />
      : <>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1"
          strokeDasharray={value === 1 ? '1.6 2' : undefined} vectorEffect="non-scaling-stroke" />
        {LIT[value] && <path d={LIT[value]} fill="currentColor" />}
      </>}
  </svg>;
}
