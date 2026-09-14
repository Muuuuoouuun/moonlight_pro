"use client";

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, EditDrawer, EmptyState, Kbd, LifecycleBadge, SegmentedControl, SelectField, TextAreaField, TextField, TruthBadge } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { DISCOVERY_LABELS, DISCOVERY_LIFECYCLES, DISCOVERY_TARGETS, DISCOVERY_CREATE_PATHS, DISCOVERY_VIEWS, DISCOVERY_VIEW_COPY, discoveryListUrl, discoveryReviewReason, optionsForDiscovery, newDiscovery, discoveryReadState, prepareDiscoveryRequest, writeDiscovery } from '@/lib/discovery-client';
import { DiscoveryNudge } from '../discovery-nudge';
import './discovery.css';

const SCOPES = [{ key: 'all', label: '전체' }, { key: 'classin', label: '회사' }, { key: 'personal', label: '개인' }];
const TEXT_FIELDS = [
  ['evidence', '발견 근거', '어떤 대화나 장면에서 발견했나요? 원문·링크도 남길 수 있어요.'],
  ['hypothesis', '가치 가설', '누구의 어떤 문제를 어떻게 풀 수 있을까요?'],
  ['experiment', '다음 작은 검증', '무엇을 확인할까요? 가장 작게 해볼 행동을 적어보세요.'],
  ['findings', '검증 결과 · 배운 점', '실제 반응과 나의 해석을 나누어 남겨보세요.'],
];
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function readDiscovery(url, signal, field = 'records') {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const data = await response.json();
  return discoveryReadState(response.ok ? data : null, field);
}

function DiscoveryLinks({ links, onChange, disabled }) {
  const [type, setType] = React.useState('task');
  const [query, setQuery] = React.useState('');
  const [state, setState] = React.useState({ status: 'idle', targets: [] });
  const [version, retry] = React.useReducer(v => v + 1, 0);
  React.useEffect(() => {
    setState({ status: 'idle', targets: [] });
  }, [type, query]);
  // Each requested search is cancelled on a new search, field change, or close.
  React.useEffect(() => {
    if (!version) return;
    const controller = new AbortController();
    setState({ status: 'loading', targets: [] });
    readDiscovery(`/api/hub/discovery?targets=1&type=${type}&q=${encodeURIComponent(query)}`, controller.signal, 'targets')
      .then(d => { if (!controller.signal.aborted) setState(d); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', targets: [] }); });
    return () => controller.abort();
  }, [version, type, query]);
  return <section className="discovery-section" aria-label="실행 연결">
    <h3>실제 일로 연결하기</h3><p>할 일은 실행을, 리드·거래·프로젝트는 구체화된 기회를 이어갑니다.</p>
    {links.length > 0 && <ul className="discovery-links">{links.map(link => <li key={`${link.type}:${link.id}`}>
      <span>{DISCOVERY_TARGETS[link.type]}</span><a href={link.href} target="_blank" rel="noreferrer">{link.title || '연결된 기록'}<Iconed name="arrowUpRight" size={12} /></a>
      <Button variant="ghost" disabled={disabled} onClick={() => onChange(links.filter(l => l.type !== link.type || l.id !== link.id))} aria-label={`${link.title || '기록'} 연결 해제`}>해제</Button>
    </li>)}</ul>}
    <div className="discovery-link-search">
      <SelectField label="연결 종류" options={optionsForDiscovery(DISCOVERY_TARGETS)} value={type} disabled={disabled} onChange={e => { setType(e.target.value); }} />
      <TextField label="연결할 기록 검색" value={query} disabled={disabled} onChange={e => setQuery(e.target.value)} placeholder="이름 또는 제목" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); retry(); } }} />
      <Button variant="outline" disabled={disabled || state.status === 'loading'} onClick={retry}>찾기</Button>
    </div>
    {state.status === 'loading' && <p role="status">연결할 기록을 찾고 있어요…</p>}
    {['error','preview'].includes(state.status) && <div className="discovery-feedback" role="status"><TruthBadge state={state.status} /><span>연결할 기록을 확인하지 못했어요.</span><Button onClick={retry}>다시 찾기</Button></div>}
    {state.status === 'live' && <div className="discovery-targets">
      {state.targets.length === 0 ? <p>일치하는 기록이 없어요. 검색어를 바꾸거나 새로 만들어 주세요.</p> : state.targets.map(target => {
        const exists = links.some(link => link.type === target.type && link.id === target.id);
        return <button type="button" className="hub-row" key={target.id} disabled={disabled || exists || links.length >= 30} onClick={() => onChange([...links, target])}><span>{target.title}</span><span>{exists ? '연결됨' : '+ 연결'}</span></button>;
      })}
      {state.hasMore && <p>결과가 더 있어요. 이름을 구체적으로 입력해 주세요.</p>}
    </div>}
    <a className="discovery-external" href={DISCOVERY_CREATE_PATHS[type]} target="_blank" rel="noreferrer">{DISCOVERY_TARGETS[type]} 만들러 가기 ↗</a><p className="discovery-hint">새 창에서 저장한 뒤, 여기서 찾아 연결해 주세요. 연결은 기회 저장 시 반영됩니다.</p>
  </section>;
}

