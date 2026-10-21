"use client";
import React from 'react';

const ENDPOINT = '/api/hub/content/schedule';
const LOADING = { status: 'loading', schedules: [], message: '' };
const READ_ERROR = { status: 'error', schedules: [], message: '예약 목록을 불러오지 못했어요. 다시 시도해 주세요.' };
const selectionKey = (target) => `selected:${target?.variantId || ''}:${target?.contentId || ''}`;
const EMPTY_SELECTION = selectionKey(null);
const validSelection = (target) => Boolean(target?.variantId && target?.contentId);

async function readSchedules(url, controller, target) {
  let onAbort;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('aborted'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const data = await Promise.race([interrupted, (async () => {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result || result.source === 'error' || !['live', 'preview', 'error'].includes(result.status)
        || (result.status === 'live' && !Array.isArray(result.schedules))) throw new Error('invalid');
      if (target && result.status === 'live' && (result.schedules.length > 1 || result.schedules.some((row) =>
        !row || row.variantId !== target.variantId || row.contentId !== target.contentId
        || !Number.isInteger(row.revision) || row.revision < 1))) throw new Error('invalid selection');
      return { status: result.status, schedules: result.status === 'live' ? result.schedules : [], message: result.message || '' };
    })()]);
    return data;
  } catch {
    return READ_ERROR;
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

async function post(body) {
  try {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!data || typeof data.status !== 'string') throw new Error('invalid');
    return data;
  } catch { return { status: 'error', message: '응답을 확인하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.' }; }
}

