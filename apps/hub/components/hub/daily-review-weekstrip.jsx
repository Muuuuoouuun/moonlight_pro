"use client";

import React from 'react';

// 이번 주 월~금 5칸 — cue·페이지 헤더·리뷰 팝업 푸터가 같이 쓴다. 채움(기록)·테두리(빈 근무일)·
// 점선(오늘)·흐림(아직)으로 말하고 색은 쓰지 않는다(캘린더 셀과 같은 문법, §5.3).
// 팝업(daily-review-composer)이 cue 모듈을 부르면 provider와 순환하므로 별도 파일로 둔다.
const WEEKDAY_SHORT = ['월', '화', '수', '목', '금'];
const DAY_STATE_TEXT = { recorded: '기록함', missed: '비어 있음', today: '오늘', future: '아직' };

// 월~금 5칸 — 채움(기록)·테두리(빈 근무일)·점선(오늘)·흐림(아직). 캘린더 셀과 같은 문법.
export function ReviewWeekStrip({ week }) {
  if (!week) return null;
  const label = week.days.map((day, index) => `${WEEKDAY_SHORT[index]} ${DAY_STATE_TEXT[day.state]}`).join(', ');
  return <span className="daily-review-weekstrip" role="img" aria-label={`이번 주 ${week.recorded}/${week.workdays}일 기록 — ${label}`}>
    {week.days.map((day, index) => <span key={day.date} className="daily-review-weekstrip-day" data-state={day.state}>
      <span className="daily-review-day-mark" aria-hidden="true" />
      <span aria-hidden="true">{WEEKDAY_SHORT[index]}</span>
    </span>)}
  </span>;
}

