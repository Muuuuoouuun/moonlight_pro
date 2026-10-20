'use client';

import React from 'react';
import { Button, EmptyState, Skeleton } from './hub-primitives';
import { calendarEventWhenLabel } from '@/lib/calendar-event-view';
import './calendar-agenda.css';

// Segments are the same day-overlap projection as Day/Week. Sorting a copy keeps
// provider order, original identifiers, timestamps, and write capability intact.
export function orderedAgendaEvents(events) {
  return [...(Array.isArray(events) ? events : [])].sort((a, b) =>
    Number(Boolean(b.allDay)) - Number(Boolean(a.allDay))
    || a.start - b.start
    || String(a.segmentKey).localeCompare(String(b.segmentKey)));
}

export function CalendarAgenda({ events, tasks, calendarState, taskState, onSelectEvent, onNavigate, onRetry }) {
  const rows = orderedAgendaEvents(events);
  const taskRows = Array.isArray(tasks) ? tasks : [];
  const complete = calendarState === 'live';
  return (
    <div className="calendar-agenda">
      <section aria-label="선택한 날짜의 일정 목록">
        <div className="calendar-agenda__heading"><h3>일정 목록</h3>{rows.length > 0 && <span>{complete ? '' : '확인한 '}일정 {rows.length}건</span>}</div>
        {rows.length > 0 ? (
          <ul className="calendar-agenda__list">
            {rows.map(event => (
              <li key={event.segmentKey}>
                <button type="button" className="calendar-agenda__event hub-row"
                  aria-label={`일정 기록: ${event.title} · ${calendarEventWhenLabel(event)}`}
                  onClick={() => onSelectEvent(event)}>
                  <span className="calendar-agenda__time mono">{calendarEventWhenLabel(event)}</span>
                  <span className="calendar-agenda__title">{event.title}{event.sourceLabel && <small>{event.sourceLabel}</small>}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : calendarState === 'loading' ? <Skeleton lines={5} label="일정 목록 확인 중" /> : (
          <EmptyState icon="calendar"
            title={complete ? '선택한 날짜에 일정이 없습니다' : calendarState === 'partial' ? '이 날짜의 일정을 모두 확인하지 못했습니다' : calendarState === 'error' ? '일정 목록을 읽지 못했습니다' : '캘린더 연결 후 일정을 표시합니다'}
            description={complete ? '다른 날짜는 위의 이전·다음 버튼으로 확인하세요.' : calendarState === 'preview' ? '연결 상태는 위에서 확인할 수 있습니다.' : '비어 보여도 실제 일정이 있을 수 있습니다. 다시 불러와 확인하세요.'}
            action={calendarState === 'partial' ? <Button variant="outline" size="sm" onClick={onRetry}>일정 다시 불러오기</Button> : undefined}
          />
        )}
      </section>
      <section aria-label="선택한 날짜의 할 일">
        <div className="calendar-agenda__heading"><h3>할 일</h3>{taskRows.length > 0 && <span>{taskState === 'live' ? '' : '확인한 '}할 일 {taskRows.length}건</span>}</div>
        {taskRows.length > 0 ? (
          <ul className="calendar-agenda__list">
            {taskRows.map(task => <li key={task.id}><button type="button" className="calendar-agenda__task hub-row" onClick={() => onNavigate?.(`dashboard/work/my?task=${encodeURIComponent(task.id)}`)} aria-label={`할 일 열기: ${task.title}`}>{task.title}</button></li>)}
          </ul>
        ) : taskState === 'loading' ? <Skeleton lines={2} label="할 일 확인 중" /> : (
          <p className="calendar-agenda__note">{taskState === 'live' ? '이 날짜에 표시할 할 일이 없습니다.' : '할 일 목록을 모두 확인하지 못했습니다.'}</p>
        )}
      </section>
    </div>
  );
}
