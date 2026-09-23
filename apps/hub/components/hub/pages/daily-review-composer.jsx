"use client";

import React from 'react';
import { Button, CertaintyBadge, Drawer, Kbd, SegmentedControl, Skeleton, TextAreaField, TextField, TruthBadge, useToast } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { shiftDateKey } from '@/lib/rhythm-calendar';
import { savedMessage, suggestFromFocus } from '@/lib/daily-review-rhythm';
import { DailyReviewCoach } from './daily-review-coach';
import { ENERGY_LABELS, PROGRESS, progressLabel } from './daily-review-labels';

export { ENERGY_LABELS, progressLabel };

const ENERGY = [1, 2, 3, 4, 5].map((key) => ({ key, label: String(key) }));
const hasProgress = (draft) => Boolean(draft.focus.trim() || draft.progress !== null);
// 메모 필드는 늘리지 않고(09-20 §6.3) 예시 문장만 날마다 바꾼다.
const NOTE_PROMPTS = ['오늘 기억하고 싶은 일은…', '오늘 잘 풀린 한 가지는…', '오늘 걸렸던 한 가지는…', '내일의 나에게 남길 한 줄은…'];
const isTypingTarget = (target) => Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable));

function ReviewSummary({ review }) {
  return <dl className="daily-review-summary">
    <div><dt>에너지</dt><dd>{review.energy === null ? '미입력' : `${review.energy} · ${ENERGY_LABELS[review.energy - 1]}`}</dd></div>
    <div><dt>오늘의 목표</dt><dd>{review.focus || '미입력'}</dd></div>
    <div><dt>진척</dt><dd>{progressLabel(review.progress)}</dd></div>
    <div><dt>메모</dt><dd>{review.note || '미입력'}</dd></div>
  </dl>;
}

