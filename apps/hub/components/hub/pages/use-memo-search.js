"use client";
import React from 'react';
import { MEMO_CHANGED_EVENT } from '@/lib/journal-search-client';

const initial = { status: 'loading', entries: [], nextCursor: null, context: null };
export function useMemoSearch(query, { enabled = true } = {}) {
  const [state, setState] = React.useState(initial), [reload, setReload] = React.useState(0);
  const [moreBusy, setMoreBusy] = React.useState(false), [error, setError] = React.useState('');
  const generation = React.useRef(0), request = React.useRef(null);
  const current = React.useRef(state); current.current = state;
  const refresh = React.useCallback(() => setReload((value) => value + 1), []);
  React.useEffect(() => {
    window.addEventListener(MEMO_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MEMO_CHANGED_EVENT, refresh);
  }, [refresh]);
  React.useEffect(() => {
    const ticket = ++generation.current, controller = new AbortController();
    request.current?.abort(); request.current = controller;
    const prior = current.current, keepRows = prior.query === query && prior.status === 'live';
    const extent = keepRows ? prior.entries.length : 0;
    setState(keepRows ? { ...prior, refreshing: true } : { ...initial, query }); setError(''); setMoreBusy(false);
    if (!enabled) return () => controller.abort();
    async function load() {
      const data = await read(query, controller.signal);
      while (data.status === 'live' && data.entries.length < extent && data.nextCursor && !controller.signal.aborted) {
        const params = new URLSearchParams(query); params.set('cursor', data.nextCursor);
        const next = await read(params.toString(), controller.signal);
        if (next.status !== 'live') throw Error('메모 저장소 연결을 확인해 주세요.');
        const ids = new Set(data.entries.map((entry) => entry.id));
        data.entries.push(...next.entries.filter((entry) => !ids.has(entry.id)));
        if (data.nextCursor === next.nextCursor) throw Error('메모 목록을 다시 확인해 주세요.');
        data.nextCursor = next.nextCursor;
      }
      return data;
    }
    load().then((data) => {
      if (generation.current === ticket) setState({ ...data, query, refreshing: false });
    }).catch((failure) => {
      if (!controller.signal.aborted && generation.current === ticket) {
        setState(keepRows ? { ...prior, refreshing: false } : { ...initial, query, status: 'error' });
        setError(failure.message);
      }
    });
    return () => { controller.abort(); request.current?.abort(); generation.current++; };
  }, [query, reload, enabled]);
  async function more() {
    if (moreBusy || state.refreshing || !state.nextCursor || state.query !== query) return;
    const ticket = generation.current, controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setMoreBusy(true); setError('');
    try {
      const params = new URLSearchParams(query); params.set('cursor', state.nextCursor);
      const data = await read(params.toString(), controller.signal);
      if (data.status !== 'live') throw Error('메모 저장소 연결을 확인해 주세요.');
      if (generation.current === ticket) setState((prior) => ({ ...prior, nextCursor: data.nextCursor,
        entries: [...prior.entries, ...data.entries.filter((row) => !prior.entries.some((old) => old.id === row.id))] }));
    } catch (failure) { if (!controller.signal.aborted && generation.current === ticket) setError(failure.message); }
    finally { if (generation.current === ticket) setMoreBusy(false); }
  }
  return { ...(state.query === query ? state : initial), error: state.query === query ? error : '', moreBusy, more, refresh };
}
async function read(query, signal) {
  const response = await fetch('/api/hub/journal/search?' + query, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  const data = await response.json();
  if (!response.ok || data.status === 'error' || data.source === 'error' || !['live', 'preview'].includes(data.status) || !Array.isArray(data.entries)) {
    throw Error(data.message || '메모를 찾지 못했어요. 다시 시도해 주세요.');
  }
  return data;
}
