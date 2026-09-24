"use client";

import React from 'react';

// Studio AI 템플릿('AI 요청문 + 글 틀') 목록. 허브 read 봉투(status)를 읽는다 — HTTP 200이어도 error일 수 있다.
const ENDPOINT = '/api/hub/content/templates';

export function useContentTemplates() {
  const [state, setState] = React.useState({ status: 'loading', templates: [], message: '' });
  const load = React.useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', message: '' }));
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!data || !['live', 'preview', 'error'].includes(data.status)) throw new Error('invalid');
      setState({ status: data.status, templates: Array.isArray(data.templates) ? data.templates : [], message: data.message || '' });
    } catch {
      setState({ status: 'error', templates: [], message: 'AI 템플릿을 불러오지 못했어요. 다시 시도해 주세요.' });
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

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
    const result = await post({ action: 'save', id: draft.id, name: draft.name, request: draft.request, skeleton: draft.skeleton, expectedRevision: draft.revision || 0 });
    if (['saved', 'duplicate'].includes(result.status) && result.template) {
      setState((current) => ({ ...current, templates: [...current.templates.filter((t) => t.id !== result.template.id), result.template].sort((a, b) => a.name.localeCompare(b.name, 'ko')) }));
    }
    return result;
  };
  const remove = async (id) => {
    const result = await post({ action: 'delete', id });
    if (result.status === 'deleted') setState((current) => ({ ...current, templates: current.templates.filter((t) => t.id !== id) }));
    return result;
  };
  return { ...state, reload: load, save, remove };
}
