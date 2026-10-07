"use client";

import React from "react";

// /api/hub/daily-brief의 `signals` 읽기 — Home(첫 화면 트리아지)과 데스크톱 빠른 입력 위젯의
// "오늘 첫 행동"이 같은 읽기를 쓴다. 두 곳이 따로 fetch하면 봉투 해석이 갈라진다.

// 허브 read 봉투(CLAUDE.md): read 실패는 5xx가 아니라 HTTP 200 + status:"error"로 온다.
// `!r.ok`만 보면 read 실패가 빈 상태("대기 없음")로 위장된다.
export function readEnvelope(res, data) {
  // 세션 만료: 미들웨어가 401 + {status:'unauthorized'}로 답한다 — 읽기 실패가 아니라 로그인 필요다.
  if (res.status === 401 || data?.status === 'unauthorized') return 'unauthorized';
  if (!res.ok || !data) return 'error';
  if (data.status === 'error' || data.source === 'error') return 'error';
  return data.status || 'preview';
}

export const DAILY_BRIEF_TIMEOUT_MS = 20000;

// 홈·오늘·데스크톱 위젯이 같은 /api/hub/daily-brief(서버에서 수십 개 원장을 읽는다)를 공유한다.
// - 동시에 열린 읽기는 한 번의 요청으로 합친다(화면 전환 중 겹치는 요청을 막는다).
// - 마지막 성공 응답은 5분 동안 다음 화면의 첫 그림이 된다. 화면은 그 위에서 언제나 다시 읽는다
//   (stale-while-revalidate) — 오래된 값을 최신처럼 붙잡아 두지 않는다.
export const DAILY_BRIEF_FRESH_MS = 5 * 60 * 1000;
let lastBrief = null; // { at, ok, httpStatus, data } — 성공(읽기 실패·로그인 필요가 아닌) 응답만
let pendingBrief = null; // { fetchImpl, generation, promise }
let readGeneration = 0;
let lastSettled = null; // 최신 세대의 결과(실패도 포함) — 늦은 이전 읽기가 이를 가리지 않는다.
let authVersion = 0;

export function getDailyBriefAuthVersion() { return authVersion; }

// 좁은 tasks 읽기에서 확인한 401도 같은 캐시를 폐기한다. 이미 열린 이전 읽기는
// 이 로그인 필요 결과를 따르며, 뒤늦게 성공해도 개인정보를 다시 캐시에 넣지 않는다.
export function invalidateDailyBriefAuth(read = {
  at: Date.now(), ok: false, httpStatus: 401, data: { status: 'unauthorized' },
}) {
  lastBrief = null;
  authVersion += 1;
  readGeneration += 1;
  pendingBrief = null;
  lastSettled = { generation: readGeneration, read };
}

function latestRead() {
  if (pendingBrief?.generation === readGeneration) return pendingBrief.promise;
  if (lastSettled?.generation === readGeneration) {
    if ('error' in lastSettled) throw lastSettled.error;
    return lastSettled.read;
  }
  throw new Error('daily-brief read was superseded');
}

function untilAborted(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

// 한 번 읽는다. 호출자의 signal은 기다림만 멈춘다 — 다른 화면이 같은 요청을 기다리고 있을 수 있다.
export function readDailyBrief({ signal, fetchImpl = globalThis.fetch, force = false } = {}) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  // 초기 동시 마운트는 합치고, 저장·재시도 뒤 명시적 새 읽기만 이전 요청에서 분리한다.
  if (force || !pendingBrief || pendingBrief.fetchImpl !== fetchImpl) {
    const entry = { fetchImpl, generation: ++readGeneration, promise: null };
    entry.promise = (async () => {
      const res = await fetchImpl('/api/hub/daily-brief', { cache: 'no-store', signal: AbortSignal.timeout(DAILY_BRIEF_TIMEOUT_MS) });
      const data = await res.json().catch(() => null);
      const read = { at: Date.now(), ok: res.ok, httpStatus: res.status, data };
      if (entry.generation !== readGeneration) return latestRead();
      const status = readEnvelope(res, data);
      if (status === 'unauthorized') invalidateDailyBriefAuth(read);
      else {
        if (status !== 'error') lastBrief = read;
        lastSettled = { generation: entry.generation, read };
      }
      return read;
    })().catch((error) => {
      if (entry.generation !== readGeneration) return latestRead();
      lastSettled = { generation: entry.generation, error };
      throw error;
    }).finally(() => { if (pendingBrief === entry) pendingBrief = null; });
    pendingBrief = entry;
  }
  return untilAborted(pendingBrief.promise, signal);
}

// 5분 안의 마지막 성공 응답 — 없으면 null. 화면의 첫 그림 전용이다.
export function peekDailyBrief(now = Date.now()) {
  return lastBrief && now - lastBrief.at < DAILY_BRIEF_FRESH_MS ? lastBrief : null;
}

export function briefEnvelope(read) {
  return readEnvelope({ ok: read.ok, status: read.httpStatus }, read.data);
}

function signalsFromRead(read) {
  const data = read.data;
  const status = briefEnvelope(read);
  const failed = status === 'error' || status === 'unauthorized';
  return {
    status,
    signals: failed ? [] : (Array.isArray(data?.signals) ? data.signals : []),
    dailyFocus: failed ? null : data?.dailyFocus || null,
    taskToday: failed ? null : data?.taskToday || null,
  };
}

// Home 브리핑은 같은 응답의 집중 고객·할 일도 사용한다.
export async function fetchDailyBriefSignals({ signal, fetchImpl = globalThis.fetch, force = false } = {}) {
  return signalsFromRead(await readDailyBrief({ signal, fetchImpl, force }));
}

const LOADING = { status: 'loading', signals: [], dailyFocus: null, taskToday: null };

// reloadKey가 바뀔 때마다 다시 읽는다. 다른 화면이 5분 안에 읽어 둔 응답이 있으면 그것을 먼저
// 그리고 조용히 다시 읽는다. keepPrevious: 이미 읽은 신호(live·partial)가 있으면 다시 읽는 동안
// 그대로 두고 로딩으로 되돌리지 않는다(위젯이 창 포커스마다 다시 읽을 때 행이 깜빡이지 않게).
// 실패·preview에서 다시 읽을 때는 로딩을 보여 재시도가 눌렸음을 알린다.
export function useDailyBriefSignals(reloadKey, { keepPrevious = false } = {}) {
  const [state, setState] = React.useState(() => {
    const cached = peekDailyBrief();
    return cached ? signalsFromRead(cached) : LOADING;
  });
  const firstRun = React.useRef(true);
  const lastReloadKey = React.useRef(reloadKey);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const force = !Object.is(lastReloadKey.current, reloadKey);
    lastReloadKey.current = reloadKey;
    const keep = keepPrevious || firstRun.current;
    firstRun.current = false;
    setState((prev) => (keep && (prev.status === 'live' || prev.status === 'partial') ? prev : LOADING));
    (async () => {
      try {
        const next = await fetchDailyBriefSignals({ signal: controller.signal, force });
        if (active) setState(next);
      } catch {
        if (active) setState({ status: 'error', signals: [], dailyFocus: null, taskToday: null });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [reloadKey, keepPrevious]);

  return state;
}
