"use client";

import React from 'react';
import { Button, Drawer, SegmentedControl, TextAreaField, TextField, TruthBadge, useToast } from '../hub-primitives';
import { Iconed } from '../hub-icons';

const ENERGY = [1, 2, 3, 4, 5].map((key) => ({ key, label: String(key) }));
export const ENERGY_LABELS = ['많이 지침', '조금 지침', '보통', '여유 있음', '활기참'];
const PROGRESS = [{ key: 0, label: '미착수' }, { key: 1, label: '진행' }, { key: 2, label: '목표 달성' }];
const hasProgress = (draft) => Boolean(draft.focus.trim() || draft.progress !== null);
export function progressLabel(value) {
  return value === 'not_applicable' ? '대상 없음' : PROGRESS.find((item) => item.key === value)?.label || '미입력';
}

function ReviewSummary({ review }) {
  return <dl className="daily-review-summary">
    <div><dt>에너지</dt><dd>{review.energy === null ? '미입력' : `${review.energy} · ${ENERGY_LABELS[review.energy - 1]}`}</dd></div>
    <div><dt>오늘의 목표</dt><dd>{review.focus || '미입력'}</dd></div>
    <div><dt>진척</dt><dd>{progressLabel(review.progress)}</dd></div>
    <div><dt>메모</dt><dd>{review.note || '미입력'}</dd></div>
  </dl>;
}

