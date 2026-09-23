"use client";

import React from 'react';
import { isDailyReviewDate, validateDailyReviewInput } from '@/lib/daily-review';
import { blankReviewDraft, prepareReviewSave, reconcileReviewDraft, resolveReviewSave, reviewToDraft, sameReviewAnswers } from '@/lib/daily-review-state';
import { dailyReviewDraftStore } from '@/lib/daily-review-browser-store';
import { recentRange } from '@/lib/daily-review-rhythm';

const cachedDraft = (date) => dailyReviewDraftStore.read(date);
const keepDraft = (date, value) => dailyReviewDraftStore.write(date, value);

// 저장 확인된 기록을 최근 목록에 반영한다. 최근 창(8일) 밖 날짜는 서버가 다시 읽을 때까지 두지 않는다.
function mergeRecent(previous, review, todayKey) {
  const range = recentRange(todayKey);
  if (!Array.isArray(previous) || !review || !range || review.reviewDate < range.from || review.reviewDate > range.to) return previous;
  return [{ reviewDate: review.reviewDate, energy: review.energy ?? null }, ...previous.filter((entry) => entry.reviewDate !== review.reviewDate)]
    .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
}

export function todayIn(timezone = 'Asia/Seoul') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function useDailyReview() {
  const [selectedDate, setSelectedDate] = React.useState('');
  const [timezone, setTimezone] = React.useState('Asia/Seoul');
  const [draft, setDraft] = React.useState(() => blankReviewDraft(todayIn()));
  const [review, setReview] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  // 저녁 리뷰의 읽기 전용 두 줄(오늘 3개·연락) — 서버가 같은 응답에 실어 보낸다.
  const [today, setToday] = React.useState(null);
  // 실제 오늘 기준 최근 8일 기록(선택 날짜와 무관) — cue·"이번 주 k/5"가 쓴다. 못 읽으면 null.
  const [recent, setRecent] = React.useState(null);
  const [todayKey, setTodayKey] = React.useState('');
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
        setToday(state === 'live' && data.today && typeof data.today === 'object' ? data.today : null);
        setRecent(state === 'live' && Array.isArray(data.recent) ? data.recent : null);
        setTodayKey(isDailyReviewDate(data.todayKey) ? data.todayKey : todayIn(data.timezone || 'Asia/Seoul'));
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
        setRecent(null);
        setSource('error');
        setLoadMessage('기록을 불러오지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.');
      } finally { window.clearTimeout(timer); }
    }
    load();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [selectedDate, reload]);

  function edit(field, value) { editFields({ [field]: value }); }

  // 권장 카드 "적용"처럼 목표·진척을 한 번에 바꾸는 편집. 초안 보관 규칙은 edit와 같다.
  function editFields(patch) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaveState('idle');
    setMessage('');
    attemptRef.current = null;
    keepDraft(next.reviewDate, sameReviewAnswers(next, review || blankReviewDraft(next.reviewDate)) ? null : { draft: next, attempt: null });
  }

  const currentDate = selectedDate || draft.reviewDate;
  // 셸의 Provider·딥링크 effect가 의존하므로 날짜가 바뀔 때만 새 함수가 된다.
  const chooseDate = React.useCallback((date) => {
    if (savingRef.current || !isDailyReviewDate(date)) return;
    if (date === currentDate) return;
    setSource('loading');
    setSelectedDate(date);
  }, [currentDate]);

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
        if (!mountedRef.current) return result;
        setReview(result.review);
        setDraft(reviewToDraft(result.review));
        setEntries((previous) => [result.review, ...previous.filter((entry) => entry.reviewDate !== result.review.reviewDate)].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate)));
        setRecent((previous) => mergeRecent(previous, result.review, todayKey));
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
      return result;
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
    setRecent((previous) => mergeRecent(previous, conflict, todayKey));
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
  return {
    date: currentDate, timezone, draft, review, entries, today, recent, todayKey,
    source, loadMessage, saveState, message, conflict, dirty, busy, idleMessage,
    edit, editFields, chooseDate, save, useSavedRecord, refresh: () => setReload((value) => value + 1),
  };
}
