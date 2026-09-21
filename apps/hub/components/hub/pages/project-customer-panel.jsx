"use client";

import React from 'react';
import { Button, EmptyState, Skeleton, TextField, TruthBadge } from '../hub-primitives';
import { RelatedMemos } from '../related-memos';
import { useCustomerContext } from '../use-customer-context';
import { fetchJournal } from './use-memos';
import { projectCustomerHref, projectCustomerPatch, projectCustomerRef, projectMemoContexts } from '@/lib/project-customer-context';

const contactLabels = { call: '통화', kakao: '메시지', email: '이메일', meeting: '미팅', visit: '방문', demo: '데모', info_session: '설명회' };
export function contextDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(value));
}


function CustomerPicker({ project, onSaved, onCancel }) {
  const [query, setQuery] = React.useState('');
  const [rows, setRows] = React.useState(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [selected, setSelected] = React.useState(undefined);
  const [busy, setBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const request = React.useRef(0), writing = React.useRef(false);
  React.useEffect(() => () => { request.current++; }, []);
  async function search(event) {
    event?.preventDefault();
    if (busy || saving) return;
    const ticket = ++request.current;
    setBusy(true); setError(''); setRows(null); setHasMore(false); setSelected(undefined);
    try {
      const results = await Promise.all(['lead', 'account'].map(type => fetchJournal(`/contexts?type=${type}&q=${encodeURIComponent(query)}`)));
      if (request.current !== ticket) return;
      if (results.some(result => result.status !== 'live')) throw Error('고객 저장소 연결을 확인해 주세요.');
      setRows(results.flatMap(result => result.contexts || []));
      setHasMore(results.some(result => result.hasMore));
    } catch (failure) { if (request.current === ticket) setError(failure.message); }
    finally { if (request.current === ticket) setBusy(false); }
  }
  async function save() {
    if (writing.current || selected === undefined) return;
    writing.current = true; setSaving(true); setError('');
    try {
      const payload = projectCustomerPatch(project, selected);
      const response = await fetch('/api/hub/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok || data.status !== 'saved') throw Error(data.status === 'conflict'
        ? '다른 곳에서 프로젝트가 바뀌었어요. 닫고 프로젝트를 다시 불러온 뒤 연결해 주세요.' : '연결을 저장하지 못했어요. 선택은 유지됩니다. 다시 시도해 주세요.');
      await onSaved(data.project, selected);
    } catch (failure) { setError(failure.message); }
    finally { writing.current = false; setSaving(false); }
  }
  return <section className="project-focus-stack" aria-label="고객 연결 선택">
    <p className="project-focus-muted">연결할 고객·기관명을 찾아 선택하세요.</p>
    <form className="project-focus-stack" onSubmit={search}>
      <TextField label="고객·기관명 검색" value={query} maxLength={100} disabled={busy || saving} onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} />
      <Button type="submit" variant="outline" disabled={busy || saving}>고객 찾기</Button>
    </form>
    {busy ? <Skeleton lines={3} height={14} label="고객 찾는 중" /> : rows && <div className="project-customer-results" aria-label="찾은 고객">
      {rows.length ? rows.map(row => <Button key={`${row.type}:${row.id}`} className="hub-row" active={selected?.type === row.type && selected?.id === row.id} aria-pressed={selected?.type === row.type && selected?.id === row.id} disabled={saving} onClick={() => setSelected(row)}>
        <span>{row.label}</span><span className="project-focus-muted">{row.type === 'lead' ? '리드' : '계약 고객'}</span>
      </Button>) : <EmptyState title="찾은 고객이 없어요" description="고객·기관명을 바꿔 검색해 주세요." />}
    </div>}
    {hasMore && <p className="project-focus-muted">일부 검색 결과를 표시했어요. 이름을 더 구체적으로 입력해 주세요.</p>}
    {project.entityRef && <Button variant="ghost" disabled={saving} aria-pressed={selected === null} onClick={() => setSelected(null)}>고객 연결 해제</Button>}
    {selected !== undefined && <p role="status">{selected ? `${selected.label} 연결` : '이 프로젝트에서 고객 연결만 해제합니다.'}</p>}
    {error && <p role="alert" className="project-focus-error">{error}</p>}
    <div className="project-focus-actions"><Button variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>
      <Button variant="primary" disabled={selected === undefined || saving} onClick={save}>{saving ? '연결 저장 중…' : '연결 저장'}</Button></div>
  </section>;
}

export function ProjectCustomerPanel({ project, onBack, onSaved, onMemo, onOpenMemo }) {
  const ref = projectCustomerRef(project.entityRef);
  const [selecting, setSelecting] = React.useState(!ref);
  const data = useCustomerContext(ref);
  const customer = data.customer;
  const root = React.useRef(null);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => root.current?.querySelector('input, button')?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div ref={root} className="project-focus-stack" onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!event.nativeEvent.isComposing && event.keyCode !== 229) onBack();
    }
  }}>
    <div className="project-focus-actions"><Button variant="ghost" icon="chevronL" onClick={onBack}>프로젝트로</Button>
      {!selecting && <Button variant="ghost" onClick={() => setSelecting(true)}>연결 변경</Button>}</div>
    {selecting ? <CustomerPicker project={project} onCancel={() => ref ? setSelecting(false) : onBack()} onSaved={async (...args) => { await onSaved(...args); onBack(); }} />
      : data.status === 'loading' ? <Skeleton lines={5} height={16} label="고객 요약 불러오는 중" />
      : data.status === 'error' || data.status === 'preview' ? <EmptyState title={data.status === 'error' ? '고객을 불러오지 못했어요' : '고객 저장소 연결이 필요해요'} description={data.message} action={<Button onClick={data.reload}>다시 불러오기</Button>} />
      : !customer ? <EmptyState title="연결된 고객을 찾을 수 없어요" action={<Button onClick={() => setSelecting(true)}>다른 고객 연결</Button>} /> : <>
        <header><h3 className="project-focus-heading">{customer.label}</h3>{customer.company && customer.company !== customer.label && <p className="project-focus-muted">{customer.company}</p>}</header>
        {data.status === 'partial' && <div role="status"><TruthBadge state="partial" /><p className="project-focus-muted">일부 정보를 확인하지 못했어요.</p><Button variant="ghost" size="sm" onClick={data.reload}>다시 확인</Button></div>}
        <section className="project-focus-section"><h4>다음 약속</h4><p>{customer.nextAction || '아직 정한 다음 행동이 없어요.'}</p>
          {customer.nextAction && <span className="mono project-focus-muted">{customer.dormant ? '기약 없음' : contextDate(customer.nextActionAt)}</span>}</section>
        <section className="project-focus-section"><h4>{data.recent?.scope === 'company' ? '기관 공통 기록' : '최근 대화'}</h4>
          {data.recent ? <><p className="project-focus-excerpt">{data.recent.body}</p><span className="mono project-focus-muted">{contextDate(data.recent.occurredAt)} · {contactLabels[data.recent.kind] || '연락'}</span></>
            : <p className="project-focus-muted">{data.failedSources?.some(name => name.endsWith('activities')) ? '최근 대화를 확인하지 못했어요.' : '직접 연결된 대화 기록이 없어요.'}</p>}</section>
        <Button variant="primary" onClick={() => onMemo(projectMemoContexts(project, customer))}>이 고객에 메모 남기기</Button>
        <RelatedMemos type={ref.type} id={ref.id} onOpen={onOpenMemo} />
        <a className="hub-row project-focus-link" href={projectCustomerHref(ref)} target="_blank" rel="noreferrer">고객 전체 보기 · 새 탭 ↗</a>
      </>}
  </div>;
}