export function useContentSchedule(scope = 'all') {
  // 목록 소비자는 기존 범위와 100개 상한을 유지한다. Studio만 결과물 하나를 정확히 읽는다.
  const selected = typeof scope === 'object';
  const listScope = selected ? null : scope;
  const variantId = selected ? scope?.variantId || '' : '';
  const contentId = selected ? scope?.contentId || '' : '';
  const key = selected ? selectionKey({ variantId, contentId }) : `scope:${scope}`;
  const [state, setState] = React.useState(LOADING);
  const lifecycle = React.useRef({ active: false, epoch: 0, pending: null, lookups: new Set(), key, reload: null }).current;
  lifecycle.key = key;
  const cancelRead = React.useCallback(() => {
    const old = lifecycle.pending;
    lifecycle.pending = null;
    old?.controller.abort();
  }, [lifecycle]);
  const load = React.useCallback(() => {
    if (!lifecycle.active || lifecycle.key !== key) return Promise.resolve({ ...READ_ERROR, key });
    if (lifecycle.pending?.key === key) return lifecycle.pending.promise;
    const target = selected ? { variantId, contentId } : null;
    if (selected && !validSelection(target)) {
      const snapshot = { ...(variantId || contentId ? READ_ERROR : { status: 'idle', schedules: [], message: '' }), key };
      if (lifecycle.active && lifecycle.key === key) setState(snapshot);
      return Promise.resolve(snapshot);
    }
    const controller = new AbortController();
    const work = { controller, promise: null, key };
    const current = () => lifecycle.active && lifecycle.key === key && lifecycle.pending === work;
    work.promise = Promise.resolve().then(async () => {
      if (!current()) return { ...READ_ERROR, key };
      const query = selected ? `variantId=${encodeURIComponent(variantId)}&contentId=${encodeURIComponent(contentId)}` : `scope=${encodeURIComponent(listScope)}`;
      const snapshot = { ...await readSchedules(`${ENDPOINT}?${query}`, controller, target), key };
      if (current()) setState((previous) => {
        // A delayed replica read must not undo a confirmed exact-selection receipt.
        const known = previous.key === key && previous.schedules[0];
        const incoming = snapshot.schedules[0];
        if (selected && snapshot.status === 'live' && known && (!incoming || known.revision > incoming.revision)) return previous;
        return snapshot;
      });
      if (lifecycle.pending === work) lifecycle.pending = null;
      return snapshot;
    });
    lifecycle.pending = work;
    return work.promise;
  }, [listScope, selected, variantId, contentId, key, lifecycle]);
  // Object selectors are reconstructed by callers, so depend on their scalar identity.
  // The string/list scope is kept separate to avoid restarting the same exact read.
  lifecycle.reload = load;
  React.useEffect(() => {
    lifecycle.active = true;
    setState({ ...LOADING, key });
    void load();
    return () => { lifecycle.active = false; lifecycle.epoch++; cancelRead(); };
  }, [load, cancelRead, lifecycle, key]);

  React.useEffect(() => () => {
    for (const lookup of lifecycle.lookups) lookup.controller.abort();
    lifecycle.lookups.clear();
  }, [lifecycle]);

  const visible = state.key === key ? state : { ...LOADING, key };
  const readSelected = async (target) => {
    const targetKey = selectionKey(target);
    if (!validSelection(target) || !lifecycle.active) return { ...READ_ERROR, key: targetKey };
    if (lifecycle.pending?.key === targetKey) return lifecycle.pending.promise;
    const lookup = { controller: new AbortController(), key: targetKey };
    lifecycle.lookups.add(lookup);
    try {
      return { ...await readSchedules(`${ENDPOINT}?variantId=${encodeURIComponent(target.variantId)}&contentId=${encodeURIComponent(target.contentId)}`, lookup.controller, target), key: targetKey };
    } finally { lifecycle.lookups.delete(lookup); }
  };
  const mutate = async (body, observed = visible) => {
    if (selected) {
      const row = observed.schedules.find((item) => item.variantId === body.variantId);
      const targetKey = selectionKey({ variantId: body.variantId, contentId: body.contentId || row?.contentId });
      // Only a confirmed exact read may establish revision zero. An old render
      // may continue its first save, but cannot write into another selection.
      if (!lifecycle.active || observed.status !== 'live' || observed.key !== targetKey
        || body.expectedRevision !== (row?.revision || 0)
        || (lifecycle.key !== targetKey && !(key === EMPTY_SELECTION && lifecycle.key === EMPTY_SELECTION))) return READ_ERROR;
    }
    const epoch = lifecycle.epoch, mutationKey = lifecycle.key;
    const result = await post(body);
    if (selected && ['saved', 'duplicate'].includes(result.status) && (!result.schedule
      || selectionKey(result.schedule) !== observed.key || !Number.isInteger(result.schedule.revision)
      || result.schedule.revision < 1)) return READ_ERROR;
    const promoted = selected && mutationKey === EMPTY_SELECTION && lifecycle.key === observed.key && lifecycle.epoch <= epoch + 1;
    if (!lifecycle.active || (!promoted && (epoch !== lifecycle.epoch || lifecycle.key !== mutationKey))) return result;
    if (['saved', 'duplicate'].includes(result.status) && result.schedule) {
      cancelRead();
      setState((current) => {
        const known = current.schedules.find((row) => row.variantId === result.schedule.variantId);
        if (known?.revision > result.schedule.revision) return current;
        return { ...current, ...(selected ? { status: 'live', message: '' } : {}), key: selected ? selectionKey(result.schedule) : key, schedules: [...current.schedules.filter((row) => row.variantId !== result.schedule.variantId), result.schedule] };
      });
      void lifecycle.reload();
    } else if (result.status === 'conflict') {
      cancelRead();
      void lifecycle.reload();
    }
    return result;
  };
  return {
    ...visible, reload: load, readSelected,
    // 해제·발행된 행도 다시 예약할 때 버전 번호가 필요하다.
    anyForVariant: (id) => visible.schedules.find((row) => row.variantId === id) || null,
    forVariant: (id) => visible.schedules.find((row) => row.variantId === id && ['scheduled', 'due', 'missed'].includes(row.state)) || null,
    set: (input, observed) => mutate({ action: 'set', ...input }, observed),
    cancel: (id, expectedRevision) => mutate({ action: 'cancel', variantId: id, expectedRevision }),
    complete: (id, expectedRevision) => mutate({ action: 'complete', variantId: id, expectedRevision }),
  };
}