export function DailyReviewComposer({ model, onClose }) {
  const { date, draft, review, source, saveState, busy, dirty, conflict, edit, today } = model;
  const toast = useToast();
  const [expanded, setExpanded] = React.useState(() => source !== 'loading' && hasProgress(draft));
  const [exiting, setExiting] = React.useState(false);
  const formRef = React.useRef(null);
  const initialized = React.useRef(source !== 'loading');
  const submittingRef = React.useRef(false);
  const locked = busy || exiting;
  const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00Z`));
  // 읽기 전용 두 줄(2026-09-20 §6.3) — 오늘 3개 k/n · 연락 N건. 서버가 못 읽으면 날짜만 남는다.
  const todayLine = today && today.date === date
    ? ` · 오늘 3개 ${today.focusDone}/${today.focusPicked} · 연락 ${today.contacts}건`
    : '';

  React.useEffect(() => {
    if (source !== 'loading' && !initialized.current) {
      initialized.current = true;
      setExpanded(hasProgress(draft));
    }
  }, [source, draft]);

  React.useEffect(() => {
    if (!exiting) return;
    const duration = getComputedStyle(formRef.current).getPropertyValue('--dur-panel').trim();
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0
      : (parseFloat(duration) || 0) * (duration.endsWith('ms') ? 1 : 1000);
    const timer = window.setTimeout(onClose, delay);
    return () => window.clearTimeout(timer);
  }, [exiting, onClose]);

  function requestClose() {
    if (submittingRef.current || saveState === 'saving' || exiting) return;
    setExiting(true);
  }

  async function submit(nextDraft = draft) {
    if (locked || submittingRef.current) return;
    submittingRef.current = true;
    // Keep focus inside the dialog when the submit button becomes disabled.
    formRef.current?.focus();
    try {
      const result = await model.save(nextDraft);
      if (result?.state === 'saved') {
        setExiting(true);
        toast.success('오늘의 하루 리뷰를 저장했습니다.');
      }
      else if (typeof nextDraft.progress === 'number' && !nextDraft.focus.trim()) setExpanded(true);
    } finally { submittingRef.current = false; }
  }

  return <Drawer title="하루 리뷰" subtitle={`${dateLabel}${todayLine}`} presentation="compact" width="460px" exiting={exiting} onClose={requestClose} initialFocusRef={formRef}
    footer={<div className="daily-review-composer-footer">
      {!conflict && <Button form="daily-review-composer" type="submit" variant="primary" size="md" icon={saveState === 'saved' ? 'check' : undefined} disabled={locked || source !== 'live' || !dirty}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '저장했어요' : saveState === 'error' ? '다시 저장' : review ? '수정 저장' : '저장'}</Button>}
      <span className="daily-review-footer-hint">{source !== 'live' && source !== 'loading' ? '연결 후 저장할 수 있어요' : dirty ? '닫아도 작성 중인 내용은 유지돼요' : '한 항목만 남겨도 좋아요'}</span>
    </div>}>
    <form id="daily-review-composer" className="daily-review-composer" ref={formRef} tabIndex={-1} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); if (!conflict) submit(); }}>
      {source === 'loading' ? <p className="daily-review-hint">기록을 불러오고 있어요…</p> : <>
        <fieldset disabled={locked} className="daily-review-basics">
          <section className="daily-review-field">
            <div className="daily-review-field-heading"><span>에너지는 어땠나요?</span><span className="daily-review-energy-label" aria-live="polite">{draft.energy === null ? '선택' : ENERGY_LABELS[draft.energy - 1]}</span></div>
            <SegmentedControl className="daily-review-energy" label="에너지, 1 많이 지침부터 5 활기참까지" options={ENERGY} value={draft.energy} onChange={(value) => edit('energy', draft.energy === value ? null : value)} fill size="md" />
            <div className="daily-review-scale"><span>많이 지침</span><span>활기참</span></div>
          </section>
          <TextAreaField id="daily-review-note" label="한 줄 메모" value={draft.note} rows={3} maxLength={4000} placeholder="오늘 기억하고 싶은 일은…" onChange={(event) => edit('note', event.target.value)} />
        </fieldset>

        <Button className="daily-review-disclosure" disabled={locked} aria-expanded={expanded} aria-controls="daily-review-progress-fields" onClick={() => setExpanded((value) => !value)}><Iconed name="chevronD" size={13} />목표·진척도 남기기<span className="daily-review-optional">선택</span></Button>
        <div id="daily-review-progress-fields" className="daily-review-progress-reveal" data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}>
          <div><fieldset disabled={locked || !expanded} className="daily-review-progress-fields">
            <TextField id="daily-review-focus" label="오늘의 목표" value={draft.focus} maxLength={500} placeholder="오늘 어디까지 하기로 했나요?" onChange={(event) => edit('focus', event.target.value)} />
            <SegmentedControl className="daily-review-progress" label="오늘의 목표 진척" options={PROGRESS} value={draft.progress} onChange={(value) => edit('progress', draft.progress === value ? null : value)} fill size="md" />
            <Button className="daily-review-no-target" active={draft.progress === 'not_applicable'} aria-pressed={draft.progress === 'not_applicable'} onClick={() => edit('progress', draft.progress === 'not_applicable' ? null : 'not_applicable')}>평가할 목표 없음</Button>
          </fieldset></div>
        </div>

        {source !== 'live' && <div className="daily-review-connection"><TruthBadge state={source} /><p>{model.loadMessage}</p><Button variant="outline" disabled={busy} onClick={() => { formRef.current?.focus(); model.refresh(); }}>다시 불러오기</Button></div>}
        {model.message && <div className="daily-review-feedback" role={saveState === 'error' ? 'alert' : 'status'}>{model.message}</div>}
        {conflict && <section className="daily-review-conflict" aria-label="변경된 기록 비교">
          <p>저장된 기록이 바뀌었어요. 내 입력은 그대로 남아 있어요.</p>
          <details><summary>현재 저장된 내용 보기</summary><ReviewSummary review={conflict} /></details>
          <div className="daily-review-actions">
            <Button variant="outline" disabled={locked} onClick={() => { formRef.current?.focus(); setExpanded(hasProgress(conflict)); model.useSavedRecord(); }}>저장된 기록 사용</Button>
            <Button variant="primary" disabled={locked || source !== 'live'} onClick={() => submit({ ...draft, expectedRevision: conflict.revision })}>내 입력으로 다시 저장</Button>
          </div>
        </section>}
      </>}
    </form>
  </Drawer>;
}
