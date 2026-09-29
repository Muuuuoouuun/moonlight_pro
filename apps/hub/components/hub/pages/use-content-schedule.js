"use client";

import React from 'react';

// 콘텐츠 예약 목록(지금 올릴 글 · 놓친 글 · 앞으로) — 허브 read 봉투(status)를 읽는다. HTTP 200이어도 error일 수 있다.
const ENDPOINT = '/api/hub/content/schedule';

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
  const [state, setState] = React.useState({ status: 'loading', schedules: [], message: '' });
  const load = React.useCallback(async () => {
    try {
      const response = await fetch(`${ENDPOINT}?scope=${scope}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!data || !['live', 'preview', 'error'].includes(data.status)) throw new Error('invalid');
      setState({ status: data.status, schedules: Array.isArray(data.schedules) ? data.schedules : [], message: data.message || '' });
    } catch {
      setState({ status: 'error', schedules: [], message: '예약 목록을 불러오지 못했어요. 다시 시도해 주세요.' });
    }
  }, [scope]);
  React.useEffect(() => { load(); }, [load]);

  const apply = (result) => {
    if (['saved', 'duplicate'].includes(result.status) && result.schedule) {
      setState((current) => ({ ...current, schedules: [...current.schedules.filter((row) => row.variantId !== result.schedule.variantId), result.schedule] }));
    }
    if (result.status === 'conflict') load();
    return result;
  };
  return {
    ...state, reload: load,
    // 해제·발행된 행도 버전 번호가 필요하다(다시 예약할 때 낙관적 잠금) — 상태와 무관하게 찾는다.
    anyForVariant: (variantId) => state.schedules.find((row) => row.variantId === variantId) || null,
    forVariant: (variantId) => state.schedules.find((row) => row.variantId === variantId && ['scheduled', 'due', 'missed'].includes(row.state)) || null,
    set: async (input) => apply(await post({ action: 'set', ...input })),
    cancel: async (variantId, expectedRevision) => apply(await post({ action: 'cancel', variantId, expectedRevision })),
    complete: async (variantId, expectedRevision) => apply(await post({ action: 'complete', variantId, expectedRevision })),
  };
}
