"use client";

import React from 'react';

// 콘텐츠 예약 목록(지금 올릴 글 · 놓친 글 · 앞으로) — 허브 read 봉투(status)를 읽는다. HTTP 200이어도 error일 수 있다.
const ENDPOINT = '/api/hub/content/schedule';
const LOADING = { status: 'loading', schedules: [], message: '' };
const READ_ERROR = { status: 'error', schedules: [], message: '예약 목록을 불러오지 못했어요. 다시 시도해 주세요.' };

async function post(body) {
  try {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!data || typeof data.status !== 'string') throw new Error('invalid');
    return data;
  } catch {
    return { status: 'error', message: '응답을 확인하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.' };
  }
}

/** scope: 'all'(원고 화면 — 이 결과물의 예약을 찾는다) | 'action'(홈 — 지금 올릴 글·놓친 글). */
export function useContentSchedule(scope = 'all') {
  const [state, setState] = React.useState(LOADING);
  const lifecycle = React.useRef({ active: false, epoch: 0, pending: null }).current;
  const cancelRead = React.useCallback(() => {
    const old = lifecycle.pending;
    lifecycle.pending = null;
    old?.controller.abort();
  }, [lifecycle]);
  const load = React.useCallback(() => {
    if (lifecycle.pending) return lifecycle.pending.promise;
    const controller = new AbortController();
    const work = { controller, promise: null };
    const current = () => lifecycle.active && lifecycle.pending === work;
    // Register first; Strict Mode cleanup can cancel before transport starts,
    // and overlapping reloads join the same read.
    work.promise = Promise.resolve().then(async () => {
      if (!current()) return;
      let onAbort;
      const interrupted = new Promise((_, reject) => {
        onAbort = () => reject(Error('aborted'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const data = await Promise.race([interrupted, (async () => {
          const response = await fetch(`${ENDPOINT}?scope=${scope}`, { cache: 'no-store', signal: controller.signal });
          const result = await response.json();
          if (!response.ok || !result || result.source === 'error' || !['live', 'preview', 'error'].includes(result.status)
            || (result.status === 'live' && !Array.isArray(result.schedules))) throw new Error('invalid');
          return result;
        })()]);
        if (current()) setState({ status: data.status, schedules: data.status === 'live' ? data.schedules : [], message: data.message || '' });
      } catch {
        if (current()) setState(READ_ERROR);
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', onAbort);
        if (lifecycle.pending === work) lifecycle.pending = null;
      }
    });
    lifecycle.pending = work;
    return work.promise;
  }, [scope, lifecycle]);
  React.useEffect(() => {
    lifecycle.active = true;
    setState(LOADING);
    void load();
    return () => { lifecycle.active = false; lifecycle.epoch++; cancelRead(); };
  }, [load, cancelRead, lifecycle]);

  const mutate = async (body) => {
    const epoch = lifecycle.epoch;
    const result = await post(body);
    if (!lifecycle.active || epoch !== lifecycle.epoch) return result;
    if (['saved', 'duplicate'].includes(result.status) && result.schedule) {
      cancelRead();
      setState((current) => {
        const known = current.schedules.find((row) => row.variantId === result.schedule.variantId);
        if (known?.revision > result.schedule.revision) return current;
        return { ...current, schedules: [...current.schedules.filter((row) => row.variantId !== result.schedule.variantId), result.schedule] };
      });
      // Reconcile the full scope after the confirmed row, including filtered
      // action lists. Pre-save reads can no longer overwrite this revision.
      void load();
    } else if (result.status === 'conflict') {
      cancelRead();
      void load();
    }
    return result;
  };
  return {
    ...state, reload: load,
    // 해제·발행된 행도 버전 번호가 필요하다(다시 예약할 때 낙관적 잠금) — 상태와 무관하게 찾는다.
    anyForVariant: (variantId) => state.schedules.find((row) => row.variantId === variantId) || null,
    forVariant: (variantId) => state.schedules.find((row) => row.variantId === variantId && ['scheduled', 'due', 'missed'].includes(row.state)) || null,
    set: (input) => mutate({ action: 'set', ...input }),
    cancel: (variantId, expectedRevision) => mutate({ action: 'cancel', variantId, expectedRevision }),
    complete: (variantId, expectedRevision) => mutate({ action: 'complete', variantId, expectedRevision }),
  };
}
