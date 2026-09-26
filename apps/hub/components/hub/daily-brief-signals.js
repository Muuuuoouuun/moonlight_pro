"use client";

import React from "react";

// /api/hub/daily-brief의 `signals` 읽기 — Home(첫 화면 트리아지)과 데스크톱 빠른 입력 위젯의
// "오늘 첫 행동"이 같은 읽기를 쓴다. 두 곳이 따로 fetch하면 봉투 해석이 갈라진다.

// 허브 read 봉투(CLAUDE.md): read 실패는 5xx가 아니라 HTTP 200 + status:"error"로 온다.
// `!r.ok`만 보면 read 실패가 빈 상태("대기 없음")로 위장된다.
export function readEnvelope(res, data) {
  if (!res.ok || !data) return 'error';
  if (data.status === 'error' || data.source === 'error') return 'error';
  return data.status || 'preview';
}

export const DAILY_BRIEF_TIMEOUT_MS = 20000;

// 한 번 읽는다. → { status: live|partial|preview|error, signals }
export async function fetchDailyBriefSignals({ signal, fetchImpl = globalThis.fetch } = {}) {
  const timeout = AbortSignal.timeout(DAILY_BRIEF_TIMEOUT_MS);
  const res = await fetchImpl('/api/hub/daily-brief', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const data = await res.json().catch(() => null);
  const status = readEnvelope(res, data);
  return {
    status,
    signals: status === 'error' ? [] : (Array.isArray(data?.signals) ? data.signals : []),
  };
}

const LOADING = { status: 'loading', signals: [] };

// reloadKey가 바뀔 때마다 다시 읽는다. keepPrevious: 이미 읽은 신호(live·partial)가 있으면 다시
// 읽는 동안 그대로 두고 로딩으로 되돌리지 않는다(위젯이 창 포커스마다 다시 읽을 때 행이 깜빡이지
// 않게). 실패·preview에서 다시 읽을 때는 로딩을 보여 재시도가 눌렸음을 알린다.
export function useDailyBriefSignals(reloadKey, { keepPrevious = false } = {}) {
  const [state, setState] = React.useState(LOADING);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState((prev) => (keepPrevious && (prev.status === 'live' || prev.status === 'partial') ? prev : LOADING));
    (async () => {
      try {
        const next = await fetchDailyBriefSignals({ signal: controller.signal });
        if (active) setState(next);
      } catch {
        if (active) setState({ status: 'error', signals: [] });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [reloadKey, keepPrevious]);

  return state;
}
