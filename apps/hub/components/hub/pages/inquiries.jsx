"use client";

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Drawer, EmptyState, Kbd, SegmentedControl, SelectField, Skeleton, TextAreaField, TextField, TruthBadge } from '../hub-primitives';
import { InquiryConnection } from '../inquiry-connection';
import { usePageCreateHotkey } from '../use-crm-keyboard';
import { inquiryScopeForWorkspace } from '../workspace-map';
import { INQUIRY_KINDS, INQUIRY_SCOPES, INQUIRY_SOURCES, INQUIRY_STATUSES, inquiryReadState, inquirySeenSequence, inquiryTime, optionsFor, safeInquiryUrl, writeInquiry } from '../inquiry-view-state';
import { linkInquiry, readInquiryProduct } from './product-client.js';
import './inquiries.css';

const FILTERS = [{ key: 'active', label: '진행 중' }, { key: 'unread', label: '미확인' }, { key: 'closed', label: '완료' }, { key: 'ignored', label: '제외' }, { key: 'all', label: '전체' }];
const blankDraft = () => ({ subject: '', body: '', contact_name: '', contact_email: '', contact_phone: '', kind: 'general', org_scope: 'unclassified' });

function InquiryFields({ draft, setDraft, create = false }) {
  const field = key => ({ value: draft[key] || '', onChange: e => setDraft(d => ({ ...d, [key]: e.target.value })) });
  return <>
    <TextField label="제목" required maxLength={300} {...field('subject')} />
    {create && <TextAreaField label="문의 내용" required rows={7} maxLength={20000} {...field('body')} />}
    <TextField label="이름" maxLength={160} {...field('contact_name')} />
    <TextField label="이메일" type="email" maxLength={254} {...field('contact_email')} />
    <TextField label="연락처" type="tel" maxLength={80} {...field('contact_phone')} />
    <SelectField label="문의 유형" options={optionsFor(INQUIRY_KINDS)} {...field('kind')} />
    <SelectField label="업무 구분" options={optionsFor(INQUIRY_SCOPES).filter(o => o.value !== 'all')} {...field('org_scope')} />
    {!create && <>
      <SelectField label="처리 상태" options={optionsFor(INQUIRY_STATUSES)} {...field('status')} />
      <SelectField label="문의 판정" options={optionsFor({ inquiry: '문의', review: '확인 필요', ignored: '문의 아님' })} {...field('classification')} />
    </>}
  </>;
}

function ReferenceFields({ draft, setDraft, links = [] }) {
  const [state, setState] = React.useState({ status: 'loading' });
  const [query, setQuery] = React.useState('');
  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/hub/inquiries/references?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const d = await r.json();
        if (!controller.signal.aborted) setState(r.ok ? d : { status: 'error' });
      } catch { if (!controller.signal.aborted) setState({ status: 'error' }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <>
    <TextField label="연결할 고객·거래 검색" value={query} onChange={e => { setQuery(e.target.value); setState({ status: 'loading' }); }} placeholder="이름 또는 제목" />
    {state.status === 'error' && <p className="inquiry-error" role="alert">연결할 내역을 불러오지 못했습니다. 검색어를 바꿔 다시 확인해 주세요.</p>}
    {state.status === 'live' && ['lead', 'deal', 'case'].map((type, i) => {
      const key = `${type}_id`, rows = state[`${type}s`] || [];
      const options = [{ value: '', label: '연결 없음' }, ...rows.map(row => ({ value: row.id, label: row.name || row.title || row.email || '이름 없음' }))];
      if (draft[key] && !rows.some(r => r.id === draft[key])) options.push({ value: draft[key], label: links.find(l => l.id === draft[key] && l.status === 'live')?.label || '현재 연결 유지' });
      return <SelectField key={key} label={['리드 연결', '거래 연결', '지원 건 연결'][i]} options={options} value={draft[key] || ''} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value || null }))} />;
    })}
    {state.hasMore && <p className="inquiry-notice">검색 결과가 많습니다. 이름을 입력해 범위를 좁혀 주세요.</p>}
  </>;
}

