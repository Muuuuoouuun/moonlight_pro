"use client";

import React from 'react';
import { Button, Card, EmptyState, Skeleton, TruthBadge } from '../hub-primitives';
import { CalendarOutcome } from '../calendar-outcome';
import { todayAgendaRows } from './workflow-reading';
import './workflow-pages.css';

export function TodayTimeFlow({ agenda = {}, onNavigate }) {
  const [now, setNow] = React.useState(() => new Date());
  const [expanded, setExpanded] = React.useState(false);
  const [visited, setVisited] = React.useState(false);
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  const state = ['live', 'partial', 'preview', 'error', 'loading'].includes(agenda.state) ? agenda.state : 'error';
  const readable = state === 'live' || state === 'partial';
  const rows = readable ? todayAgendaRows(agenda.items, now) : [];
  // Keep visited outcome editors mounted: collapsing must preserve pending saves,
  // conflicts and acknowledgements as well as the editor's existing note draft.
  const shown = visited ? rows : rows.slice(0, 3);
  const openCalendar = () => onNavigate?.('dashboard/work/calendar');
  return <Card pad={false} className="daily-brief__panel workflow-agenda" aria-label="오늘 일정">
    <div className="daily-brief__card-head workflow-agenda__head">
      <span>오늘 일정 · 시간 흐름</span>
      {state !== 'live' && <TruthBadge state={state} />}
      {state !== 'preview' && <Button variant="ghost" size="xs" onClick={openCalendar}>캘린더 열기</Button>}
    </div>
    {state === 'loading' ? <Skeleton lines={3} height={18} label="오늘 일정 불러오는 중" />
      : state === 'error' ? <p className="workflow-agenda__message" role="alert">캘린더를 읽지 못했습니다 — 일정이 있어도 표시되지 않습니다.</p>
      : state === 'preview' ? <EmptyState title="Google Calendar 미연결" description="연결 상태를 확인하면 오늘의 시간 흐름을 볼 수 있습니다." action={<Button variant="outline" size="xs" onClick={openCalendar}>Google Calendar 연결</Button>} />
      : <>
        {state === 'partial' && <p className="workflow-agenda__message" role="status">일부 일정만 확인했습니다. 캘린더에서 빠진 일정을 확인하세요.</p>}
        {rows.length ? <>
          <p className="workflow-agenda__message">시작 시각 기준 · KST · 완료 여부는 직접 기록합니다.</p>
          <ol className="workflow-agenda__list">{shown.map(({ event, index, label, next }, position) => <li key={event.outcomeKey || event.id || index} className="workflow-agenda__item" data-next={next || undefined} hidden={!expanded && position >= 3}>
            <span className="workflow-agenda__state">{label}</span>
            <CalendarOutcome eventKey={event.outcomeKey} title={event.title} whenLabel={event.whenLabel} />
          </li>)}</ol>
          {rows.length > 3 && <Button className="workflow-agenda__expand" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => { setVisited(true); setExpanded(value => !value); }}>{expanded ? '일정 접기' : `일정 ${rows.length - 3}건 더 보기`}</Button>}
        </> : <p className="workflow-agenda__message">{state === 'partial' ? '읽힌 일정이 없습니다. 오늘 일정이 없다고 확정할 수 없습니다.' : '오늘 예정된 일정이 없습니다.'}</p>}
      </>}
  </Card>;
}
