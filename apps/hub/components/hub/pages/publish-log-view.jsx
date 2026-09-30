"use client";

import React from 'react';
import { Button, LifecycleBadge, SegmentedControl } from '../hub-primitives';
import { LOG_FILTERS } from '@/lib/content-publish-log';
import { formatKstShort } from '@/lib/content-schedule';
import './content-publish-log.css';

// 상태 → 라이프사이클 아이콘. 색이 아니라 모양·글로 말한다(§5.3). 빨강은 '놓침'뿐이고 예산(3)을 넘으면 개수로 접는다.
const LIFECYCLE = {
  scheduled: { state: 'waiting', label: '예약됨' }, due: { state: 'active', label: '올릴 차례' },
  missed: { state: 'blocked', label: '놓침' }, published: { state: 'done', label: '발행됨' }, cancelled: { state: 'cancelled', label: '예약 해제' },
};
const CHANNELS = { threads: 'Threads', instagram: 'Instagram', youtube_shorts: 'YouTube Shorts', reels: 'Reels', blog: '블로그', x: 'X', email: '뉴스레터' };
const METHOD = { notify: '알림', manual: '수동' };
const RED_BUDGET = 3;
const num = (value) => (value == null ? '—' : Number(value).toLocaleString('ko-KR'));
export const channelName = (value) => CHANNELS[value] || value || '';

function MetricsLine({ metrics }) {
  if (!metrics) return <span className="pl-muted">성과 미기록</span>;
  return <span className="pl-metrics">조회 <b className="num">{num(metrics.views)}</b> · 공유 <b className="num">{num(metrics.shares)}</b> · 답글 <b className="num">{num(metrics.replies)}</b></span>;
}

export function PublishLogWeek({ week, selectedId, onSelect }) {
  return (
    <ol className="pl-week" aria-label="이번 주 발행 일정">
      {week.map((day) => (
        <li key={day.key} className="pl-day" data-today={day.isToday ? 'true' : undefined} data-future={day.isFuture ? 'true' : undefined} aria-current={day.isToday ? 'date' : undefined}>
          <span className="pl-day-head">{day.label} <span className="num">{day.dayOfMonth}</span></span>
          <div className="pl-day-items">
            {day.items.map((row) => (
              <button key={row.variantId} type="button" className="pl-chip" data-state={row.state} aria-pressed={selectedId === row.variantId}
                aria-label={`${row.title || '제목 없음'} · ${LIFECYCLE[row.state].label} · ${formatKstShort(row.at)}`} onClick={() => onSelect(row.variantId)}>
                <span className="mono">{formatKstShort(row.at).slice(-5)}</span> {LIFECYCLE[row.state].label}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PublishLogList({ rows, selectedId, onSelect }) {
  const missed = rows.filter((row) => row.state === 'missed').length;
  const compactRed = missed > RED_BUDGET;
  return (
    <ul className="pl-list">
      {rows.map((row) => {
        const rowState = row.state === 'missed' && compactRed ? 'neutral' : row.state;
        const selected = selectedId === row.variantId;
        const activate = () => onSelect(row.variantId);
        return (
          <li key={row.variantId} className="pl-row hub-row" data-state={rowState} data-selected={selected ? 'true' : undefined} role="button" tabIndex={0} aria-pressed={selected}
            onClick={activate} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } }}>
            <span className="mono pl-time">{formatKstShort(row.at)}</span>
            <span className="pl-title">{row.title || '제목 없음'}<span className="pl-sub">{channelName(row.channel)}{row.lateMinutes ? ` · ${Math.round(row.lateMinutes / 60)}시간 늦게 올림` : ''}</span></span>
            <span className="pl-method">{METHOD[row.method]}</span>
            <LifecycleBadge state={LIFECYCLE[row.state].state} label={LIFECYCLE[row.state].label} />
            <span className="pl-metrics-cell">{row.state === 'published' ? <MetricsLine metrics={row.metrics} /> : null}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function PublishLogDetail({ row, onOpenDraft, onOpenPerformance }) {
  if (!row) return <aside className="pl-detail" aria-label="선택한 글의 이력"><p className="pl-muted">글을 고르면 이력이 여기에 나옵니다.</p></aside>;
  return (
    <aside className="pl-detail" aria-label="선택한 글의 이력">
      <span className="pl-eyebrow">이력</span>
      <h3 className="pl-detail-title">{row.title || '제목 없음'}</h3>
      <p className="pl-sub">{channelName(row.channel)} · {METHOD[row.method]} · <LifecycleBadge state={LIFECYCLE[row.state].state} label={LIFECYCLE[row.state].label} /></p>
      {row.url && <a className="pl-url mono" href={row.url} target="_blank" rel="noopener noreferrer">{row.url.replace(/^https?:\/\//, '')}</a>}
      {row.state === 'published' && <p className="pl-detail-metrics"><MetricsLine metrics={row.metrics} /></p>}
      <ol className="pl-events">
        {row.events.map((event, index) => (
          <li key={`${event.kind}-${index}`} data-kind={event.kind}><span className="mono pl-event-time">{formatKstShort(new Date(event.atMs).toISOString())}</span><span>{event.label}</span></li>
        ))}
        {row.state === 'scheduled' || row.state === 'due' ? <li data-kind="next" className="pl-muted"><span className="mono pl-event-time">{formatKstShort(row.at)}</span><span>{row.state === 'due' ? '올릴 차례 — 올린 뒤 발행했음을 기록하세요' : '올릴 시각 · 알림'}</span></li> : null}
      </ol>
      <div className="pl-detail-actions">
        {row.contentId && <Button size="xs" variant="outline" onClick={() => onOpenDraft(row)}>원고 열기</Button>}
        {row.state === 'published' && <Button size="xs" variant="outline" onClick={onOpenPerformance}>{row.metrics ? '성과에서 수정' : '성과 기록'}</Button>}
      </div>
    </aside>
  );
}

export function PublishLogView({ rows, allRows, counts, filter, onFilter, week, selectedId, onSelect, onOpenDraft, onOpenPerformance }) {
  const selected = allRows.find((row) => row.variantId === selectedId) || null;
  const options = LOG_FILTERS.map(({ key, label }) => ({ key, label: `${label} ${counts[key] ?? 0}` }));
  return (
    <>
      <div className="pl-toolbar"><SegmentedControl label="발행 로그 보기" options={options} value={filter} onChange={onFilter} /></div>
      <PublishLogWeek week={week} selectedId={selectedId} onSelect={onSelect} />
      <div className="pl-split">
        <div className="pl-main">
          {rows.length ? <PublishLogList rows={rows} selectedId={selectedId} onSelect={onSelect} /> : <p className="pl-muted pl-empty">이 조건의 기록이 없습니다.</p>}
        </div>
        <PublishLogDetail row={selected} onOpenDraft={onOpenDraft} onOpenPerformance={onOpenPerformance} />
      </div>
    </>
  );
}
