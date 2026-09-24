"use client";

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { GoalLinks } from '../goal-links';
import { Button, EmptyState, Kbd, Skeleton, TextField, TruthBadge } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { isDailyReviewDate } from '@/lib/daily-review';
import { weekCompare } from '@/lib/daily-review-rhythm';
import { ReviewWeekStrip } from '../daily-review-cue';
import { useDailyReviewLauncher } from '../daily-review-provider';
import { DailyReviewCalendar } from './daily-review-calendar';
import { ActivityHeatmap } from './daily-review-heatmap';
import { energyText, progressLabel } from './daily-review-labels';
import './daily-review.css';

// 하루 리뷰 페이지 — 기록 행동(primary 1개) → 이번 주 k/5 → 월 캘린더 → 선택한 날 → 날짜별 목록
// (2026-09-23 지속 루프 설계 §4.5). model·팝업은 셸의 DailyReviewProvider가 소유한다.
function shortDate(date) {
  return date.slice(5).replace('-', '.');
}

// 이번 주 k/5 + 월~금 5칸 + 지난주 한 줄. 지난주보다 적어도 경고하지 않는다 — 방향만 말한다.
function WeekLine({ compare }) {
  if (!compare) return <p>에너지 하나만 남겨도 그날은 기록한 날이에요.</p>;
  const { thisWeek, lastWeek } = compare;
  const reached = thisWeek.recorded >= thisWeek.target;
  const energy = thisWeek.energyAvg !== null ? ` · 평균 에너지 ${thisWeek.energyAvg.toFixed(1)}` : '';
  const last = lastWeek ? `지난주 ${lastWeek.recorded}/${lastWeek.workdays}일${lastWeek.energyAvg !== null ? ` · 에너지 ${lastWeek.energyAvg.toFixed(1)}` : ''}` : '';
  return <div className="daily-review-weekline">
    <p className="daily-review-week" aria-label={`이번 주 근무일 ${thisWeek.workdays}일 중 ${thisWeek.recorded}일 기록, 목표 ${thisWeek.target}일${energy}`}>
      {reached && <Iconed name="check" size={13} />}
      이번 주 <span className="num">{thisWeek.recorded}</span>/{thisWeek.workdays}일 기록
      <span className="daily-review-week-target">{reached ? ` · 목표 ${thisWeek.target}일 달성` : ` · 목표 ${thisWeek.target}일`}{energy}</span>
      {thisWeek.weekend > 0 && <span className="daily-review-week-target"> · 주말 {thisWeek.weekend}일</span>}
    </p>
    <ReviewWeekStrip week={thisWeek} />
    {last && <p className="daily-review-week-last">{last}</p>}
  </div>;
}

