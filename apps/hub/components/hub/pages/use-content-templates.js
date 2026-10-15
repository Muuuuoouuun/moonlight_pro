"use client";

import React from 'react';

// Studio AI 템플릿('AI 요청문 + 글 틀') 목록. 허브 read 봉투(status)를 읽는다 — HTTP 200이어도 error일 수 있다.
const ENDPOINT = '/api/hub/content/templates';
const LOADING = { status: 'loading', templates: [], message: '' };
const READ_ERROR = { status: 'error', templates: [], message: 'AI 템플릿을 불러오지 못했어요. 다시 시도해 주세요.' };

export function useContentTemplates() {
  const [state, setState] = React.useState(LOADING);
  const lifecycle = React.useRef({ active: false, epoch: 0, pending: null }).current;
  const cancelRead = React.useCallback(() => {
    const old = lifecycle.pending;
    lifecycle.pending = null;
    old?.controller.abort();
  }, [lifecycle]);
  const load = React.useCallback(() => {
    if (!lifecycle.active) return Promise.resolve();
    if (lifecycle.pending) return lifecycle.pending.promise;
    const controller = new AbortController();
    const work = { controller, promise: null };
    const current = () => lifecycle.active && lifecycle.pending === work;
    // Register before dispatch so overlapping reloads join and Strict Mode
    // cleanup can cancel a read before it starts.
    work.promise = Promise.resolve().then(async () => {
      if (!current()) return;
      setState((previous) => ({ ...previous, status: 'loading', message: '' }));
      let onAbort;
      const interrupted = new Promise((_, reject) => {
        onAbort = () => reject(Error('aborted'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        // Include body consumption in the deadline even if transport ignores abort.
        const data = await Promise.race([interrupted, (async () => {
          const response = await fetch(ENDPOINT, { cache: 'no-store', signal: controller.signal });
          const result = await response.json();
          if (!response.ok || !result || result.source === 'error' || !['live', 'preview', 'error'].includes(result.status)
            || (result.status === 'live' && !Array.isArray(result.templates))) throw new Error('invalid');
          return result;
        })()]);
        if (current()) setState({ status: data.status, templates: data.status === 'live' ? data.templates : [], message: data.message || '' });
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
  }, [lifecycle]);
  React.useEffect(() => {
    lifecycle.active = true;
    setState(LOADING);
    void load();
    return () => { lifecycle.active = false; lifecycle.epoch++; cancelRead(); };
  }, [load, cancelRead, lifecycle]);

  const post = async (body) => {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!data || typeof data.status !== 'string') throw new Error('invalid');
      return data;
    } catch {
      return { status: 'error', message: '응답을 확인하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.' };
    }
  };
  // draft: { id?, name, request, skeleton, revision? } — 새 템플릿은 id를 여기서 한 번 만들어 재시도에도 유지한다.
  const save = async (draft) => {
    const epoch = lifecycle.epoch;
    const result = await post({ action: 'save', id: draft.id, name: draft.name, request: draft.request, skeleton: draft.skeleton, expectedRevision: draft.revision || 0 });
    if (!lifecycle.active || epoch !== lifecycle.epoch) return result;
    if (['saved', 'duplicate'].includes(result.status) && result.template) {
      cancelRead();
      setState((current) => {
        const known = current.templates.find((row) => row.id === result.template.id);
        if (known?.revision > result.template.revision) return current;
        return { ...current, templates: [...current.templates.filter((t) => t.id !== result.template.id), result.template].sort((a, b) => a.name.localeCompare(b.name, 'ko')) };
      });
      // Recover the complete list if the write superseded the initial read.
      void load();
    } else if (result.status === 'conflict') {
      cancelRead();
      void load();
    }
    return result;
  };
  const remove = async (id) => {
    const epoch = lifecycle.epoch;
    const result = await post({ action: 'delete', id });
    if (!lifecycle.active || epoch !== lifecycle.epoch) return result;
    if (result.status === 'deleted') {
      cancelRead();
      setState((current) => ({ ...current, templates: current.templates.filter((t) => t.id !== id) }));
      void load();
    }
    return result;
  };
  return { ...state, reload: load, save, remove };
}
