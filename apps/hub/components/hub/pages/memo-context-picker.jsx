"use client";
import React from 'react';
import { Button, SelectField, TextField, TruthBadge } from '../hub-primitives';
import { CONTEXT_TYPES } from '@/lib/journal-client';
import { fetchJournal } from './use-memos';

export function MemoContextPicker({ selected = [], onChange, disabled = false, types = CONTEXT_TYPES, single = false, label }) {
  const [type, setType] = React.useState(types[0].value), [query, setQuery] = React.useState('');
  const [result, setResult] = React.useState(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const request = React.useRef(0);
  React.useEffect(() => () => { request.current++; }, []);
  async function search() {
    if (disabled || busy) return;
    const ticket = ++request.current;
    setBusy(true); setError('');
    try {
      const data = await fetchJournal(`/contexts?type=${type}&q=${encodeURIComponent(query)}`);
      if (request.current === ticket) setResult(data);
    } catch (failure) { if (request.current === ticket) { setResult(null); setError(failure.message); } }
    finally { if (request.current === ticket) setBusy(false); }
  }
  function choose(context) {
    if (single) onChange([context]);
    else if (!selected.some((row) => row.type === context.type && row.id === context.id) && selected.length < 8) onChange([...selected, context]);
    setResult(null);
  }
  return <div className="memo-context-picker">
    {selected.length > 0 && <ul className="memo-contexts">{selected.map((context) => <li key={`${context.type}:${context.id}`}>
      <span>{CONTEXT_TYPES.find((item) => item.value === context.type)?.label} · {context.label || '연결된 업무'}</span>
      <Button size="xs" disabled={disabled} aria-label={`${context.label || '업무'} 연결 해제`} onClick={() => onChange(selected.filter((row) => row !== context))}>해제</Button>
    </li>)}</ul>}
    <details><summary>{label || (selected.length ? '연결 바꾸기' : '업무 연결하기')} <span className="memo-muted">선택</span></summary>
      <fieldset disabled={disabled || busy} className="memo-stack">
        <div className="memo-fields"><SelectField label="업무 종류" value={type} options={types} onChange={(event) => { setType(event.target.value); setResult(null); }} />
          <TextField label="이름으로 찾기" value={query} maxLength={100} placeholder="연결할 업무 이름" onChange={(event) => { setQuery(event.target.value); setResult(null); }} onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey) return;
            event.preventDefault(); event.stopPropagation(); search();
          }} /></div>
        <Button variant="outline" onClick={search}>{busy ? '찾는 중…' : '업무 찾기'}</Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {result?.status === 'preview' && <TruthBadge state="preview" />}
      {result?.status === 'live' && <div className="memo-context-results">
        {result.contexts.length === 0 ? <p className="memo-muted">찾은 업무가 없어요. 이름을 바꿔 검색해 주세요.</p> : result.contexts.map((context) =>
          <Button key={`${context.type}:${context.id}`} className="hub-row" disabled={disabled || (!single && selected.length >= 8)} onClick={() => choose(context)}>{context.label}</Button>)}
        {result.hasMore && <p className="memo-muted">검색 결과 중 30개를 표시했어요. 이름을 더 구체적으로 입력해 주세요.</p>}
      </div>}
      {selected.length >= 8 && <p className="memo-muted">한 메모에 업무를 8개까지 연결할 수 있어요.</p>}
    </details>
  </div>;
}
