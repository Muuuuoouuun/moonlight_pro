"use client";

import React from 'react';
import { Button, EmptyState, SegmentedControl, TextAreaField, TextField, TruthBadge } from '../hub-primitives';
import { isDailyReviewDate, validateDailyReviewInput } from '@/lib/daily-review';
import { blankReviewDraft, prepareReviewSave, reconcileReviewDraft, resolveReviewSave, reviewToDraft, sameReviewAnswers } from '@/lib/daily-review-state';
import { dailyReviewDraftStore } from '@/lib/daily-review-browser-store';
import './daily-review.css';

const ENERGY = [1, 2, 3, 4, 5].map((key) => ({ key, label: String(key) }));
const ENERGY_LABELS = ['많이 지침', '조금 지침', '보통', '여유 있음', '활기참'];
const PROGRESS = [{ key: 0, label: '미착수' }, { key: 1, label: '진행' }, { key: 2, label: '목표 달성' }];
const cachedDraft = (date) => dailyReviewDraftStore.read(date);
const keepDraft = (date, value) => dailyReviewDraftStore.write(date, value);

function todayIn(timezone = 'Asia/Seoul') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function moveDay(date, offset) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  const next = value.toISOString().slice(0, 10);
  return isDailyReviewDate(next) ? next : date;
}

