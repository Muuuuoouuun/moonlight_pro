"use client";

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { GoalLinks } from '../goal-links';
import { Button, EmptyState, IconButton, TextField, TruthBadge } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { isDailyReviewDate } from '@/lib/daily-review';
import { DailyReviewComposer, ENERGY_LABELS, progressLabel } from './daily-review-composer';
import { todayIn, useDailyReview } from './use-daily-review';
import './daily-review.css';

function moveDay(date, offset) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  const next = value.toISOString().slice(0, 10);
  return isDailyReviewDate(next) ? next : date;
}

export function DailyReview() {
  const params = useSearchParams();
  const requestedDate = params.get('date');
  const model = useDailyReview();
  const { date, timezone, draft, review, entries, source, busy, dirty, message, chooseDate } = model;
  const [composerOpen, setComposerOpen] = React.useState(false);
  const closeComposer = React.useCallback(() => setComposerOpen(false), []);
  const openReview = (nextDate = date) => { chooseDate(nextDate); setComposerOpen(true); };
  const isToday = date === todayIn(timezone);
  const savedText = review?.note || review?.focus;
  const actionLabel = dirty ? '이어서 쓰기' : review ? '기록 수정' : '기록 남기기';
  const consumedDate = React.useRef(null);
  React.useEffect(() => {
    if (isDailyReviewDate(requestedDate) && consumedDate.current !== requestedDate && !busy) {
      consumedDate.current = requestedDate;
      chooseDate(requestedDate);
    }
  }, [requestedDate, chooseDate, busy]);

  return <div className="daily-review-page">
    <header className="daily-review-header">
      <div><h2>하루 리뷰</h2><p>오늘의 느낌을 짧게 남겨요.</p></div>
      <span className="daily-review-personal">개인 기록</span>
    </header>
    <div className="daily-review-toolbar">
      <div className="daily-review-date-controls">
        <IconButton icon="chevronL" size={36} tooltip="이전 날" disabled={busy} onClick={() => chooseDate(moveDay(date, -1))} />
        <TextField id="daily-review-date" label="리뷰 날짜" type="date" value={date} disabled={busy} onChange={(event) => chooseDate(event.target.value)} />
        <IconButton icon="chevronR" size={36} tooltip="다음 날" disabled={busy} onClick={() => chooseDate(moveDay(date, 1))} />
        <Button disabled={busy || isToday} onClick={() => chooseDate(todayIn(timezone))}>오늘</Button>
      </div>
      <span className="daily-review-timezone">{review?.timezone || timezone} 기준</span>
    </div>

    <section className="daily-review-capture" aria-label="선택한 날의 리뷰" aria-busy={source === 'loading'}>
      <div className="daily-review-capture-copy">
        <span className="daily-review-eyebrow">{isToday ? '오늘의 기록' : `${date.slice(5).replace('-', '.')} 기록`}</span>
        <h3>{source === 'loading' ? '기록을 확인하고 있어요' : dirty ? '쓰던 이야기가 있어요' : review ? '이날 남긴 한 조각' : '어떤 하루였나요?'}</h3>
        <p className="daily-review-preview">{source === 'loading' ? '잠시만 기다려 주세요.' : dirty ? draft.note || draft.focus || '작성 중인 내용이 임시 보관되어 있어요.' : savedText || (review ? '남겨둔 기록을 다시 열어볼 수 있어요.' : '에너지 하나만 골라도 충분해요.')}</p>
        {source === 'live' && review?.energy != null && <span className="daily-review-saved-energy"><Iconed name="signal" size={13} />{review.energy} · {ENERGY_LABELS[review.energy - 1]}</span>}
      </div>
      <Button className="daily-review-open" variant="primary" size="md" icon={review ? 'edit' : 'plus'} disabled={busy} onClick={() => openReview()}>{actionLabel}</Button>
    </section>

    <div className="daily-review-page-feedback" role="status">
      {model.saveState === 'saved' && <Iconed name="check" size={14} />}
      <span>{composerOpen ? '' : message || (dirty ? '작성 중인 내용은 이 창에 임시 보관돼요.' : '')}</span>
    </div>
    <div className="daily-review-source" aria-live="polite">
      <TruthBadge state={source} label={source === 'live' ? '저장소 연결됨' : undefined} />
      {(source === 'error' || source === 'preview') && <><span>{model.loadMessage}</span><Button variant="outline" onClick={model.refresh}>다시 불러오기</Button></>}
    </div>
    {source === 'live' && review && <GoalLinks entityType="journal_entries" entityId={review.id} scope="personal" />}

    <section className="daily-review-history" aria-label="날짜별 기록">
      <div className="daily-review-history-heading"><h3>날짜별 기록</h3><TextField id="daily-review-month" label="조회 월" type="month" value={date.slice(0, 7)} disabled={busy} onChange={(event) => chooseDate(`${event.target.value}-01`)} /></div>
      {source === 'loading' ? <p className="daily-review-history-message">기록을 불러오는 중…</p> : source !== 'live' ? <p className="daily-review-history-message">연결되면 저장한 기록을 볼 수 있어요.</p> : entries.length === 0 ? <EmptyState title="첫 하루를 남겨보세요" description="차곡차곡 쌓인 기록을 여기서 다시 볼 수 있어요." /> : <ul>
        {entries.map((entry) => <li key={entry.reviewDate}><button className="hub-row" type="button" disabled={busy} aria-label={`${entry.reviewDate} 기록 열기`} aria-current={entry.reviewDate === date ? 'date' : undefined} onClick={() => openReview(entry.reviewDate)}>
          <span className="daily-review-history-date">{entry.reviewDate.slice(5).replace('-', '.')}</span>
          <span className="daily-review-history-content"><span className="daily-review-history-note">{entry.note || entry.excerpt || entry.focus || '하루 기록'}</span><span className="daily-review-history-meta">{entry.energy == null ? '에너지 미입력' : `에너지 ${entry.energy}`}{entry.progress !== null && entry.progress !== undefined && ` · ${progressLabel(entry.progress)}`}</span></span>
          <Iconed name="chevronR" size={14} />
        </button></li>)}
      </ul>}
    </section>
    {composerOpen && <DailyReviewComposer key={date} model={model} onClose={closeComposer} />}
  </div>;
}
