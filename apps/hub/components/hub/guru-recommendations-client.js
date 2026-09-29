"use client";

// 기록 기반 Guru 추천 읽기 — 오늘·홈·고객 상세·거래 상세·Office 결과가 같은 목록을 나눠 쓴다.
// 한 화면 전환 안에서 여러 표면이 따로 원장을 다시 읽지 않도록 60초 동안 같은 결과를 쓴다.
// 허브 read 봉투(status)를 그대로 넘긴다 — 읽기 실패를 "추천 없음"으로 바꾸지 않는다.

import React from "react";

export const GURU_RECOMMENDATIONS_CACHE_MS = 60_000;

let cache = null; // { at, promise }

function envelopeStatus(response, data) {
  if (!response?.ok || !data) return "error";
  if (data.status === "error") return "error";
  return ["live", "partial", "preview"].includes(data.status) ? data.status : "error";
}

export async function fetchGuruRecommendations({ fetcher = fetch, signal } = {}) {
  try {
    const response = await fetcher("/api/hub/guru-recommendations", {
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => null);
    const status = envelopeStatus(response, data);
    return {
      status,
      failedSources: Array.isArray(data?.failedSources) ? data.failedSources : [],
      recommendations: status === "error" || !Array.isArray(data?.recommendations) ? [] : data.recommendations,
    };
  } catch {
    return { status: "error", failedSources: ["guru-recommendations"], recommendations: [] };
  }
}

export function loadGuruRecommendations({ force = false, fetcher = fetch, now = Date.now() } = {}) {
  if (!force && cache && now - cache.at < GURU_RECOMMENDATIONS_CACHE_MS) return cache.promise;
  const promise = fetchGuruRecommendations({ fetcher });
  cache = { at: now, promise };
  // 실패한 읽기는 다음 요청이 곧바로 다시 시도하게 한다.
  promise.then((result) => { if (result.status === "error" && cache?.promise === promise) cache = null; });
  return promise;
}

export function clearGuruRecommendationCache() {
  cache = null;
}

export function recommendationForSubject(result, subjectId) {
  if (!subjectId || !Array.isArray(result?.recommendations)) return null;
  return result.recommendations.find((rec) => String(rec?.subject?.id) === String(subjectId)) || null;
}

export function actRecommendations(result, limit = 3) {
  return (Array.isArray(result?.recommendations) ? result.recommendations : [])
    .filter((rec) => rec?.severity === "act")
    .slice(0, limit);
}

// enabled가 false면 읽지 않는다(드로어가 닫혀 있을 때 등).
export function useGuruRecommendations({ enabled = true } = {}) {
  const [state, setState] = React.useState({ status: enabled ? "loading" : "idle", failedSources: [], recommendations: [] });
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    setState((prev) => ({ ...prev, status: "loading" }));
    loadGuruRecommendations({ force: reloadKey > 0 }).then((result) => {
      if (active) setState(result);
    });
    return () => { active = false; };
  }, [enabled, reloadKey]);

  const reload = React.useCallback(() => setReloadKey((key) => key + 1), []);
  return { ...state, reload };
}