function progressLabel(value) {
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

export function DailyReview() {
  const [selectedDate, setSelectedDate] = React.useState('');
  const [timezone, setTimezone] = React.useState('Asia/Seoul');
  const [draft, setDraft] = React.useState(() => blankReviewDraft(todayIn()));
  const [review, setReview] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [source, setSource] = React.useState('loading');
  const [loadMessage, setLoadMessage] = React.useState('');
  const [saveState, setSaveState] = React.useState('idle');
  const [message, setMessage] = React.useState('');
  const [conflict, setConflict] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const attemptRef = React.useRef(null);
  const savingRef = React.useRef(false);
  const mountedRef = React.useRef(false);
  const dirty = !sameReviewAnswers(draft, review || blankReviewDraft(draft.reviewDate));

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setSource('loading');
    setMessage('');
    setConflict(null);
    setSaveState('idle');
    const timer = window.setTimeout(() => controller.abort(), 15000);
    async function load() {
      let date = selectedDate || todayIn();
      try {
        const query = selectedDate ? `?date=${selectedDate}&month=${selectedDate.slice(0, 7)}` : '';
        const response = await fetch(`/api/hub/daily-review${query}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!active) return;
        date = selectedDate || (isDailyReviewDate(data.reviewDate) ? data.reviewDate : todayIn(data.timezone || 'Asia/Seoul'));
        const state = response.ok && ['live', 'preview'].includes(data.status) ? data.status : 'error';
        const saved = state === 'live' ? data.review : null;
        const restored = reconcileReviewDraft(date, saved, cachedDraft(date));
        setTimezone(data.timezone || 'Asia/Seoul');
        setReview(saved);
        setDraft(restored.draft);
        attemptRef.current = restored.attempt;
        setConflict(restored.conflict);
        setEntries(state === 'live' && Array.isArray(data.entries) ? data.entries : []);
        setSource(state);
        setLoadMessage(state === 'preview' ? '저장소 연결이 필요해요. 입력은 이 창에 보관됩니다.' : data.message || '기록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
        if (restored.recovered) setMessage('이 창에 보관된 미저장 입력을 불러왔어요.');
        else keepDraft(date, null);
      } catch {
        if (!active) return;
        const cached = cachedDraft(date);
        setDraft(cached?.draft || blankReviewDraft(date));
        attemptRef.current = cached?.attempt || null;
        setReview(null);
        setEntries([]);
        setSource('error');
        setLoadMessage('기록을 불러오지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.');
      } finally { window.clearTimeout(timer); }
    }
    load();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [selectedDate, reload]);

  function edit(field, value) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setSaveState('idle');
    setMessage('');
    attemptRef.current = null;
    keepDraft(next.reviewDate, sameReviewAnswers(next, review || blankReviewDraft(next.reviewDate)) ? null : { draft: next, attempt: null });
  }

  function chooseDate(date) {
    if (!savingRef.current && isDailyReviewDate(date)) setSelectedDate(date);
  }

  async function save(nextDraft = draft) {
    if (savingRef.current || source !== 'live') return;
    const attempt = prepareReviewSave(nextDraft, attemptRef.current, crypto.randomUUID());
    const validation = validateDailyReviewInput(attempt.payload);
    if (!validation.ok) { setSaveState('error'); setMessage(validation.message); return; }
    savingRef.current = true;
    attemptRef.current = attempt;
    keepDraft(nextDraft.reviewDate, { draft: nextDraft, attempt });
    setDraft(nextDraft);
    setSaveState('saving');
    setMessage('저장 중…');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/hub/daily-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.payload), signal: controller.signal,
      });
      const result = resolveReviewSave({ responseOk: response.ok, data: await response.json(), date: nextDraft.reviewDate });
      if (result.state === 'saved') {
        if (cachedDraft(nextDraft.reviewDate)?.attempt?.requestId === attempt.requestId) keepDraft(nextDraft.reviewDate, null);
        if (!mountedRef.current) return;
        setReview(result.review);
        setDraft(reviewToDraft(result.review));
        setEntries((previous) => [result.review, ...previous.filter((entry) => entry.reviewDate !== result.review.reviewDate)].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate)));
        attemptRef.current = null;
        setConflict(null);
        setSaveState('saved');
        setMessage('저장했어요. 날짜별 기록에서 다시 열 수 있어요.');
      } else if (mountedRef.current) {
        setSaveState(result.state);
        if (result.state === 'conflict') {
          setConflict(result.review);
          setMessage('다른 창에서 이 날짜의 기록이 바뀌었어요. 두 내용을 확인해 주세요.');
        } else setMessage(result.message);
      }
    } catch {
      if (mountedRef.current) { setSaveState('error'); setMessage('저장을 확인하지 못했어요. 입력은 유지되어 있습니다. 다시 시도해 주세요.'); }
    } finally {
      window.clearTimeout(timer);
      savingRef.current = false;
      if (mountedRef.current) setSaveState((state) => state === 'saving' ? 'error' : state);
    }
  }

  function useSavedRecord() {
    setReview(conflict);
    setEntries((previous) => [conflict, ...previous.filter((entry) => entry.reviewDate !== conflict.reviewDate)].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate)));
    setDraft(reviewToDraft(conflict));
    keepDraft(draft.reviewDate, null);
    attemptRef.current = null;
    setConflict(null);
    setSaveState('idle');
    setMessage('저장된 기록을 불러왔어요.');
  }

  const busy = source === 'loading' || saveState === 'saving';
  const idleMessage = source === 'loading' ? '저장된 기록을 확인하고 있어요.'
    : dirty ? '미저장 입력이 있어요.'
      : source !== 'live' ? '연결되면 이 날짜의 기록을 확인할 수 있어요.'
        : review ? '저장된 기록입니다. 수정해서 다시 저장할 수 있어요.' : '아직 이 날짜에 저장된 기록이 없어요.';
  return <div className="daily-review-page">
    <header className="daily-review-header">
      <div><h2>하루 리뷰</h2><p>에너지, 오늘의 진척, 남기고 싶은 한 줄. 답하고 싶은 항목부터 기록하세요.</p></div>
      <span className="daily-review-personal">개인 기록</span>
    </header>
    <div className="daily-review-toolbar">
      <div className="daily-review-date-controls">
        <Button variant="outline" aria-label="이전 날" disabled={busy} onClick={() => chooseDate(moveDay(draft.reviewDate, -1))}>←</Button>
        <TextField id="daily-review-date" label="리뷰 날짜" type="date" value={draft.reviewDate} disabled={busy} onChange={(event) => chooseDate(event.target.value)} />
        <Button variant="outline" aria-label="다음 날" disabled={busy} onClick={() => chooseDate(moveDay(draft.reviewDate, 1))}>→</Button>
        <Button variant="outline" disabled={busy} onClick={() => chooseDate(todayIn(timezone))}>오늘</Button>
      </div>
      <span className="daily-review-timezone">날짜 기준 · {review?.timezone || timezone}</span>
    </div>
    <div className="daily-review-source" aria-live="polite">
      <TruthBadge state={source} label={source === 'live' ? '저장소 연결됨' : undefined} />
      {(source === 'error' || source === 'preview') && <><span>{loadMessage}</span><Button variant="outline" onClick={() => setReload((value) => value + 1)}>다시 불러오기</Button></>}
    </div>
    <div className="daily-review-layout">
      <form className="daily-review-form" onSubmit={(event) => { event.preventDefault(); if (!conflict) save(); }}>
        <fieldset disabled={busy}>
          <section className="daily-review-field">
            <div className="daily-review-field-title">에너지는 어땠나요?</div>
            <SegmentedControl label="에너지, 1 많이 지침부터 5 활기참까지" options={ENERGY} value={draft.energy} onChange={(value) => edit('energy', draft.energy === value ? null : value)} fill size="md" />
            <div className="daily-review-scale"><span>1 많이 지침</span><span>5 활기참</span></div>
            <p className="daily-review-hint" aria-live="polite">{draft.energy === null ? '선택하지 않아도 괜찮아요.' : `${ENERGY_LABELS[draft.energy - 1]} · 같은 숫자를 누르면 선택을 해제해요.`}</p>
          </section>
          <section className="daily-review-field">
            <TextField id="daily-review-focus" label="오늘의 목표" value={draft.focus} maxLength={500} placeholder="오늘 어디까지 하기로 했나요?" hint="목표 달성은 오늘 정한 범위 기준이에요." onChange={(event) => edit('focus', event.target.value)} />
            <SegmentedControl label="오늘의 목표 진척" options={PROGRESS} value={draft.progress} onChange={(value) => edit('progress', draft.progress === value ? null : value)} fill size="md" />
            <Button className="daily-review-no-target" active={draft.progress === 'not_applicable'} aria-pressed={draft.progress === 'not_applicable'} onClick={() => edit('progress', draft.progress === 'not_applicable' ? null : 'not_applicable')}>평가할 목표 없음</Button>
            <p className="daily-review-hint">{draft.progress === null ? '진척 미입력 · 평가할 목표가 없으면 위 항목을 선택하세요.' : `진척: ${progressLabel(draft.progress)} · 다시 누르면 선택을 해제해요.`}</p>
          </section>
          <section className="daily-review-field">
            <TextAreaField id="daily-review-note" label="남기고 싶은 한 줄" value={draft.note} rows={4} maxLength={4000} placeholder="잘된 일, 걸린 일, 그냥 기억할 일." hint="선택 항목 · 길게 적어도 괜찮아요." onChange={(event) => edit('note', event.target.value)} />
          </section>
        </fieldset>
        {conflict && <section className="daily-review-conflict" aria-label="변경된 기록 비교">
          <p>저장된 기록이 바뀌었어요. 내 입력은 위에 그대로 남아 있어요.</p>
          <details><summary>현재 저장된 내용 보기</summary><ReviewSummary review={conflict} /></details>
          <div className="daily-review-actions">
            <Button variant="outline" disabled={busy} onClick={useSavedRecord}>저장된 기록 사용</Button>
            <Button variant="primary" disabled={busy || source !== 'live'} onClick={() => save({ ...draft, expectedRevision: conflict.revision })}>내 입력으로 다시 저장</Button>
          </div>
        </section>}
        <footer className="daily-review-save">
          <div className="daily-review-feedback" role={saveState === 'error' ? 'alert' : 'status'}>
            {saveState === 'error' && <TruthBadge state="error" label="저장 실패" />}
            <span>{message || idleMessage}</span>
          </div>
          {!conflict && <Button type="submit" variant="primary" size="md" disabled={busy || source !== 'live' || !dirty}>{saveState === 'saving' ? '저장 중…' : saveState === 'error' ? '다시 저장' : review ? '수정 저장' : '저장'}</Button>}
        </footer>
      </form>
      <aside className="daily-review-history" aria-label="날짜별 기록">
        <div className="daily-review-history-heading"><h3>날짜별 기록</h3><TextField id="daily-review-month" label="조회 월" type="month" value={draft.reviewDate.slice(0, 7)} disabled={busy} onChange={(event) => chooseDate(`${event.target.value}-01`)} /></div>
        {source === 'loading' ? <p className="daily-review-history-message">기록을 불러오는 중…</p> : source !== 'live' ? <p className="daily-review-history-message">연결되면 저장한 기록을 볼 수 있어요.</p> : entries.length === 0 ? <EmptyState title="이달의 기록이 없어요" description="입력란에서 한 항목만 남겨도 좋아요." action={<Button variant="outline" onClick={() => document.getElementById('daily-review-note')?.focus()}>첫 기록 남기기</Button>} /> : <ul>
          {entries.map((entry) => <li key={entry.reviewDate}><button className="hub-row" type="button" disabled={busy} aria-current={entry.reviewDate === draft.reviewDate ? 'date' : undefined} onClick={() => chooseDate(entry.reviewDate)}>
            <span className="daily-review-history-date">{entry.reviewDate.slice(5).replace('-', '.')}<span>{entry.energy == null ? '에너지 미입력' : `에너지 ${entry.energy}`}</span></span>
            <span className="daily-review-history-focus">{entry.focus || entry.note || entry.excerpt || '하루 기록'}</span>
            <span className="daily-review-history-progress">{progressLabel(entry.progress)}</span>
          </button></li>)}
        </ul>}
      </aside>
    </div>
  </div>;
}
