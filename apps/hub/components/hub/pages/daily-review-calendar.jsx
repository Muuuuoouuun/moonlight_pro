"use client";

import React from 'react';
import { IconButton, Skeleton, Sparkline } from '../hub-primitives';
import { buildReviewMonth, shiftMonth } from '@/lib/daily-review-rhythm';
import { activityDetail, activityLevel, activityThresholds, dayTotal } from '@/lib/review-activity';
import { ENERGY_LABELS } from './daily-review-labels';

// 월 캘린더 — 어느 날을 남겼는지 한눈에(2026-09-23 지속 루프 설계 §4.5).
// 셀 상태는 색이 아니라 채움(●)·테두리(○)·없음(·)으로 말한다(StreakMark와 같은 문법, §5.3).
// 연속 일수·끊김 경고는 그리지 않는다. 오늘 테두리만 Moonstone — "현재 위치" accent 의미(§5.2).
// 칸 배경의 진하기는 그날 활동량(§12, 16주 잔디와 같은 척도) — 리뷰 마크와 별개 채널이다.
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const STATE_TEXT = { recorded: '기록함', missed: '기록 없음', rest: '쉬는 날', today: '오늘 · 아직 기록 없음', future: '아직 오지 않은 날', unknown: '기록 확인 전' };

function monthTitle(month) {
  return `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`;
}

function cellLabel(cell, activityText) {
  const [, m, d] = cell.date.split('-').map(Number);
  const weekday = WEEKDAYS[(new Date(`${cell.date}T00:00:00Z`).getUTCDay() + 6) % 7];
  const energy = cell.state === 'recorded' && cell.energy ? ` · 에너지 ${cell.energy} ${ENERGY_LABELS[cell.energy - 1]}` : '';
  return `${m}월 ${d}일 ${weekday}요일 · 리뷰 ${cell.today && cell.state === 'recorded' ? '오늘 · ' : ''}${STATE_TEXT[cell.state]}${energy}${activityText ? ` · ${activityText}` : ''}`;
}

// activity: 이 달을 덮는 활동 기록(16주 창 또는 그 달 따로 읽은 것), scale: 척도를 정할 16주 활동.
export function DailyReviewCalendar({ month, entries, todayKey, selectedDate, loading, disabled, onMonth, onPick, activity, scale }) {
  const grid = React.useMemo(() => buildReviewMonth(month, entries, todayKey), [month, entries, todayKey]);
  const thresholds = React.useMemo(() => activityThresholds(scale || activity), [scale, activity]);
  const covered = Boolean(activity && grid && activity.from <= `${month}-01` && activity.to >= (grid.cells.at(-1).date < todayKey ? grid.cells.at(-1).date : todayKey));
  if (!grid) return null;
  const canGoNext = !todayKey || shiftMonth(month, 1) <= todayKey.slice(0, 7);
  const energyDays = grid.energySeries.filter((value) => Number.isInteger(value));

  return <section className="daily-review-calendar" aria-label={`${monthTitle(month)} 기록 달력`}>
    <div className="daily-review-calendar-head">
      <IconButton icon="chevronL" size={32} tooltip="이전 달" disabled={disabled} onClick={() => onMonth(shiftMonth(month, -1))} />
      <h3>{monthTitle(month)}</h3>
      <IconButton icon="chevronR" size={32} tooltip="다음 달" disabled={disabled || !canGoNext} onClick={() => onMonth(shiftMonth(month, 1))} />
      {!loading && grid.known && <span className="daily-review-calendar-count">기록 <span className="num">{grid.recordedCount}</span>일</span>}
    </div>
    {loading ? <Skeleton lines={5} height={34} gap={6} label="달력 불러오는 중" /> : <>
      <div className="daily-review-calendar-grid">
        <div className="daily-review-calendar-row" aria-hidden="true">
          {WEEKDAYS.map((day) => <span key={day} className="daily-review-calendar-weekday">{day}</span>)}
        </div>
        <div className="daily-review-calendar-days">
          {Array.from({ length: grid.leading }, (_, index) => <span key={`pad-${index}`} aria-hidden="true" />)}
          {grid.cells.map((cell) => <button
            key={cell.date} type="button" className="daily-review-day"
            data-state={cell.state} data-today={cell.today || undefined}
            data-energy={cell.state === 'recorded' && cell.energy ? cell.energy : undefined}
            data-level={covered && cell.state !== 'future' ? activityLevel(dayTotal(activity.days[cell.date]), thresholds) : undefined}
            aria-current={cell.date === selectedDate ? 'date' : undefined}
            aria-label={cellLabel(cell, covered && cell.state !== 'future' ? activityDetail(activity.days[cell.date]) : '')} disabled={disabled || cell.state === 'future'}
            onClick={() => onPick(cell.date)}>
            <span className="mono">{cell.day}</span>
            <span className="daily-review-day-marks" aria-hidden="true"><span className="daily-review-day-mark" /></span>
          </button>)}
        </div>
      </div>
      {grid.known && <div className="daily-review-calendar-foot">
        <span className="daily-review-legend" aria-hidden="true">
          <span><span className="daily-review-day-mark" data-legend="recorded" />리뷰 · 높이 = 에너지</span>
          <span><span className="daily-review-day-mark" data-legend="missed" />리뷰 빈 근무일</span>
          {covered && <span><span className="daily-review-heat-cell" data-level={3} />칸 진하기 = 활동량</span>}
        </span>
        {energyDays.length > 1 && <span className="daily-review-energy-trend">
          <span>에너지 · 평균 <span className="num">{(energyDays.reduce((sum, value) => sum + value, 0) / energyDays.length).toFixed(1)}</span></span>
          {/* 기록한 날끼리만 잇는다 — 빈 날을 낮은 값으로 그리지 않는다. */}
          <Sparkline values={energyDays} width={96} height={18} min={1} max={5} label={`${monthTitle(month)} 기록한 ${energyDays.length}일의 에너지 추이`} />
        </span>}
      </div>}
    </>}
  </section>;
}