export function DailyReview() {
  const params = useSearchParams();
  const requestedDate = params.get('date');
  const { model, open, openReview } = useDailyReviewLauncher();
  const { date, draft, review, entries, recent, todayKey, source, busy, dirty, chooseDate, activity, monthActivity } = model;
  const isToday = date === todayKey;
  const todayRecorded = Array.isArray(recent) && recent.some((entry) => entry.reviewDate === todayKey);
  const compare = source === 'live' ? weekCompare(todayKey, recent) : null;
  const consumedDate = React.useRef(null);
  React.useEffect(() => {
    if (isDailyReviewDate(requestedDate) && consumedDate.current !== requestedDate && !busy) {
      consumedDate.current = requestedDate;
      chooseDate(requestedDate);
    }
  }, [requestedDate, chooseDate, busy]);

  // 페이지 레벨 N — 오늘 기록 열기(§8.1 생성 단축키 조건: 팝업 닫힘 + 입력 필드 밖).
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'n' && event.key !== 'N') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || open) return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      event.preventDefault();
      openReview(todayKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openReview, todayKey]);

  // 달을 옮기면 그 달에 오늘이 있으면 오늘, 아니면 1일을 고른다 — 서버가 그 달 목록을 함께 준다.
  const moveMonth = (month) => {
    if (!month) return;
    chooseDate(todayKey && todayKey.startsWith(month) ? todayKey : `${month}-01`);
  };
  const savedText = review?.note || review?.focus;
  const selectedHeading = source === 'loading' ? '기록을 확인하고 있어요'
    : dirty ? '쓰던 이야기가 있어요' : review ? '이날 남긴 한 조각' : isToday ? '어떤 하루였나요?' : '이날은 비어 있어요';

  return <div className="daily-review-page">
    <header className="daily-review-header">
      <div>
        <h2>하루 리뷰</h2>
        <WeekLine compare={compare} />
      </div>
      {/* 기록 전에는 이 화면의 유일한 primary, 기록 뒤에는 outline으로 내려 앉는다 — 할 일이 끝났다는 신호(§5.2). */}
      <Button className="daily-review-open" variant={todayRecorded ? 'outline' : 'primary'} size="md" icon={todayRecorded ? 'check' : 'plus'} disabled={busy && source !== 'loading'} onClick={() => openReview(todayKey)}>
        {todayRecorded ? '오늘 기록함 · 수정' : '오늘 기록 남기기'}<Kbd>N</Kbd>
      </Button>
    </header>

    {(source === 'error' || source === 'preview') && <div className="daily-review-source" role="status">
      <TruthBadge state={source} />
      <span>{model.loadMessage}</span>
      <Button variant="outline" onClick={model.refresh}>다시 불러오기</Button>
    </div>}

    {(source === 'live' || source === 'loading') && <ActivityHeatmap activity={activity} todayKey={todayKey} loading={source === 'loading'} onPick={openReview} />}

    <DailyReviewCalendar
      month={date.slice(0, 7)} entries={source === 'live' ? entries : null} todayKey={todayKey}
      selectedDate={date} loading={source === 'loading'} disabled={busy}
      activity={source === 'live' ? (monthActivity || activity) : null} scale={source === 'live' ? activity : null}
      onMonth={moveMonth} onPick={openReview} />

    {!isToday && <section className="daily-review-capture" aria-label="선택한 날의 리뷰" aria-busy={source === 'loading'}>
      <div className="daily-review-capture-copy">
        <span className="daily-review-eyebrow mono">{shortDate(date)}</span>
        <h3>{selectedHeading}</h3>
        {source === 'loading' ? <Skeleton lines={2} height={13} label="기록 불러오는 중" />
          : <p className="daily-review-preview">{dirty ? draft.note || draft.focus || '작성 중인 내용이 임시 보관되어 있어요.' : savedText || (review ? energyText(review.energy) : '지금 남겨도 늦지 않아요.')}</p>}
      </div>
      <Button variant="outline" size="md" icon={review ? 'edit' : 'plus'} disabled={busy} onClick={() => openReview(date)}>{dirty ? '이어서 쓰기' : review ? '기록 수정' : '이날 남기기'}</Button>
    </section>}

    <div className="daily-review-page-feedback" role="status">
      {model.saveState === 'saved' && <Iconed name="check" size={14} />}
      <span>{open ? '' : model.message || (dirty ? '작성 중인 내용은 이 창에 임시 보관돼요.' : '')}</span>
    </div>
    {source === 'live' && review && <GoalLinks entityType="journal_entries" entityId={review.id} scope="personal" />}

    <section className="daily-review-history" aria-label="날짜별 기록">
      <div className="daily-review-history-heading">
        <h3>날짜별 기록</h3>
        <details className="daily-review-jump">
          <summary>날짜로 찾기</summary>
          <TextField id="daily-review-date" label="리뷰 날짜" type="date" value={date} max={todayKey || undefined} disabled={busy} onChange={(event) => chooseDate(event.target.value)} />
        </details>
      </div>
      {source === 'loading' ? <Skeleton lines={3} height={16} gap={14} label="기록 불러오는 중" />
        : source !== 'live' ? <p className="daily-review-history-message">연결되면 저장한 기록을 볼 수 있어요.</p>
          : entries.length === 0 ? <EmptyState title="이달엔 아직 기록이 없어요" description="에너지 하나만 골라도 첫 기록이 돼요." action={<Button variant="outline" icon="plus" onClick={() => openReview(todayKey)}>오늘 기록 남기기</Button>} />
            : <ul>
              {entries.map((entry) => <li key={entry.reviewDate}><button className="hub-row" type="button" disabled={busy} aria-label={`${entry.reviewDate} 기록 열기`} aria-current={entry.reviewDate === date ? 'date' : undefined} onClick={() => openReview(entry.reviewDate)}>
                <span className="daily-review-history-date mono">{shortDate(entry.reviewDate)}</span>
                <span className="daily-review-history-content"><span className="daily-review-history-note">{entry.note || entry.excerpt || entry.focus || '하루 기록'}</span><span className="daily-review-history-meta">{energyText(entry.energy)}{entry.progress !== null && entry.progress !== undefined && ` · ${progressLabel(entry.progress)}`}</span></span>
                <Iconed name="chevronR" size={14} />
              </button></li>)}
            </ul>}
    </section>
  </div>;
}
