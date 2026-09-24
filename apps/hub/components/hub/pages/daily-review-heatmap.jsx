"use client";

import React from 'react';
import { Skeleton, TruthBadge } from '../hub-primitives';
import { activitySummary, buildActivityWeeks, missingText } from '@/lib/review-activity';

// 활동 흐름 — GitHub 기여 그래프를 응용한 최근 16주 잔디(2026-09-23 지속 루프 설계 §12).
// 열 = 주, 행 = 월~일. 칸이 진할수록 그날 한 일(완료 할 일·연락·메모·리뷰)이 많다.
// 색은 포그라운드 명도 한 계열(초록·카테고리 색 없음, §4·§5.3), 숫자는 상세 줄과 aria-label이 직접 말한다.
// onMouseEnter는 스타일이 아니라 하단 상세 줄(어느 날·무엇을)을 바꾸는 데만 쓴다 — hover 모양은 CSS가 소유한다(§8.1).
// 키보드: 칸 하나만 탭 정지(roving tabindex), 방향키로 이동, Enter로 그날 리뷰 열기.
const ROW_LABELS = ['월', '', '수', '', '금', '', ''];
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

function dateText(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 ${WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]}요일`;
}

// 모바일(≤600px)에서는 칸을 버튼이 아닌 표시 전용으로 그린다 — §11의 44px 터치 플로어가 칸을 부풀리고,
// 그 플로어의 예외는 체크박스뿐이다. 날짜를 여는 동작은 바로 아래 달력의 44px 칸이 맡는다.
function useCompact() {
  const [compact, setCompact] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return compact;
}

export function ActivityHeatmap({ activity, todayKey, loading, onPick }) {
  const compact = useCompact();
  const grid = React.useMemo(() => buildActivityWeeks(activity, todayKey), [activity, todayKey]);
  const summary = React.useMemo(() => activitySummary(activity, todayKey), [activity, todayKey]);
  const [focus, setFocus] = React.useState(null); // { week, day }
  const cellRefs = React.useRef(new Map());
  const scrollRef = React.useRef(null);
  // 좁은 화면에서 가로로 넘치면 최근 주(오른쪽 끝)부터 보이게 한다 — GitHub와 같은 기본 위치.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [grid]);
  const todayPos = React.useMemo(() => {
    if (!grid) return null;
    for (let week = grid.weeks.length - 1; week >= 0; week -= 1) {
      const day = grid.weeks[week].days.findIndex((cell) => cell.date === todayKey);
      if (day >= 0) return { week, day };
    }
    return null;
  }, [grid, todayKey]);
  const active = focus || todayPos;
  const activeCell = grid && active ? grid.weeks[active.week]?.days[active.day] : null;

  if (loading) {
    return <section className="daily-review-heat" aria-busy="true"><div className="daily-review-heat-head"><h3>활동 흐름</h3></div><Skeleton lines={1} height={118} label="활동 흐름 불러오는 중" /></section>;
  }
  if (!grid) return null;

  function move(week, day) {
    const clampedWeek = Math.max(0, Math.min(grid.weeks.length - 1, week));
    const clampedDay = Math.max(0, Math.min(6, day));
    const cell = grid.weeks[clampedWeek].days[clampedDay];
    if (cell.future) return;
    setFocus({ week: clampedWeek, day: clampedDay });
    cellRefs.current.get(cell.date)?.focus();
  }

  function onKeyDown(event, week, day) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    move(week + delta[0], day + delta[1]);
  }

  return <section className="daily-review-heat" aria-label="활동 흐름, 최근 16주">
    <div className="daily-review-heat-head">
      <h3>활동 흐름</h3>
      <span className="daily-review-heat-sub">최근 16주 · 활동한 날 <span className="num">{grid.active}</span>일</span>
      {activity.missing?.length > 0 && <TruthBadge state="partial" reason={`${missingText(activity.missing)} 못 읽음`} />}
    </div>
    <div className="daily-review-heat-layout">
    <div className="daily-review-heat-body">
      <div className="daily-review-heat-rows" aria-hidden="true">
        <span />
        {ROW_LABELS.map((label, index) => <span key={index}>{label}</span>)}
      </div>
      <div className="daily-review-heat-scroll" ref={scrollRef}>
        <div className="daily-review-heat-grid" role="group" aria-label="날짜별 활동량 — 방향키로 이동, Enter로 그날 리뷰 열기">
          {grid.weeks.map((week, weekIndex) => <div key={week.start} className="daily-review-heat-col">
            <span className="daily-review-heat-month" aria-hidden="true">{week.label}</span>
            {week.days.map((cell, dayIndex) => {
              const isActive = active && active.week === weekIndex && active.day === dayIndex;
              const common = {
                className: 'daily-review-heat-cell', 'data-level': cell.level ?? undefined,
                'data-today': cell.date === todayKey || undefined, 'data-active': isActive || undefined,
              };
              if (compact) {
                return <span key={cell.date} {...common} data-future={cell.future || undefined} role="img" aria-label={`${dateText(cell.date)} · ${cell.detail}`} />;
              }
              return <button key={cell.date} type="button" {...common}
                ref={(node) => { if (node) cellRefs.current.set(cell.date, node); else cellRefs.current.delete(cell.date); }}
                disabled={cell.future} tabIndex={isActive ? 0 : -1}
                aria-label={`${dateText(cell.date)} · ${cell.detail}`}
                onMouseEnter={() => !cell.future && setFocus({ week: weekIndex, day: dayIndex })}
                onFocus={() => setFocus({ week: weekIndex, day: dayIndex })}
                onKeyDown={(event) => onKeyDown(event, weekIndex, dayIndex)}
                onClick={() => onPick(cell.date)} />;
            })}
          </div>)}
        </div>
      </div>
    </div>
    {summary && <dl className="daily-review-heat-summary">
      <div><dt>이번 달 활동한 날</dt><dd><span className="num">{summary.thisMonth}</span>일{summary.lastMonth !== null && <span className="daily-review-heat-vs"> · 지난달 {summary.lastMonth}일</span>}</dd></div>
      <div><dt>최근 7일 활동</dt><dd><span className="num">{summary.last7}</span>건</dd></div>
      {summary.busiestWeekday && <div><dt>가장 활발한 요일</dt><dd>{summary.busiestWeekday}요일</dd></div>}
    </dl>}
    </div>
    <div className="daily-review-heat-foot">
      <span className="daily-review-heat-detail" aria-live="polite">
        {activeCell ? <><span className="mono">{activeCell.date.slice(5).replace('-', '.')}</span> {activeCell.detail}</> : null}
      </span>
      <span className="daily-review-heat-legend" aria-hidden="true">
        적음
        {[0, 1, 2, 3, 4].map((level) => <span key={level} className="daily-review-heat-cell" data-level={level} />)}
        많음
      </span>
    </div>
  </section>;
}