function CreateInquiry({ onClose, onSaved, scope }) {
  const [draft, setDraft] = React.useState(() => ({ ...blankDraft(), org_scope: scope === 'all' ? 'unclassified' : scope }));
  const idempotencyKey = React.useRef(null);
  const receivedAt = React.useRef(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const save = async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    idempotencyKey.current ||= crypto.randomUUID();
    receivedAt.current ||= new Date().toISOString();
    try {
      const data = await writeInquiry({ action: 'ingest', externalEventId: idempotencyKey.current, receivedAt: receivedAt.current, subject: draft.subject.trim(), body: draft.body.trim(), contact: { name: draft.contact_name, email: draft.contact_email, phone: draft.contact_phone }, kind: draft.kind, orgScope: draft.org_scope });
      onSaved(data.inquiry?.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <Drawer title="문의 직접 등록" onClose={busy ? undefined : onClose} width="min(540px, 94vw)" footer={<Button type="submit" form="create-inquiry" variant="primary" disabled={busy}>{busy ? '저장 중…' : '문의 등록'}</Button>}>
    <form id="create-inquiry" className="inquiry-form" onSubmit={save}>
      <InquiryFields draft={draft} setDraft={setDraft} create />
      {error && <p className="inquiry-error" role="alert">{error}</p>}
    </form>
  </Drawer>;
}

// 어떤 제품으로 들어온 문의인가(제품 렌즈, 2026-09-25 운영자). 연결 행은 product_inquiry_links에 따로 두어
// 문의 RPC를 건드리지 않는다. 제품 저장소가 아직 없는 DB(0049 전)에서는 칸을 그리지 않는다.
function InquiryProductLink({ inquiryId, onNavigate }) {
  const [state, setState] = React.useState({ status: 'loading', products: [], productId: null });
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('');
  React.useEffect(() => {
    const controller = new AbortController();
    readInquiryProduct(inquiryId, controller.signal).then(data => { if (!controller.signal.aborted) setState(data); }).catch(() => {});
    return () => controller.abort();
  }, [inquiryId]);
  if (state.status === 'loading' || state.status === 'preview' || state.error === 'products-table-missing') return null;
  if (state.status !== 'live') return <p className="inquiry-notice">제품 연결을 읽지 못했습니다.</p>;
  const choose = async productId => {
    setBusy(true); setMessage('');
    const outcome = await linkInquiry(inquiryId, productId || null);
    setBusy(false);
    if (outcome.ok) setState(prev => ({ ...prev, productId: productId || null }));
    else setMessage(outcome.message);
  };
  const options = [{ value: '', label: '제품 없음' }, ...state.products.map(p => ({ value: p.id, label: p.name })),
    ...(state.productId && !state.products.some(p => p.id === state.productId) ? [{ value: state.productId, label: '종료한 제품' }] : [])];
  return <div className="inquiry-toolbar" aria-label="문의 제품">
    <SelectField label="어떤 제품 문의인가요" value={state.productId || ''} disabled={busy} options={options} onChange={e => choose(e.target.value)} fieldStyle={{ flex: '1 1 220px' }} />
    {state.productId && <Button onClick={() => onNavigate?.(`dashboard/work/projects?view=products&product=${state.productId}`)}>제품 보기 ↗</Button>}
    {message && <span role="alert" className="inquiry-notice" style={{ color: 'var(--danger)' }}>{message}</span>}
  </div>;
}

function InquiryDetail({ id, onClose, onSelect, onChanged, onNavigate }) {
  const [detail, setDetail] = React.useState({ status: 'loading', events: [] });
  const [revision, reload] = React.useReducer(n => n + 1, 0);
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState(false), [draft, setDraft] = React.useState(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const [eventError, setEventError] = React.useState(false), [eventsLoading, setEventsLoading] = React.useState(false);
  const splitKeys = React.useRef(new Map());
  React.useEffect(() => {
    const controller = new AbortController();
    if (page === 1) setDetail({ status: 'loading', events: [] });
    setEventsLoading(true); setEventError(false);
    fetch(`/api/hub/inquiries/${encodeURIComponent(id)}?page=${page}`, { signal: controller.signal, cache: 'no-store' }).then(async r => {
      const d = await r.json();
      if (controller.signal.aborted) return;
      if (!r.ok || d.status !== 'live') {
        if (page === 1) setDetail({ status: d.status || 'error', events: [] });
        else setEventError(true);
        return;
      }
      setDetail(prev => ({ ...d, events: page === 1 ? d.events : [...prev.events, ...d.events.filter(e => !prev.events.some(p => p.id === e.id))] }));
    }).catch(() => { if (!controller.signal.aborted) page === 1 ? setDetail({ status: 'error', events: [] }) : setEventError(true); })
      .finally(() => { if (!controller.signal.aborted) setEventsLoading(false); });
    return () => controller.abort();
  }, [id, page, revision]);
  const refresh = () => { setPage(1); reload(); };
  const mutate = async command => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await writeInquiry(command);
      setEditing(false); onChanged();
      if (command.action === 'split' && result.inquiry?.id && result.inquiry.id !== id) onSelect(result.inquiry.id);
      else refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const row = detail.inquiry, seen = inquirySeenSequence(detail);
  return <Drawer title={editing ? '문의 수정' : '문의 상세'} subtitle={row?.subject} onClose={busy ? undefined : onClose} width="min(600px, 94vw)"
    footer={detail.status === 'live' && <div className="inquiry-toolbar">
      {editing ? <><Button variant="primary" form="edit-inquiry" type="submit" disabled={busy}>{busy ? '저장 중…' : '변경 저장'}</Button><Button disabled={busy} onClick={() => setEditing(false)}>수정 취소</Button></>
        : <><Button disabled={busy || !(seen > Number(row.last_read_seq))} onClick={() => mutate({ action: 'mark_read', id, seenSeq: seen })}>현재 내용 읽음 처리</Button>
          <Button disabled={busy} onClick={() => { setDraft(Object.fromEntries(['subject', 'contact_name', 'contact_email', 'contact_phone', 'kind', 'org_scope', 'status', 'classification', 'lead_id', 'deal_id', 'case_id'].map(k => [k, row[k] ?? null]))); setEditing(true); setError(''); }}>수정·연결</Button>
          {row.status !== 'closed' && <Button disabled={busy} onClick={() => mutate({ action: 'update', id, expectedUpdatedAt: row.updated_at, patch: { status: 'closed' } })}>처리 완료</Button>}</>}
    </div>}>
    {detail.status === 'loading' ? <Skeleton lines={5} height={14} gap={10} label="문의 불러오는 중" />
      : detail.status !== 'live' ? <EmptyState icon={detail.status === 'not-found' || detail.status === 'preview' ? 'inbox' : 'x'} title={detail.status === 'not-found' ? '문의를 찾을 수 없습니다' : detail.status === 'preview' ? '문의 저장소 연결 필요' : '문의를 불러오지 못했습니다'} action={<Button onClick={refresh}>다시 확인</Button>} />
      : editing ? <form id="edit-inquiry" className="inquiry-form" onSubmit={e => { e.preventDefault(); mutate({ action: 'update', id, expectedUpdatedAt: row.updated_at, patch: draft }); }}>
        <InquiryFields draft={draft} setDraft={setDraft} />
        <ReferenceFields draft={draft} setDraft={setDraft} links={detail.links} />
      </form> : <>
        <div className="inquiry-toolbar"><Badge>{INQUIRY_STATUSES[row.status]}</Badge><Badge>{INQUIRY_KINDS[row.kind]}</Badge><Badge>{INQUIRY_SCOPES[row.org_scope]}</Badge>{row.classification === 'review' && <Badge>확인 필요</Badge>}</div>
        <p className="inquiry-notice">{row.contact_name || '이름 없음'} · {row.contact_email || row.contact_phone || '연락처 없음'}</p>
        <p className="inquiry-notice">{row.reason || '직접 등록'} · 읽음 처리는 처리 상태를 바꾸지 않습니다.</p>
        <div className="inquiry-toolbar" aria-label="연결된 내역">
          {(detail.links || []).length ? detail.links.map(link => link.status === 'live'
            ? <Button key={link.type} onClick={() => onNavigate?.(link.href)}>{link.typeLabel}: {link.label} ↗</Button>
            : <span className="inquiry-notice" key={link.type}>{link.typeLabel} 연결 {link.status === 'not-found' ? '내역 없음' : '확인 실패'}</span>)
            : <span className="inquiry-notice">연결된 고객·거래·지원 건 없음</span>}
        </div>
        <InquiryProductLink inquiryId={id} onNavigate={onNavigate} />
        {(detail.events || []).map(event => {
          const url = safeInquiryUrl(event.source_url);
          return <article className="inquiry-event" key={event.id}>
            <div className="inquiry-meta"><span>{INQUIRY_SOURCES[event.source] || '문의'}</span><span className="mono">{inquiryTime(event.received_at)}</span>{url && <a href={url} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>}</div>
            <pre>{event.body || '본문 없음'}</pre>
            {detail.eventTotal > 1 && <Button size="sm" disabled={busy} onClick={() => { if (!splitKeys.current.has(event.id)) splitKeys.current.set(event.id, crypto.randomUUID()); mutate({ action: 'split', id, eventId: event.id, idempotencyKey: splitKeys.current.get(event.id) }); }}>별도 문의로 분리</Button>}
          </article>;
        })}
        {(detail.hasMoreEvents || eventError) && <Button disabled={eventsLoading} onClick={() => eventError ? reload() : setPage(p => p + 1)}>{eventsLoading ? '불러오는 중…' : eventError ? '이전 내역 다시 불러오기' : '이전 내역 더 보기'}</Button>}
      </>}
    {error && <div role="alert" className="inquiry-error">{error} <Button disabled={busy} onClick={() => { setEditing(false); setError(''); refresh(); }}>최신 내역으로 다시 시작</Button></div>}
  </Drawer>;
}

export function Inquiries({ onNavigate }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const scope = inquiryScopeForWorkspace(params.get('scope'));
  const filter = FILTERS.some(f => f.key === params.get('filter')) ? params.get('filter') : 'active';
  const [source, setSource] = React.useState('all'), [kind, setKind] = React.useState('all'), [page, setPage] = React.useState(1);
  const [revision, refresh] = React.useReducer(n => n + 1, 0);
  const [state, setState] = React.useState({ status: 'loading', rows: [] });
  const creating = params.get('new') === 'inquiry', selected = params.get('inquiry');
  const navigateQuery = React.useCallback(patch => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) value ? next.set(key, value) : next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);
  React.useEffect(() => { setPage(1); }, [scope, filter, source, kind]);
  React.useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', rows: [] });
    const query = new URLSearchParams({ scope, filter, source, kind, page: String(page) });
    fetch(`/api/hub/inquiries?${query}`, { cache: 'no-store', signal: controller.signal }).then(async r => {
      const d = await r.json(); if (!controller.signal.aborted) setState(inquiryReadState(r.ok ? d : null));
    }).catch(() => { if (!controller.signal.aborted) setState(inquiryReadState(null)); });
    return () => controller.abort();
  }, [scope, filter, source, kind, page, revision]);
  React.useEffect(() => { window.addEventListener('moonlight:inquiries-changed', refresh); return () => window.removeEventListener('moonlight:inquiries-changed', refresh); }, []);
  const openCreate = React.useCallback(() => navigateQuery({ new: 'inquiry', inquiry: null }), [navigateQuery]);
  // 페이지 N — 공유 훅이 입력 포커스·드로어·팔레트에서 스스로 양보한다(§8.1).
  usePageCreateHotkey(openCreate, { enabled: !creating && !selected });
  // 좁은 화면(≤600px)에서 보조 필터 3개가 세로로 쌓여 첫 행을 접힘 아래로 밀었다 — 상태 세그먼트는
  // 그대로 두고 보조 필터만 "필터" 토글 뒤로 접는다. 데스크톱은 토글이 숨고 필터가 항상 보인다.
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const secondaryFilterCount = [scope !== 'all', source !== 'all', kind !== 'all'].filter(Boolean).length;
  const resetSecondaryFilters = () => { setSource('all'); setKind('all'); };
  return <div className="hub-page inquiries-page">
    <div className="hub-page-header inquiry-toolbar" style={{ justifyContent: 'space-between' }}>
      <div><h2 style={{ fontSize: 20, margin: 0, fontWeight: 500 }}>문의 내역</h2><p className="inquiry-notice">메일과 랜딩페이지 문의를 한곳에서 확인하고 처리합니다.</p></div>
      <Button variant="primary" onClick={openCreate}>문의 등록 <Kbd>N</Kbd></Button>
    </div>
    <InquiryConnection compact />
    <div className="inquiry-toolbar" style={{ justifyContent: 'space-between' }}>
      <SegmentedControl label="문의 상태" options={FILTERS} value={filter} onChange={value => navigateQuery({ filter: value })} />
      <div className="inquiry-toolbar"><TruthBadge state={state.status} label={state.status === 'live' ? '조회됨' : undefined} /><span className="num" style={{ fontSize: 12 }}>{state.unreadCount == null ? '미확인 개수 확인 전' : `미확인 ${state.unreadCount}건`}</span><Button onClick={refresh}>새로고침</Button></div>
    </div>
    <span className="inquiry-filter-toggle">
      <Button variant="outline" icon="filter" aria-expanded={filtersOpen} aria-controls="inquiry-filters" onClick={() => setFiltersOpen(open => !open)}>
        {filtersOpen ? '필터 접기' : '필터'}{secondaryFilterCount > 0 && <span className="num"> · {secondaryFilterCount}</span>}
      </Button>
    </span>
    <div id="inquiry-filters" className="inquiry-filters" data-open={filtersOpen ? 'true' : 'false'}>
      <SelectField label="업무 구분" options={optionsFor(INQUIRY_SCOPES)} value={scope} onChange={e => navigateQuery({ scope: e.target.value })} />
      <SelectField label="접수 경로" options={optionsFor(INQUIRY_SOURCES)} value={source} onChange={e => setSource(e.target.value)} />
      <SelectField label="문의 유형" options={optionsFor({ all: '모든 유형', ...INQUIRY_KINDS })} value={kind} onChange={e => setKind(e.target.value)} />
    </div>
    <div className="inquiry-list" aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <Skeleton lines={5} height={44} gap={12} label="문의 불러오는 중" style={{ padding: 16 }} />
        : state.status !== 'live' || !state.rows.length ? <EmptyState icon={state.status === 'error' ? 'x' : 'inbox'} title={state.status === 'error' ? '문의 내역을 불러오지 못했습니다' : state.status === 'preview' ? '문의 저장소 연결 필요' : '이 조건에 맞는 문의가 없습니다'} description={state.status === 'error' ? '조회에 실패했습니다. 지금 화면은 비어 보여도 실제 문의가 있을 수 있습니다.' : state.status === 'preview' ? '연결이 완료되면 실제 문의가 표시됩니다.' : null}
          action={state.status === 'error' ? <Button onClick={refresh}>다시 시도</Button>
            : state.status === 'live' ? (source !== 'all' || kind !== 'all' ? <Button onClick={resetSecondaryFilters}>경로·유형 필터 해제</Button> : <Button variant="primary" onClick={openCreate}>문의 등록</Button>)
            : null} />
        : state.rows.map(row => <button key={row.id} className="hub-row inquiry-row" data-unread={row.unread} onClick={() => navigateQuery({ inquiry: row.id, new: null })}>
          <div><div className="inquiry-subject" style={{ fontWeight: row.unread ? 600 : 400 }}>{row.subject}</div><div className="inquiry-meta"><span>{row.contact_name || row.contact_email || '연락처 없음'}</span><span>{(row.sources || []).map(s => INQUIRY_SOURCES[s]).join(' · ')}</span>{row.unread && <span>미확인</span>}</div></div>
          <div className="inquiry-meta"><span>{INQUIRY_KINDS[row.kind]} · {INQUIRY_SCOPES[row.org_scope]}</span><span>{INQUIRY_STATUSES[row.status]}{row.classification === 'review' ? ' · 확인 필요' : ''}</span></div>
          <time className="mono inquiry-meta" dateTime={row.received_at}>{inquiryTime(row.received_at)}</time>
        </button>)}
    </div>
    {state.status === 'live' && <div className="inquiry-toolbar" style={{ justifyContent: 'flex-end' }}><span className="num inquiry-notice">{state.total}건 · {page}페이지</span><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</Button><Button disabled={!state.hasMore} onClick={() => setPage(p => p + 1)}>다음</Button></div>}
    {creating && <CreateInquiry scope={scope} onClose={() => navigateQuery({ new: null })} onSaved={id => { refresh(); navigateQuery({ new: null, inquiry: id || null }); }} />}
    {selected && !creating && <InquiryDetail key={selected} id={selected} onClose={() => navigateQuery({ inquiry: null })} onSelect={id => navigateQuery({ inquiry: id })} onChanged={refresh} onNavigate={onNavigate} />}
  </div>;
}
