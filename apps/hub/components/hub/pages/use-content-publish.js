"use client";

import React from 'react';

// 원고 책상의 읽기 셋 — 올릴 곳(브랜드별 채널 연결), 결과물의 마지막 올리기 작업, 고른 브랜드의 말투.
// 허브 read 봉투: HTTP 200 + status:"error"를 빈 상태로 읽지 않는다(CLAUDE.md Hub read 실패 봉투).
async function readEnvelope(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.status === 'error') return { ...(data || {}), status: 'error' };
  return data;
}

export function usePublishTargets() {
  const [state, setState] = React.useState({ status: 'loading', publishEnabled: false, storage: 'unknown', brands: {} });
  const load = React.useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading' }));
    try { setState(await readEnvelope('/api/hub/content/publish/targets')); }
    catch { setState({ status: 'error', publishEnabled: false, storage: 'unknown', brands: {} }); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function useThreadsJob(variantId) {
  const [state, setState] = React.useState({ status: variantId ? 'loading' : 'idle', job: null });
  const latest = React.useRef(variantId);
  const load = React.useCallback(async () => {
    latest.current = variantId;
    if (!variantId) { setState({ status: 'idle', job: null }); return; }
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const data = await readEnvelope(`/api/hub/content/publish/threads?variantId=${encodeURIComponent(variantId)}`);
      if (latest.current === variantId) setState({ status: data.status === 'live' ? 'live' : data.status, job: data.job || null });
    } catch { if (latest.current === variantId) setState({ status: 'error', job: null }); }
  }, [variantId]);
  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setJob: (job) => setState({ status: 'live', job }) };
}

/** 고른 브랜드의 말투 — 브랜드 화면과 같은 읽기(/api/hub/brands)에서 그 브랜드만 쓴다. 한 번 읽고 브랜드가 바뀌면 그 목록에서 고른다. */
export function useBrandGuide(brandId) {
  const [state, setState] = React.useState({ status: 'idle', brands: [] });
  const requested = React.useRef(false);
  const load = React.useCallback(async () => {
    requested.current = true;
    setState({ status: 'loading', brands: [] });
    try {
      const data = await readEnvelope('/api/hub/brands');
      setState({ status: data.status === 'error' ? 'error' : 'live', brands: Array.isArray(data.brands) ? data.brands : [] });
    } catch { setState({ status: 'error', brands: [] }); }
  }, []);
  React.useEffect(() => { if (brandId && !requested.current) load(); }, [brandId, load]);
  const brand = state.brands.find((entry) => entry.id === brandId) || null;
  return { status: brandId ? state.status : 'idle', brand, retry: load };
}

export async function postThreadsPublish(command) {
  try {
    const response = await fetch('/api/hub/content/publish/threads', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(75000),
    });
    const data = await response.json().catch(() => null);
    return data && typeof data === 'object' ? data : { status: 'unknown' };
  } catch { return { status: 'unknown', reason: 'response-lost' }; }
}

/** 저장된 본문의 SHA-256 — 서버가 같은 본문을 읽었는지 맞춰 본다. */
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
