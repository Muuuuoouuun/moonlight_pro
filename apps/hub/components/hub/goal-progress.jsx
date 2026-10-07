"use client";
import React from 'react';
import { FLOOR_SCORE, floorPaceScore, formatPaceNumber } from '@/lib/goal-concepts';
import './goal-progress.css';
const formatScore = score => score === null ? '—' : score.toFixed(2);

export function WeekCells({ cells, unit, label }) {
  return <ol className="goal-weeks" aria-label={label} tabIndex={cells.length > 6 ? 0 : undefined}>{cells.map(cell => {
    const full = cell.done !== null && cell.quota && cell.done >= cell.quota;
    const fill = cell.done !== null && cell.quota ? Math.max(0, Math.min(100, (cell.done / cell.quota) * 100)) : 0;
    const text = cell.done === null ? `·/≈${formatPaceNumber(cell.quota)}` : `${formatPaceNumber(cell.done)}/≈${formatPaceNumber(cell.quota)}`;
    return <li key={cell.start} className={`goal-weeks__cell goal-weeks__cell--${cell.phase}${full ? ' goal-weeks__cell--full' : ''}`} aria-label={`${cell.label} 주 ${cell.done === null ? '주별 실적 미측정' : `관측 차이 ${formatPaceNumber(cell.done)}${unit || ''}`} · 기간 안 ${cell.days}일의 균등 페이스 몫 약 ${formatPaceNumber(cell.quota)}${unit || ''}${cell.phase === 'now' ? ' · 이번 주' : ''}`}>
      <span className="goal-weeks__box"><i style={{ width: `${fill}%` }} /><b className="mono">{text}</b></span>
      <span className="mono goal-weeks__label">{cell.phase === 'now' ? `${cell.label} 이번 주` : cell.label}</span>
    </li>;
  })}</ol>;
}

export function ObjectiveTrack({ score, period }) {
  const pace = floorPaceScore(period);
  const scorePct = score === null ? 0 : Math.min(100, score * 100);
  return <div className="goal-otrack-wrap">
    <div className="goal-otrack" role="meter" aria-label="진행 점수" aria-valuemin={0} aria-valuemax={1} aria-valuenow={score === null ? undefined : score} aria-valuetext={score === null ? '점수 없음' : `${formatScore(score)} · 바닥 0.7 · 천장 미등록${pace !== null ? `, 바닥 페이스 ${formatScore(pace)}` : ''}`}>
      {pace !== null && <span className="goal-otrack__pace" style={{ width: `${pace * 100}%` }} />}
      {score !== null && <span className="goal-otrack__fill" style={{ width: `${scorePct}%` }} />}
      <i className="goal-otrack__tick" style={{ left: `${FLOOR_SCORE * 100}%` }} aria-hidden="true" />
    </div>
    <div className="goal-otrack__scale mono" aria-hidden="true"><span style={{ left: 0 }}>0</span>{pace !== null && pace > 0.08 && pace < 0.6 && <span style={{ left: `${pace * 100}%`, transform: 'translateX(-50%)' }}>지금쯤 {formatScore(pace)}</span>}<span style={{ left: `${FLOOR_SCORE * 100}%`, transform: 'translateX(-50%)' }}>0.7 바닥</span><span style={{ right: 0 }}>1.0</span></div>
  </div>;
}