function DiscoveryHistory({ id }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState({ history: [], hasMore: false });
  const [offset, setOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [version, retry] = React.useReducer(v => v + 1, 0);
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    readDiscovery(`/api/hub/discovery?history=${encodeURIComponent(id)}&offset=${offset}`, controller.signal, 'history')
      .then(d => {
        if (controller.signal.aborted) return;
        if (d.status !== 'live') { setError('저장 이력을 불러오지 못했어요.'); return; }
        setState(previous => ({ ...d, nextOffset: offset + d.history.length, history: offset ? [...previous.history, ...d.history.filter(r => !previous.history.some(old => old.revision === r.revision))] : d.history }));
      })
      .catch(() => { if (!controller.signal.aborted) setError('저장 이력을 불러오지 못했어요.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, id, version, offset]);
  return <section className="discovery-section">
    <Button variant="ghost" aria-expanded={open} onClick={() => { setOffset(0); setOpen(!open); }}>저장 이력 {open ? '접기' : '보기'}</Button>
    {open && <>
      <ol className="discovery-history">{state.history.map(r => <li key={r.revision}><details><summary>버전 <span className="mono">{r.revision}</span> · {DISCOVERY_LABELS[r.status]} · <time>{new Date(r.updatedAt).toLocaleString('ko-KR')}</time></summary><strong>{r.title}</strong>{TEXT_FIELDS.map(([key,label]) => r[key] && <p key={key}><b>{label}</b><br />{r[key]}</p>)}{r.decisionReason && <p><b>판단 이유</b><br />{r.decisionReason}</p>}</details></li>)}</ol>
      {loading && <p role="status">이력을 불러오고 있어요…</p>}
      {error && <div role="alert"><p>{error}</p><Button disabled={loading} onClick={retry}>다시 불러오기</Button></div>}
      {!error && state.hasMore && <Button disabled={loading} onClick={() => setOffset(state.nextOffset)}>이전 이력 더 보기</Button>}
    </>}
  </section>;
}

function DiscoveryEditor({ initial, source, today, onClose, onSaved, onReload }) {
  const [draft, setDraft] = React.useState(initial);
  const [readOnly, setReadOnly] = React.useState(initial.revision > 0);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [conflict, setConflict] = React.useState(null);
  const pending = React.useRef(null);
  const fieldRefs = React.useRef({});
  const nudgeWriting = React.useRef(false);
  const [nudgeBusy, setNudgeBusy] = React.useState(false);
  const [focusedField, setFocusedField] = React.useState(null);
  React.useEffect(() => { if (!readOnly) fieldRefs.current[focusedField || 'title']?.focus(); }, [readOnly, focusedField]);
  const openField = key => { setFocusedField(key); setReadOnly(false); };
  const nudgeBusyChanged = value => { nudgeWriting.current = value; setNudgeBusy(value); };
  const isNew = initial.revision === 0;
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const edit = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const save = async () => {
    if (busy) return { ok: false };
    if (conflict) return { ok: false, status: 'conflict', message: '현재 기록을 확인하고 사용할 내용을 선택해 주세요.' };
    setBusy(true); setMessage('');
    pending.current = prepareDiscoveryRequest(draft, pending.current);
    const result = await writeDiscovery(pending.current.payload);
    setBusy(false); setMessage(result.message);
    if (result.status === 'conflict' && result.record) setConflict(result.record);
    if (result.ok) onSaved(result.record);
    return result;
  };
  const field = key => ({ ref: node => { fieldRefs.current[key] = node; }, value: draft[key] || '', onChange: e => edit(key, e.target.value) });
  const textField = ([key,label,placeholder]) => <TextAreaField key={key} label={label} placeholder={placeholder} maxLength={4000} rows={focusedField === key ? 5 : 3} {...field(key)} />;
  const identityFields = <>
    <TextField label="가능성 한 줄" required maxLength={300} placeholder="어떤 새로운 가능성이 보이나요?" {...field('title')} />
    <div className="discovery-two-col"><SelectField label="업무 구분" options={optionsForDiscovery({personal:'개인',classin:'회사'})} {...field('orgScope')} /><SelectField label="발견 방식" options={optionsForDiscovery({capture:'일상에서 포착',research:'직접 찾아 발굴'})} {...field('discoveryMode')} /></div>
  </>;
  const decisionFields = <div className="discovery-two-col"><SelectField label="진행 단계" options={optionsForDiscovery(DISCOVERY_LABELS)} {...field('status')} /><TextField label="다시 볼 날짜" type="date" {...field('reviewDate')} onChange={e => edit('reviewDate',e.target.value || null)} /></div>;
  const focusingDecision = ['status','reviewDate'].includes(focusedField);
  const otherFields = <>{identityFields}{!focusingDecision && decisionFields}{TEXT_FIELDS.filter(([key]) => key !== focusedField).map(textField)}<DiscoveryLinks links={draft.links} onChange={value => edit('links',value)} disabled={busy} /></>;
  return <EditDrawer title={isNew ? '새로운 기회' : '기회 탐색'} subtitle={isNew ? '가능성 한 줄이면 충분해요.' : '확인한 사실과 다음 작은 행동을 이어가세요.'} record={draft} fields={[]} onChange={edit} onSave={readOnly ? undefined : save} onClose={() => { if (!nudgeWriting.current) onClose(); }} width="min(640px, 96vw)" saveLabel={readOnly ? '닫기' : isNew ? '기회 남기기' : '변경사항 저장'}>
    <div className="discovery-editor">
      {readOnly ? <>
        <div className="discovery-summary-head"><LifecycleBadge state={DISCOVERY_LIFECYCLES[draft.status]} label={DISCOVERY_LABELS[draft.status]} /><Button variant="ghost" disabled={nudgeBusy} onClick={() => openField(null)}>내용 편집</Button></div>
        <h3 className="discovery-summary-title">{draft.title}</h3>
        <p className="discovery-hint">{draft.orgScope === 'classin' ? '회사' : '개인'} · {draft.discoveryMode === 'research' ? '직접 발굴' : '일상에서 포착'} · {discoveryReviewReason(draft,today)}</p>
        <DiscoveryNudge record={draft} onAction={openField} onBusyChange={nudgeBusyChanged} onReload={onReload} />
        <div className="discovery-summary-sections">{TEXT_FIELDS.filter(([key]) => draft[key]?.trim()).map(([key,label]) => <section className="discovery-section" key={key}><h3>{label}</h3><p className="discovery-summary-body">{draft[key]}</p></section>)}</div>
        {(draft.decisionReason || draft.resumeCondition) && <section className="discovery-section"><h3>판단과 재개 조건</h3>{draft.decisionReason && <p className="discovery-summary-body">{draft.decisionReason}</p>}{draft.resumeCondition && <p className="discovery-summary-body">재개 조건 · {draft.resumeCondition}</p>}</section>}
        <section className="discovery-section"><h3>이어진 실제 일</h3>{draft.links.length ? <ul className="discovery-links">{draft.links.map(link => <li key={`${link.type}:${link.id}`}><span>{DISCOVERY_TARGETS[link.type]}</span><a href={link.href} target="_blank" rel="noreferrer">{link.title} ↗</a></li>)}</ul> : <p>연결한 일이 없어요. 내용 편집에서 기존 할 일·리드·거래·프로젝트를 연결할 수 있어요.</p>}</section>
      </> : <fieldset disabled={busy}>
        {isNew ? <>{identityFields}<details className="discovery-section"><summary>근거와 생각 더 남기기 <span>선택</span></summary>{TEXT_FIELDS.slice(0,3).map(textField)}</details></> : <>
          {focusedField ? <>
            <div className="discovery-focused-heading"><span className="discovery-eyebrow">지금 이어갈 행동</span><h3>{draft.title}</h3><p>지금 확인할 내용부터 남겨보세요. 다른 기록은 아래에서 펼칠 수 있어요.</p></div>
            {focusingDecision ? decisionFields : TEXT_FIELDS.filter(([key]) => key === focusedField).map(textField)}
            <details className="discovery-section discovery-other-fields"><summary>다른 기록도 편집</summary><div>{otherFields}</div></details>
          </> : otherFields}
          {draft.status === 'paused' && <TextAreaField label="다시 시작할 조건" placeholder="날짜를 정하기 어렵다면 어떤 변화가 생길 때 다시 볼까요?" maxLength={4000} rows={2} {...field('resumeCondition')} />}
          {['paused','closed'].includes(draft.status) && <TextAreaField label="판단 이유" placeholder="보류하거나 마무리한 이유를 남겨주세요." maxLength={4000} rows={2} required={draft.status === 'closed'} {...field('decisionReason')} />}
        </>}
      </fieldset>}
      {source !== 'live' && <div className="discovery-feedback"><TruthBadge state={source} /><p>저장소 연결을 확인한 뒤 저장할 수 있어요. 입력은 그대로 유지됩니다.</p></div>}
      {message && <p className="discovery-error" role="alert">{message}</p>}
      {conflict && <section className="discovery-conflict" aria-label="다른 저장 내용 확인"><h3>다른 변경이 먼저 저장됐어요</h3><p>현재 기록을 확인해 주세요. 내 입력 전체를 유지하면 아래 저장된 내용도 내 입력으로 교체됩니다.</p><details><summary>현재 저장된 내용</summary><strong>{conflict.title}</strong><p>{DISCOVERY_LABELS[conflict.status]}</p>{TEXT_FIELDS.map(([key,label]) => <p key={key}><b>{label}</b><br />{conflict[key] || '미입력'}</p>)}{[['orgScope','업무 구분'],['discoveryMode','발견 방식'],['reviewDate','다시 볼 날짜'],['resumeCondition','재개 조건'],['decisionReason','판단 이유']].map(([key,label]) => <p key={key}><b>{label}</b><br />{({personal:'개인',classin:'회사',capture:'일상에서 포착',research:'직접 발굴'})[conflict[key]] || conflict[key] || '미입력'}</p>)}<p><b>실행 연결</b><br />{conflict.links.length ? conflict.links.map(link => `${DISCOVERY_TARGETS[link.type]} · ${link.title}`).join('\n') : '연결 없음'}</p></details><div className="discovery-actions"><Button disabled={busy} onClick={() => { setDraft(conflict); setConflict(null); pending.current = null; setMessage('현재 저장된 기록을 불러왔어요.'); }}>저장된 기록 사용</Button><Button disabled={busy} onClick={() => { edit('revision',conflict.revision); setConflict(null); pending.current = null; setMessage('내 입력을 유지했어요. 저장 버튼으로 반영하세요.'); }}>내 입력 전체 유지</Button></div></section>}
      {!isNew && <DiscoveryHistory id={draft.id} />}
    </div>
  </EditDrawer>;
}

export function Discovery() {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const scope = ['classin','personal'].includes(params.get('scope')) ? params.get('scope') : 'all';
  const [state, setState] = React.useState({ status: 'loading', records: [] });
  const [version, refresh] = React.useReducer(v => v + 1, 0);
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState('discover');
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [due, setDue] = React.useState({status:'loading',records:[]});
  const [editing, setEditing] = React.useState(null);
  const [notice, setNotice] = React.useState('');
  const [loadingMore, setLoadingMore] = React.useState(false);
  const moreController = React.useRef(null);
  const today = state.today || todayKey();
  const listUrl = discoveryListUrl({scope,view,status,q:search});
  const openNew = React.useCallback((mode='capture') => setEditing({...newDiscovery(crypto.randomUUID(),scope),discoveryMode:mode}), [scope]);
  React.useEffect(() => {
    const controller = new AbortController();
    moreController.current?.abort(); setLoadingMore(false);
    setState({ status: 'loading', records: [] });
    readDiscovery(listUrl,controller.signal).then(d => { if (!controller.signal.aborted) setState({ ...d, nextOffset: d.records.length }); })
      .catch(() => { if (!controller.signal.aborted) setState(discoveryReadState(null)); });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [version,listUrl]);
  React.useEffect(() => {
    const controller = new AbortController();
    setDue({status:'loading',records:[]});
    readDiscovery(discoveryListUrl({scope,view:'due'}),controller.signal)
      .then(d => { if(!controller.signal.aborted) setDue(d); })
      .catch(() => { if(!controller.signal.aborted) setDue(discoveryReadState(null)); });
    return () => controller.abort();
  }, [scope,version]);
  const newRequested = params.get('new') === 'discovery', deepId = params.get('discovery');
  React.useEffect(() => {
    if ((!newRequested && !deepId) || state.status === 'loading' || editing) return;
    const controller = new AbortController();
    const consume = () => { const next = new URLSearchParams(params.toString()); next.delete('new'); next.delete('discovery'); router.replace(`${pathname}${next.size ? `?${next}` : ''}`,{scroll:false}); };
    if (newRequested) { openNew(); consume(); }
    else if (state.status === 'live') {
      const existing = state.records.find(r => r.id === deepId);
      if (existing) { setEditing(existing); consume(); }
      else readDiscovery(`/api/hub/discovery?id=${encodeURIComponent(deepId)}`,controller.signal).then(d => {
        if (controller.signal.aborted) return;
        if (d.status === 'live') { if (d.records[0]) setEditing(d.records[0]); else setNotice('이 기회를 찾을 수 없어요.'); consume(); }
        else setNotice(d.message || '기회를 불러오지 못했어요. 다시 불러오기를 눌러 주세요.');
      }).catch(() => { if (!controller.signal.aborted) setNotice('기회를 불러오지 못했어요. 다시 불러오기를 눌러 주세요.'); });
    }
    return () => controller.abort();
  }, [newRequested, deepId, state, editing, openNew, params, router, pathname]);
  React.useEffect(() => {
    const listener = e => {
      if (editing || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'n' || e.target.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]') || document.querySelector('[role="dialog"]')) return;
      e.preventDefault(); openNew();
    };
    window.addEventListener('keydown',listener); return () => window.removeEventListener('keydown',listener);
  }, [editing,openNew]);
  const changeScope = value => { const next = new URLSearchParams(params.toString()); next.delete('scope'); if(value !== 'all') next.set('scope',value); router.replace(`${pathname}${next.size ? `?${next}` : ''}`,{scroll:false}); };
  const records = state.records;
  const changeView = value => { setView(value); setStatus('all'); };
  const clearFilters = () => { setQuery(''); setSearch(''); setStatus('all'); setView('all'); };
  const loadMore = async () => {
    if (loadingMore) return;
    const controller = new AbortController(); moreController.current = controller; setLoadingMore(true);
    try {
      const d = await readDiscovery(discoveryListUrl({scope,view,status,q:search,offset:state.nextOffset}), controller.signal);
      if (controller.signal.aborted) return;
      if (d.status !== 'live') setNotice('이전 기회를 불러오지 못했어요. 다시 시도해 주세요.');
      else setState(s => ({ ...s, hasMore: d.hasMore, nextOffset: s.nextOffset + d.records.length, records: [...s.records, ...d.records.filter(r => !s.records.some(old => old.id === r.id))] }));
    } catch { if (!controller.signal.aborted) setNotice('이전 기회를 불러오지 못했어요. 다시 시도해 주세요.'); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };
  const reloadEditing = async () => {
    const d = await readDiscovery(`/api/hub/discovery?id=${encodeURIComponent(editing.id)}`);
    if (d.status !== 'live' || !d.records[0]) return false;
    setEditing(d.records[0]); refresh(); return true;
  };
  const saved = record => {
    setState(s => ({ ...s, status:'live', records:[record,...s.records.filter(r=>r.id!==record.id)] }));
    setNotice('기회를 저장했어요.'); refresh();
  };
  return <div className="discovery-page fade-up">
    <header className="discovery-header"><div><span className="discovery-eyebrow">다음 가능성을 만드는 곳</span><h2>기회 탐색</h2><p>발견한 가능성을 작은 검증과 실제 일로 이어가세요.</p></div><Button variant="primary" icon="plus" size="md" onClick={()=>openNew()}>기회 남기기 <Kbd>N</Kbd></Button></header>
    <div className="discovery-workflow"><div className="discovery-filter-scroll"><SegmentedControl label="기회 탐색 작업" options={DISCOVERY_VIEWS} value={view} onChange={changeView} /></div><p>{DISCOVERY_VIEW_COPY[view]}</p></div>
    {view === 'discover' && <section className="discovery-entry"><div><h3>어디에서 시작할까요?</h3><p>발견한 장면을 남기거나, 알아보고 싶은 질문 하나를 정해 보세요.</p></div><Button variant="outline" onClick={()=>openNew('research')}>관심 질문으로 시작</Button></section>}
    {!editing && !search && due.status==='live' && due.records.length>0 && <section className="discovery-review-strip" aria-label="다시 보기로 한 기회">{due.records.slice(0,3).map(record=><DiscoveryNudge key={record.id} record={record} compact onOpen={()=>setEditing(record)} />)}</section>}
    {due.status==='error' && <div className="discovery-feedback"><TruthBadge state="error" /><span>다시 볼 기회를 확인하지 못했어요.</span><Button variant="ghost" onClick={refresh}>다시 확인</Button></div>}
    <form className="discovery-toolbar" onSubmit={e=>{e.preventDefault();setSearch(query.trim());}}><SegmentedControl label="기회 업무 구분" options={SCOPES} value={scope} onChange={changeScope} /><div className="discovery-search"><TextField label="전체 기록 검색" value={query} maxLength={300} placeholder="가능성·근거·검증 내용" onChange={e=>setQuery(e.target.value)} /><Button type="submit" variant="outline">검색</Button></div></form>
    <div className="discovery-list-heading"><SelectField label="진행 상태" options={[{value:'all',label:'모든 상태'},...optionsForDiscovery(DISCOVERY_LABELS)]} value={status} onChange={e=>setStatus(e.target.value)} /><Button variant="ghost" onClick={refresh} disabled={state.status==='loading'}>다시 불러오기</Button></div>
    {search && <div className="discovery-feedback"><span>전체 기록에서 “{search}” 검색 · 선택한 작업/업무/상태 조건 적용</span><Button variant="ghost" onClick={()=>{setQuery('');setSearch('');}}>검색 지우기</Button></div>}
    <div className="discovery-feedback" role="status"><TruthBadge state={state.status} /><span>{notice}</span></div>
    {state.status==='loading' ? <div className="discovery-loading" role="status">기회를 불러오고 있어요…</div> : state.status !== 'live' ? <EmptyState icon="search" title={state.status==='preview' ? '저장소 연결이 필요해요' : '기회를 불러오지 못했어요'} description={state.message || '연결을 확인한 뒤 다시 불러와 주세요.'} action={<Button variant="outline" onClick={refresh}>다시 불러오기</Button>} /> : records.length === 0 ? <EmptyState icon="search" title="조건에 맞는 기회가 없어요" description="선택한 작업·업무 구분·진행 상태와 검색어에 맞는 기록이 없어요. 전체 기록을 보거나 새로운 가능성을 남겨보세요." action={<><Button variant="outline" onClick={clearFilters}>전체 기록 보기</Button><Button variant="ghost" onClick={()=>openNew()}>기회 남기기</Button></>} /> : <ul className="discovery-list">{records.map(r=><li key={r.id}><button type="button" className="hub-row" onClick={()=>setEditing(r)}><div className="discovery-row-main"><div className="discovery-row-title"><strong>{r.title}</strong><LifecycleBadge state={DISCOVERY_LIFECYCLES[r.status]} label={DISCOVERY_LABELS[r.status]} /></div><p><span>근거</span> {r.evidence || '아직 남긴 근거가 없어요'}</p><p><span>다음 행동</span> {r.experiment || '다음에 확인할 질문을 정해 보세요'}</p><div className="discovery-meta"><span>{r.orgScope==='classin'?'회사':'개인'}</span><span>{r.discoveryMode==='research'?'직접 발굴':'일상에서 포착'}</span>{r.links.length>0 && <span>연결 <span className="num">{r.links.length}</span>건</span>}</div></div><div className="discovery-row-end"><span>{discoveryReviewReason(r,today)}</span><Iconed name="chevronR" size={14}/></div></button></li>)}</ul>}
    {state.hasMore && <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? '이전 기회를 불러오는 중…' : '검색 결과 더 보기'}</Button>}
    {editing && <DiscoveryEditor key={`${editing.id}:${editing.revision}`} initial={editing} source={state.status} today={today} onClose={()=>setEditing(null)} onSaved={saved} onReload={reloadEditing}/>}
  </div>;
}
