"use client";

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, EditDrawer, EmptyState, Kbd, LifecycleBadge, SegmentedControl, SelectField, TextAreaField, TextField, TruthBadge } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { DISCOVERY_LABELS, DISCOVERY_LIFECYCLES, DISCOVERY_TARGETS, DISCOVERY_CREATE_PATHS, DISCOVERY_FILTERS, optionsForDiscovery, newDiscovery, discoveryReadState, discoveryBucket, filterDiscoveries, prepareDiscoveryRequest, writeDiscovery } from '@/lib/discovery-client';
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

function DiscoveryEditor({ initial, source, onClose, onSaved }) {
  const [draft, setDraft] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [conflict, setConflict] = React.useState(null);
  const pending = React.useRef(null);
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
  const field = key => ({ value: draft[key] || '', onChange: e => edit(key, e.target.value) });
  return <EditDrawer title={isNew ? '새로운 기회' : '기회 탐색'} subtitle={isNew ? '가능성 한 줄이면 충분해요.' : '확인한 사실과 다음 작은 행동을 이어가세요.'} record={draft} fields={[]} onChange={edit} onSave={save} onClose={onClose} width="min(640px, 96vw)" saveLabel={isNew ? '기회 남기기' : '변경사항 저장'}>
    <div className="discovery-editor">
      <fieldset disabled={busy}>
        <TextField label="가능성 한 줄" required maxLength={300} placeholder="어떤 새로운 가능성이 보이나요?" {...field('title')} />
        <div className="discovery-two-col">
          <SelectField label="업무 구분" options={optionsForDiscovery({personal:'개인',classin:'회사'})} {...field('orgScope')} />
          <SelectField label="발견 방식" options={optionsForDiscovery({capture:'일상에서 포착',research:'직접 찾아 발굴'})} {...field('discoveryMode')} />
        </div>
        {isNew ? <details className="discovery-section"><summary>근거와 생각 더 남기기 <span>선택</span></summary>{TEXT_FIELDS.slice(0,3).map(([key,label,placeholder]) => <TextAreaField key={key} label={label} placeholder={placeholder} maxLength={4000} rows={3} {...field(key)} />)}</details> : <>
          <div className="discovery-two-col"><SelectField label="진행 단계" options={optionsForDiscovery(DISCOVERY_LABELS)} {...field('status')} /><TextField label="다시 볼 날짜" type="date" value={draft.reviewDate || ''} onChange={e => edit('reviewDate',e.target.value || null)} /></div>
          {TEXT_FIELDS.map(([key,label,placeholder]) => <TextAreaField key={key} label={label} placeholder={placeholder} maxLength={4000} rows={3} {...field(key)} />)}
          {draft.status === 'paused' && <TextAreaField label="다시 시작할 조건" placeholder="날짜를 정하기 어렵다면 어떤 변화가 생길 때 다시 볼까요?" maxLength={4000} rows={2} {...field('resumeCondition')} />}
          {['paused','closed'].includes(draft.status) && <TextAreaField label="판단 이유" placeholder="보류하거나 마무리한 이유를 남겨주세요." maxLength={4000} rows={2} required={draft.status === 'closed'} {...field('decisionReason')} />}
          <DiscoveryLinks links={draft.links} onChange={value => edit('links',value)} disabled={busy} />
        </>}
      </fieldset>
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
  const [filter, setFilter] = React.useState('active');
  const [editing, setEditing] = React.useState(null);
  const [notice, setNotice] = React.useState('');
  const [loadingMore, setLoadingMore] = React.useState(false);
  const moreController = React.useRef(null);
  const today = todayKey();
  const openNew = React.useCallback(() => setEditing(newDiscovery(crypto.randomUUID(),scope)), [scope]);
  React.useEffect(() => {
    const controller = new AbortController();
    moreController.current?.abort(); setLoadingMore(false);
    setState({ status: 'loading', records: [] });
    readDiscovery('/api/hub/discovery',controller.signal).then(d => { if (!controller.signal.aborted) setState({ ...d, nextOffset: d.records.length }); })
      .catch(() => { if (!controller.signal.aborted) setState(discoveryReadState(null)); });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [version]);
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
  const records = filterDiscoveries(state.records,{scope,query,filter,today});
  const scoped = filterDiscoveries(state.records,{scope});
  const loadMore = async () => {
    if (loadingMore) return;
    const controller = new AbortController(); moreController.current = controller; setLoadingMore(true);
    try {
      const d = await readDiscovery(`/api/hub/discovery?offset=${state.nextOffset}`, controller.signal);
      if (controller.signal.aborted) return;
      if (d.status !== 'live') setNotice('이전 기회를 불러오지 못했어요. 다시 시도해 주세요.');
      else setState(s => ({ ...s, hasMore: d.hasMore, nextOffset: s.nextOffset + d.records.length, records: [...s.records, ...d.records.filter(r => !s.records.some(old => old.id === r.id))] }));
    } catch { if (!controller.signal.aborted) setNotice('이전 기회를 불러오지 못했어요. 다시 시도해 주세요.'); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };
  const saved = record => {
    setState(s => ({ ...s, status:'live', records:[record,...s.records.filter(r=>r.id!==record.id)] }));
    setNotice('기회를 저장했어요.'); refresh();
  };
  return <div className="discovery-page fade-up">
    <header className="discovery-header"><div><span className="discovery-eyebrow">다음 가능성을 만드는 곳</span><h2>기회 탐색</h2><p>작은 신호를 발견하고, 확인하고, 실제 일로 이어가세요.</p></div><Button variant="primary" icon="plus" size="md" onClick={openNew}>기회 남기기 <Kbd>N</Kbd></Button></header>
    {state.hasMore && <p className="discovery-hint">불러온 기록 기준 현황입니다. 이전 기회 더 보기로 검색 범위를 넓힐 수 있어요.</p>}
    <div className="discovery-overview" aria-label="기회 현황">{[['new','새로 포착','아직 판단하지 않은 가능성'],['active','진행 중','다음 작은 행동으로 확인하기'],['review','다시 볼 기회','검토 날짜가 된 기록']].map(([key,label,desc]) => <button className="hub-card-link" type="button" key={key} onClick={()=>setFilter(key)} aria-pressed={filter===key}><span>{label}</span><strong className="stat">{state.status === 'live' ? filterDiscoveries(scoped,{filter:key,today}).length : '—'}</strong><small>{desc}</small></button>)}</div>
    <div className="discovery-toolbar"><SegmentedControl label="기회 업무 구분" options={SCOPES} value={scope} onChange={changeScope} /><TextField label="기회 검색" value={query} placeholder="가능성·근거·검증 내용 검색" onChange={e=>setQuery(e.target.value)} /></div>
    <div className="discovery-list-heading"><div className="discovery-filter-scroll"><SegmentedControl label="기회 목록 필터" options={DISCOVERY_FILTERS} value={filter} onChange={setFilter} /></div><Button variant="ghost" onClick={refresh} disabled={state.status==='loading'}>다시 불러오기</Button></div>
    <div className="discovery-feedback" role="status"><TruthBadge state={state.status} /><span>{notice}</span></div>
    {state.status==='loading' ? <div className="discovery-loading" role="status">기회를 불러오고 있어요…</div> : state.status !== 'live' ? <EmptyState icon="search" title={state.status==='preview' ? '저장소 연결이 필요해요' : '기회를 불러오지 못했어요'} description={state.message || '연결을 확인한 뒤 다시 불러와 주세요.'} action={<Button variant="outline" onClick={refresh}>다시 불러오기</Button>} /> : records.length === 0 ? <EmptyState icon="search" title={scoped.length ? '조건에 맞는 기회가 없어요' : '아직 이름 없는 가능성부터'} description={scoped.length ? '검색이나 필터를 바꿔 다른 기회를 살펴보세요.' : '대화에서 발견한 문제, 새로 해보고 싶은 일, 직접 찾아볼 분야를 남겨보세요.'} action={<Button variant="outline" onClick={scoped.length ? ()=>{setQuery('');setFilter('all');} : openNew}>{scoped.length ? '검색·필터 지우기' : '첫 기회 남기기'}</Button>} /> : <ul className="discovery-list">{records.map(r=><li key={r.id}><button type="button" className="hub-row" onClick={()=>setEditing(r)}><div className="discovery-row-main"><div className="discovery-row-title"><strong>{r.title}</strong><LifecycleBadge state={DISCOVERY_LIFECYCLES[r.status]} label={DISCOVERY_LABELS[r.status]} /></div><p>{r.experiment || r.hypothesis || r.evidence || '다음에 확인할 질문을 남겨보세요.'}</p><div className="discovery-meta"><span>{r.orgScope==='classin'?'회사':'개인'}</span><span>{r.discoveryMode==='research'?'직접 발굴':'일상에서 포착'}</span>{r.links.length>0 && <span>연결 <span className="num">{r.links.length}</span>건</span>}</div></div><div className="discovery-row-end">{r.reviewDate && <><span>{r.reviewDate<=today && r.status!=='closed'?'다시 볼 시점':'검토 예정'}</span><time className="mono">{r.reviewDate}</time></>}<Iconed name="chevronR" size={14}/></div></button></li>)}</ul>}
    {state.hasMore && <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? '이전 기회를 불러오는 중…' : '이전 기회 더 보기'}</Button>}
    {editing && <DiscoveryEditor key={editing.id} initial={editing} source={state.status} onClose={()=>setEditing(null)} onSaved={saved}/>}
  </div>;
}