export function DailyReviewComposer({ model, onClose }) {
  const { date, draft, review, source, saveState, busy, dirty, conflict, edit, editFields, today, todayKey, recent } = model;
  const toast = useToast();
  const [expanded, setExpanded] = React.useState(() => source !== 'loading' && hasProgress(draft));
  const [exiting, setExiting] = React.useState(false);
  const formRef = React.useRef(null);
  const initialized = React.useRef(source !== 'loading');
  const submittingRef = React.useRef(false);
  const locked = busy || exiting;
  const dateText = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00Z`));
  // 과거 날짜를 메울 때 오늘 기록과 헷갈리지 않게 날짜를 먼저 말한다(§4.6).
  const relative = !todayKey || date === todayKey ? '' : date === shiftDateKey(todayKey, -1) ? '어제 · ' : '지난 기록 · ';
  const dateLabel = `${relative}${dateText}`;
  const notePrompt = NOTE_PROMPTS[Number(date.slice(8, 10)) % NOTE_PROMPTS.length];
  // 오늘 3개 권장값(09-20 §6.2 → 2026-09-23 §4.4). 이미 목표·진척이 있으면 권하지 않는다 — 사용자 입력을 덮지 않는다.
  const suggestion = today && today.date === date && !draft.focus.trim() && draft.progress === null ? suggestFromFocus(today) : null;
  // 읽기 전용 두 줄(2026-09-20 §6.3) — 오늘 3개 k/n · 연락 N건. 서버가 못 읽으면 날짜만 남는다.
  // 연락 수가 null이면 읽기가 상한에 잘린 것이라 그 조각만 뺀다 — 적게 센 수를 확신에 차서
  // 보여주지 않는다(허브 read 계약).
  const todayLine = today && today.date === date
    ? ` · 오늘 3개 ${today.focusDone}/${today.focusPicked}${Number.isFinite(today.contacts) ? ` · 연락 ${today.contacts}건` : ''}`
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
        toast.success(savedMessage(todayKey, recent, result.review));
      }
      else if (typeof nextDraft.progress === 'number' && !nextDraft.focus.trim()) setExpanded(true);
    } finally { submittingRef.current = false; }
  }

  function applySuggestion() {
    if (!suggestion || locked) return;
    const patch = { progress: suggestion.progress };
    if (suggestion.focus) patch.focus = suggestion.focus;
    else patch.progress = null; // 목표 문구가 없으면 진척을 저장할 수 없다(missing-focus) — 목표 입력으로 안내한다.
    editFields(patch);
    setExpanded(true);
    if (!suggestion.focus) window.requestAnimationFrame(() => document.getElementById('daily-review-focus')?.focus());
  }

  // 숫자 키 1~5 → 에너지. 입력 필드 밖에서만(§8.1 단축키 조건), 같은 숫자는 해제.
  function onKeyDown(event) {
    if (locked || source !== 'live' || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
    const energy = Number(event.key);
    if (!Number.isInteger(energy) || energy < 1 || energy > 5) return;
    event.preventDefault();
    edit('energy', draft.energy === energy ? null : energy);
  }

  return <Drawer title="하루 리뷰" subtitle={`${dateLabel}${todayLine}`} presentation="compact" width="460px" exiting={exiting} onClose={requestClose} initialFocusRef={formRef}
    footer={<div className="daily-review-composer-footer">
      {!conflict && <Button form="daily-review-composer" type="submit" variant="primary" size="md" icon={saveState === 'saved' ? 'check' : undefined} disabled={locked || source !== 'live' || !dirty}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '저장했어요' : saveState === 'error' ? '다시 저장' : review ? '수정 저장' : '저장'}</Button>}
      <span className="daily-review-footer-hint">{source !== 'live' && source !== 'loading' ? '연결 후 저장할 수 있어요' : dirty ? <>닫아도 작성 중인 내용은 유지돼요 · <Kbd>⌘</Kbd><Kbd>Enter</Kbd> 저장</> : '한 항목만 남겨도 좋아요'}</span>
    </div>}>
    <form id="daily-review-composer" className="daily-review-composer" ref={formRef} tabIndex={-1} aria-busy={busy} onKeyDown={onKeyDown} onSubmit={(event) => { event.preventDefault(); if (!conflict) submit(); }}>
      {source === 'loading' ? <Skeleton lines={4} height={14} gap={14} width={['40%', '100%', '30%', '100%']} label="기록 불러오는 중" /> : <>
        <fieldset disabled={locked} className="daily-review-basics">
          <section className="daily-review-field">
            <div className="daily-review-field-heading"><span>에너지는 어땠나요?</span><span className="daily-review-energy-label" aria-live="polite">{draft.energy === null ? '선택' : ENERGY_LABELS[draft.energy - 1]}</span></div>
            <SegmentedControl className="daily-review-energy" label="에너지, 1 많이 지침부터 5 활기참까지" options={ENERGY} value={draft.energy} onChange={(value) => edit('energy', draft.energy === value ? null : value)} fill size="md" />
            <div className="daily-review-scale"><span>많이 지침</span><span className="daily-review-keyhint">숫자 키 <Kbd>1</Kbd>–<Kbd>5</Kbd></span><span>활기참</span></div>
          </section>
          <TextAreaField id="daily-review-note" label="한 줄 메모" value={draft.note} rows={3} maxLength={4000} placeholder={notePrompt} onCmdEnter={() => { if (!conflict && dirty) submit(); }} onChange={(event) => edit('note', event.target.value)} />
        </fieldset>

        {suggestion && <section className="daily-review-suggestion" aria-label="오늘 3개로 채우기">
          <div className="daily-review-suggestion-copy">
            <CertaintyBadge state="recommended" />
            <span>{suggestion.reason} → 진척 <strong>{progressLabel(suggestion.progress)}</strong></span>
            {suggestion.focus && <span className="daily-review-suggestion-focus">{suggestion.focus}</span>}
          </div>
          <Button variant="outline" size="sm" disabled={locked} onClick={applySuggestion}>{suggestion.focus ? '적용' : '목표 적기'}</Button>
        </section>}

        <Button className="daily-review-disclosure" disabled={locked} aria-expanded={expanded} aria-controls="daily-review-progress-fields" onClick={() => setExpanded((value) => !value)}><Iconed name="chevronD" size={13} />목표·진척도 남기기<span className="daily-review-optional">선택</span></Button>
        <div id="daily-review-progress-fields" className="daily-review-progress-reveal" data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}>
          <div><fieldset disabled={locked || !expanded} className="daily-review-progress-fields">
            <TextField id="daily-review-focus" label="오늘의 목표" value={draft.focus} maxLength={500} placeholder="오늘 어디까지 하기로 했나요?" onChange={(event) => edit('focus', event.target.value)} />
            <SegmentedControl className="daily-review-progress" label="오늘의 목표 진척" options={PROGRESS} value={draft.progress} onChange={(value) => edit('progress', draft.progress === value ? null : value)} fill size="md" />
            <Button className="daily-review-no-target" active={draft.progress === 'not_applicable'} aria-pressed={draft.progress === 'not_applicable'} onClick={() => edit('progress', draft.progress === 'not_applicable' ? null : 'not_applicable')}>평가할 목표 없음</Button>
          </fieldset></div>
        </div>

        {source === 'live' && review && !conflict && <DailyReviewCoach review={review} disabled={locked} onAppendNote={(text) => edit('note', draft.note.trim() ? `${draft.note.trim()}\n\n${text}` : text)} />}

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
