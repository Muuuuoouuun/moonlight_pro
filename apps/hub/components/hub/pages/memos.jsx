"use client";
import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Checkbox, EmptyState, Kbd, SelectField, Skeleton, TruthBadge } from '../hub-primitives';
import { journalScopeLabel } from '@/lib/journal';
import { isCanonicalUuid } from '@/lib/uuid';
import { createJournalStore, journalTabId, lastJournalWorkspace, rememberJournalWorkspace } from '@/lib/journal-browser-store';
import { NOTE_QUESTIONS } from '@/lib/journal-client';
import { MemoComposer, memoTime } from './memo-composer';
import { MemoUseComposer } from './memo-use-composer';
import { useMemoDocument } from './use-memos';
import { useMemoSearch } from './use-memo-search';
import { MemoSearchControls } from './memo-search-controls';
import { filtersFromParams, memoSearchParams, memoListHref, memoDocumentHref, memoMatchSegments, MEMO_CHANGED_EVENT } from '@/lib/journal-search-client';
import { MemoPatternPanel } from './memo-pattern-panel';
import { MEMO_SAVED_EVENT } from '@/lib/memo-save';
import { findRelatedMemos } from '@/lib/memo-network';
import './memos.css';

function MemoDocument({ onClose, onReload, ...props }) {
  const model = useMemoDocument(props);
  return model.reuseDraft ? <MemoUseComposer model={model} onReload={onReload} /> : <MemoComposer model={model} isNew={props.isNew} onClose={onClose} onReload={onReload} />;
}
function MatchText({ text, query }) { return memoMatchSegments(text, query).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : <React.Fragment key={index}>{part.text}</React.Fragment>); }
const initial = { status: 'loading', workspaceId: null, entries: [], entry: null, nextCursor: null, workspaceConfirmed: false };
const idlePattern = () => ({ status: 'idle', patterns: [], error: null, code: null, request: null });
// 메모 분석 봉투 판정. 성공은 엔진이 결과를 만든 succeeded(또는 같은 요청의 duplicate)뿐이다.
// 202 preview는 엔진·저장소 연결 전이라는 뜻이고, 그때 오는 patterns는 연결 안내용 자리표시라
// 결과 행으로 그리지 않는다(§5.3 "never show mock work rows beside it"). 나머지는 전부 error.
const PATTERN_ERROR_COPY = {
  'records-not-found': '분석할 메모를 찾지 못했어요. 메모가 저장됐는지 확인해 주세요.',
  'invalid-input': '분석 요청이 올바르지 않아요. 메모를 다시 선택해 주세요.',
  'engine-unreachable': '분석 엔진에 연결하지 못했어요. 엔진이 실행 중인지 확인한 뒤 다시 실행해 주세요.',
  'invalid-analysis-json': '분석 응답을 읽지 못했어요. 메모 선택은 유지했습니다. 같은 요청으로 다시 확인해 주세요.',
  'invalid-analysis-output': '분석 응답의 형식이 올바르지 않아요. 같은 요청으로 다시 확인해 주세요.',
  'generation-failed': '분석 결과를 생성하지 못했어요. 같은 요청으로 다시 확인해 주세요.',
  'no-usable-records': '분석할 본문이 없어요. 저장한 메모 내용을 확인해 주세요.',
  network: '분석 요청을 보내지 못했어요. 연결을 확인한 뒤 다시 실행해 주세요.',
};
export function readPatternEnvelope(response, data) {
  if (response?.ok && ['succeeded', 'duplicate'].includes(data?.status)) {
    return { status: 'live', patterns: Array.isArray(data.patterns) ? data.patterns : [], error: null, code: null };
  }
  if (data?.status === 'preview') return { status: 'preview', patterns: [], error: null, code: data.error || null };
  const code = data?.error || (data?.status === 'invalid-input' ? 'invalid-input' : response ? `http-${response.status}` : 'network');
  return { status: 'error', patterns: [], error: PATTERN_ERROR_COPY[code] || PATTERN_ERROR_COPY[data?.status] || '분석 결과를 받지 못했어요. 다시 실행해 주세요.', code };
}
export function Memos() {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const filters = filtersFromParams(params), searchQuery = memoSearchParams(filters).toString();
  const search = useMemoSearch(searchQuery);
  const noteId = params.get('note'), isNew = params.get('new') === 'note', draftId = params.get('draft');
  const id = isNew ? draftId : noteId;
  const requestKey = `${isNew ? 'new' : 'note'}:${id || ''}:${filters.noteScope}`;
  const fromPreview = params.get('from') === 'preview';
  const contextType = params.get('contextType'), contextId = params.get('contextId');
  const context = React.useMemo(() => contextId ? { type: contextType, id: contextId } : null, [contextType, contextId]);
  const [ledger, setLedger] = React.useState(() => ({ ...initial, workspaceId: lastJournalWorkspace() })), [reload, setReload] = React.useState(0), [error, setError] = React.useState('');
  const [recoveries, setRecoveries] = React.useState([]), [localError, setLocalError] = React.useState(false);
  const analysisReady = ledger.status === 'live' && ledger.workspaceConfirmed && ledger.requestKey === requestKey;
  // A fresh owner object also distinguishes company -> personal -> company.
  const analysisOwner = React.useMemo(() => ({ scope: filters.noteScope, workspaceId: ledger.workspaceId, ready: analysisReady }), [filters.noteScope, ledger.workspaceId, analysisReady]);
  const latestAnalysisOwner = React.useRef(analysisOwner); latestAnalysisOwner.current = analysisOwner;
  const patternControl = React.useRef({ active: false, owner: null, ticket: 0, controller: null }).current;
  const [selection, setSelection] = React.useState({ owner: null, ids: [] });
  const selectedIds = selection.owner === analysisOwner ? selection.ids : [];
  const [patternGoal, setPatternGoal] = React.useState('sales_insight');
  // status: idle | loading | live | preview | error — 분석 라우트의 202 preview를 성공으로 읽지 않는다(§5.3).
  const [patternResult, setPatternState] = React.useState(idlePattern);
  // Hide retired results in the first render, before effect cleanup runs.
  const patternState = patternResult.owner === analysisOwner ? patternResult : idlePattern();
  const patternLoading = patternState.status === 'loading';
  const generation = React.useRef(0), currentLedger = React.useRef(ledger); currentLedger.current = ledger;

  React.useEffect(() => {
    patternControl.owner = analysisOwner; patternControl.active = analysisReady;
    setSelection({ owner: analysisOwner, ids: [] }); setPatternState({ ...idlePattern(), owner: analysisOwner });
    setPatternGoal('sales_insight');
    return () => {
      patternControl.active = false; patternControl.ticket++;
      patternControl.controller?.abort(); patternControl.controller = null;
    };
  }, [analysisOwner, analysisReady, patternControl]);

  const toggleSelect = React.useCallback((memoId, e) => {
    e.stopPropagation();
    if (!patternControl.active || patternControl.owner !== analysisOwner || latestAnalysisOwner.current !== analysisOwner
      || !search.entries.some(row => row.id === memoId)) return;
    setSelection((previous) => {
      const ids = previous.owner === analysisOwner ? previous.ids : [];
      return { owner: analysisOwner, ids: ids.includes(memoId) ? ids.filter(id => id !== memoId) : ids.length < 10 ? [...ids, memoId] : ids };
    });
  }, [analysisOwner, patternControl, search.entries]);

  // 선택 분석과 최근 7일 종합이 같은 라우트·같은 봉투를 쓴다. request를 보관해 preview·error에서
  // 같은 조건으로 다시 실행할 수 있게 한다.
  // 닫기·범위/workspace 전환·언마운트는 transport와 응답 ownership을 함께 취소한다.
  const runAnalysis = React.useCallback(async (request) => {
    if (!patternControl.active || patternControl.owner !== analysisOwner || latestAnalysisOwner.current !== analysisOwner
      || request?.scope !== analysisOwner.scope || request?.workspaceId !== analysisOwner.workspaceId) return;
    patternControl.controller?.abort();
    const controller = new AbortController(), ticket = ++patternControl.ticket;
    patternControl.controller = controller;
    const current = () => patternControl.active && patternControl.owner === analysisOwner && latestAnalysisOwner.current === analysisOwner
      && patternControl.ticket === ticket && patternControl.controller === controller;
    const command = { ...request, requestId: request.requestId || crypto.randomUUID() };
    setPatternState({ status: 'loading', patterns: [], error: null, code: null, request: command, owner: analysisOwner });
    let outcome;
    try {
      const res = await fetch('/api/hub/journal/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      });
      outcome = readPatternEnvelope(res, await res.json().catch(() => null));
    } catch {
      outcome = readPatternEnvelope(null, { error: 'network' });
    }
    if (current()) { setPatternState({ ...outcome, request: command, owner: analysisOwner }); patternControl.controller = null; }
  }, [analysisOwner, patternControl]);

  const runPatternAnalysis = React.useCallback(() => {
    if (selectedIds.length === 0) return;
    runAnalysis({ goal: patternGoal, noteIds: selectedIds, scope: analysisOwner.scope, workspaceId: analysisOwner.workspaceId });
  }, [selectedIds, patternGoal, runAnalysis, analysisOwner]);

  const runWeeklySynthesis = React.useCallback(() => {
    runAnalysis({ goal: 'weekly_synthesis', range: '7d', scope: analysisOwner.scope, workspaceId: analysisOwner.workspaceId });
  }, [runAnalysis, analysisOwner]);
  const closePattern = () => {
    if (latestAnalysisOwner.current !== analysisOwner) return;
    patternControl.ticket++; patternControl.controller?.abort(); patternControl.controller = null;
    setPatternState({ ...idlePattern(), owner: analysisOwner });
  };

  React.useEffect(() => {
    if (!isNew || draftId) return;
    const next = new URLSearchParams(params.toString()); next.set('draft', crypto.randomUUID());
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [isNew, draftId, params, pathname, router]);

  React.useEffect(() => {
    const ticket = ++generation.current; let active = true;
    setLedger((previous) => ({ ...previous, status: 'loading', entry: null })); setError('');
    const queryParams = new URLSearchParams();
    if (noteId && !isNew) queryParams.set('note', noteId);
    if (filters.noteScope) queryParams.set('scope', filters.noteScope);
    const query = queryParams.size ? '?' + queryParams : '';
    async function load() {
      try {
        const response = await fetch('/api/hub/journal' + query, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        if (!active || generation.current !== ticket) return;
        const workspaceConfirmed = isCanonicalUuid(data.workspaceId);
        if (workspaceConfirmed) rememberJournalWorkspace(data.workspaceId);
        if (!response.ok || data.status === 'error' || data.source === 'error' || !['live', 'preview'].includes(data.status)) {
          setLedger({ ...initial, requestKey, workspaceConfirmed, workspaceId: data.workspaceId || currentLedger.current.workspaceId, status: 'error' });
          setError(data.message || '메모를 불러오지 못했어요. 다시 시도해 주세요.');
        } else setLedger({ ...data, workspaceId: data.workspaceId || currentLedger.current.workspaceId, requestKey, workspaceConfirmed });
      } catch {
        if (active && generation.current === ticket) { setLedger((previous) => ({ ...previous, requestKey, status: 'error', workspaceConfirmed: false })); setError('메모 저장소에 연결하지 못했어요. 다시 시도해 주세요.'); }
      }
    }
    load(); return () => { active = false; generation.current++; };
  }, [noteId, isNew, draftId, filters.noteScope, reload]);

  // 빠른 메모(M·⌘K)도 2026-09-20부터 같은 journal 저장소를 쓴다. 저장 이벤트를 듣지 않으면
  // 이 화면에서 메모를 남겨도 새로고침 전까지 목록에 뜨지 않는다(실측). memo-workspace 는
  // 이미 같은 이벤트를 듣고 있었고 이 화면만 빠져 있었다.
  React.useEffect(() => {
    const refresh = () => {
      setReload((value) => value + 1);
      // 화면의 목록은 ledger 가 아니라 검색 훅(useMemoSearch)이 그리고, 그건
      // MEMO_CHANGED_EVENT 만 듣는다. 두 이벤트를 여기서 잇는다 — 저장 지점(quick-memo)이
      // 검색 계층을 알 필요는 없고, 목록을 소유한 이 화면이 아는 것이 맞다.
      window.dispatchEvent(new Event(MEMO_CHANGED_EVENT));
    };
    window.addEventListener(MEMO_SAVED_EVENT, refresh);
    return () => window.removeEventListener(MEMO_SAVED_EVENT, refresh);
  }, []);

  function readRecoveries() {
    try {
      const store = createJournalStore({ storage: sessionStorage, workspaceId: ledger.workspaceId, tabId: journalTabId() });
      const docs = store.list();
      if (ledger.workspaceId) {
        const preview = createJournalStore({ storage: sessionStorage, workspaceId: null, tabId: journalTabId() });
        docs.push(...preview.list().filter((doc) => !store.read(doc.draft.id)).map((doc) => ({ ...doc, fromPreview: true })));
      }
      const visible = docs.filter(doc => !filters.noteScope || (filters.noteScope === 'unclassified' ? doc.draft.noteMeta?.scope === undefined : doc.draft.noteMeta?.scope === filters.noteScope));
      setRecoveries(visible); setLocalError(visible.some((doc) => doc.volatile));
    } catch { setLocalError(true); }
  }
  React.useEffect(() => { if (ledger.status !== 'loading') readRecoveries(); }, [ledger.workspaceId, ledger.status, id, filters.noteScope, reload]);
  function create() {
    if (id || ledger.status === 'loading') return;
    router.push(memoDocumentHref(params, { new: 'note', draft: crypto.randomUUID() }), { scroll: false });
  }
  React.useEffect(() => {
    function keydown(event) {
      if (id || event.metaKey || event.ctrlKey || event.altKey || !['n','N'].includes(event.key)) return;
      const node = document.activeElement;
      if (node?.matches('input,textarea,select') || node?.isContentEditable || document.querySelector('[role="dialog"]')) return;
      event.preventDefault(); create();
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  function close() { readRecoveries(); router.replace(memoListHref(params), { scroll: false }); }
  function applyFilters(nextFilters) {
    const next = memoSearchParams(nextFilters);
    for (const key of ['note', 'new', 'draft', 'from']) if (params.get(key)) next.set(key, params.get(key));
    router.replace(`${pathname}${next.size ? '?' + next : ''}`, { scroll: false });
  }
  function saved(entry) {
    setLedger((prior) => ({ ...prior, entry }));
    window.dispatchEvent(new Event(MEMO_CHANGED_EVENT));
    if (isNew) router.replace(memoDocumentHref(params, { note: entry.id }), { scroll: false });
    readRecoveries();
  }
  const validId = isCanonicalUuid(id);
  const relatedMemos = React.useMemo(() => {
    if (!validId || !ledger.entry) return [];
    return findRelatedMemos(ledger.entry, search.entries, { limit: 3 });
  }, [validId, ledger.entry, search.entries]);
  return <div className="hub-page memos-page fade-up">
    <header className="memos-header"><div><h2>메모</h2><p>남긴 생각을 다음 할 일과 콘텐츠에 이어 쓰세요.</p></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="outline" size="sm" onClick={runWeeklySynthesis} disabled={patternLoading || !analysisReady} title="현재 범위의 최근 7일 메모를 최대 25개 종합합니다.">
          최근 7일 종합 보고서
        </Button>
        <Button variant="primary" icon="plus" onClick={create} disabled={Boolean(id) || ledger.status === 'loading'}>메모 남기기 <Kbd>N</Kbd></Button>
      </div>
    </header>
    <div className="memos-state"><TruthBadge state={search.status} /><span className="memo-muted">개인·회사 업무 범위를 확인해 이어 쓰는 기록</span></div>
    <MemoSearchControls filters={filters} context={search.context} onApply={applyFilters} />
    {selectedIds.length > 0 && (
      <div style={{ padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>선택한 메모 {selectedIds.length}개</strong>
          <SelectField label="분석 목적" value={patternGoal} onChange={(e) => setPatternGoal(e.target.value)} options={[
            { value: 'weekly_synthesis', label: '주간 종합 보고서' },
            { value: 'sales_insight', label: '영업 인사이트 도출' },
            { value: 'content_hook', label: '콘텐츠 훅 도출' },
            { value: 'operational_rule', label: '운영 체크리스트 도출' },
            { value: 'decision_rationale', label: '의사결정 배경 분석' },
            { value: 'general', label: '종합 패턴 분석' },
          ]} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="primary" size="xs" icon="sparkle" onClick={runPatternAnalysis} disabled={patternLoading || !analysisReady}>
            {patternLoading ? '분석 중…' : '패턴 분석 실행'}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setSelection({ owner: analysisOwner, ids: [] })}>
            선택 취소
          </Button>
        </div>
      </div>
    )}
    {(patternState.status === 'loading' || patternState.status === 'live') && (
      <MemoPatternPanel
        loading={patternLoading}
        error={null}
        patterns={patternState.patterns}
        onClose={closePattern}
        onNavigate={(path) => router.push(`/${path}`)}
      />
    )}
    {(patternState.status === 'preview' || patternState.status === 'error') && (
      <section className="memo-feedback" role={patternState.status === 'error' ? 'alert' : 'status'} aria-label="메모 분석 결과">
        <div className="memo-actions">
          <TruthBadge state={patternState.status} label={patternState.status === 'preview' ? 'Preview · 분석 엔진 연결 필요' : '분석 실패'} />
          {patternState.code && <span className="mono memo-muted">{patternState.code}</span>}
        </div>
        <p>{patternState.status === 'preview'
          ? '분석 엔진 또는 메모 저장소가 연결되지 않아 결과를 만들지 않았어요. 연결한 뒤 다시 실행하세요.'
          : patternState.error}</p>
        <div className="memo-actions">
          <Button variant="outline" onClick={() => runAnalysis(patternState.request)} disabled={!patternState.request}>다시 실행</Button>
          <Button variant="ghost" onClick={closePattern}>닫기</Button>
        </div>
      </section>
    )}
    {recoveries.length > 0 && <section className="memo-recovery" aria-label="작성 중인 메모"><h3>이어서 쓸 메모</h3>{recoveries.map((doc) => <Button key={doc.draft.id} className="hub-row" onClick={() => router.push(memoDocumentHref(params, doc.draft.expectedRevision ? { note: doc.draft.id } : { new: 'note', draft: doc.draft.id, from: doc.fromPreview ? 'preview' : '' }), { scroll: false })}>
      {doc.draft.title || doc.draft.body.slice(0,60) || '작성 중인 메모'} · {doc.pending ? '이전 요청 확인' : doc.fromPreview ? '연결 전 초안 이어쓰기' : '이어서 쓰기'}
    </Button>)}</section>}
    {localError && <p role="alert" className="memo-feedback">브라우저에 보관된 메모를 확인하지 못했어요. 열려 있는 입력은 복사해 보관해 주세요.</p>}
    {error && <div className="memo-feedback" role="alert"><p>{error}</p><Button onClick={() => setReload((n) => n + 1)}>다시 불러오기</Button></div>}
    {search.error && <div className="memo-feedback" role="alert"><p>{search.error}</p><Button onClick={search.refresh}>다시 찾기</Button></div>}
    {['live', 'partial'].includes(search.status) && search.entries.length > 0 && <p className="memo-muted" role="status">불러온 메모 <span className="num">{search.entries.length}</span>개{search.nextCursor ? ' · 더 볼 수 있어요' : ''}</p>}
    {search.status === 'loading' ? <div className="memo-loading"><span className="memo-muted">메모를 찾고 있어요…</span><Skeleton lines={2} width="100%" height={72} label="메모를 찾고 있어요" /></div> : search.status === 'preview' ? <EmptyState icon="content" title="메모 저장소 연결이 필요해요" description="작성한 내용은 현재 탭에 임시 보관합니다. 탭을 닫기 전 연결해 저장하거나 입력을 복사해 주세요." action={<Button onClick={create} disabled={Boolean(id)}>메모 남기기</Button>} />
      : ['live', 'partial'].includes(search.status) && (search.entries.length === 0 && search.nextCursor ? <div className="memo-feedback" role="status"><p>{search.message}</p><Button onClick={search.more} disabled={search.moreBusy}>범위 기록 더 찾기</Button></div> : search.entries.length === 0 ? <EmptyState icon="content" title={searchQuery ? '조건에 맞는 메모가 없어요' : '기억하고 싶은 일부터 한 줄'} description={searchQuery ? '검색어를 짧게 바꾸거나 조건을 해제해 보세요.' : '제목이나 분류 없이 바로 남겨보세요. 필요할 때 보강하고 활용할 수 있어요.'} action={searchQuery ? <Button onClick={() => applyFilters({})}>조건 모두 해제</Button> : <Button onClick={create} disabled={Boolean(id)}>첫 메모 남기기</Button>} />
        : <Card pad={false} className="memo-list"><ol>{search.entries.map((row) => <li key={row.id} className="memo-list-item">
          <div className="memo-row-selection">
            <Checkbox size={18} checked={selectedIds.includes(row.id)} disabled={!analysisReady}
              label={`${row.title || row.excerpt.split('\n')[0] || '제목 없는 메모'} · ${journalScopeLabel(row.noteMeta?.scope)} 메모 선택`}
              onChange={(_checked, event) => toggleSelect(row.id, event)} />
          </div>
          <button className="hub-row memo-list-row" onClick={() => router.push(memoDocumentHref(params, { note: row.id }), { scroll: false })}>
            <div className="memo-row-top"><span className="mono memo-muted">{memoTime(row.occurredAt)}</span><span className="memo-muted">{NOTE_QUESTIONS.find((item) => item.value === row.noteMeta?.kind)?.label || '메모'}{row.used ? ' · 활용함' : ''} · {journalScopeLabel(row.noteMeta?.scope)}</span></div>
            <strong><MatchText text={row.title || row.excerpt.split('\n')[0]} query={filters.q} /></strong><p><MatchText text={row.match?.text || row.excerpt} query={row.match ? Array.from(filters.q.trim()).slice(0, 180).join('') : filters.q} /></p>
            {row.match && <span className="memo-muted">{({ title: '제목', body: '본문', enhancement: '보강 내용', tags: '태그' })[row.match.field]}에서 찾음</span>}
            {search.context && <span className="memo-muted">{search.context.label}에 연결됨</span>}
            <span className="memo-row-open">열어서 보강·활용 →</span>
          </button>
        </li>)}</ol>{search.nextCursor && <div className="memo-more"><Button variant="outline" onClick={search.more} disabled={search.moreBusy || search.refreshing}>{search.moreBusy ? '불러오는 중…' : '메모 더 보기'}</Button></div>}</Card>)}
    {id && !validId && <p role="alert">메모 주소가 올바르지 않아요. <Button onClick={close}>목록으로</Button></p>}
    {validId && (
      <>
        <MemoDocument key={`${id}:${filters.noteScope}`} id={id} isNew={isNew} requestedScope={filters.noteScope} initialScope={['personal', 'company'].includes(filters.noteScope) ? filters.noteScope : 'personal'} workspaceId={ledger.workspaceId} workspaceConfirmed={ledger.workspaceConfirmed} source={ledger.requestKey === requestKey ? ledger.status : 'loading'} entry={ledger.entry?.id === id ? ledger.entry : null} context={context} fromPreview={fromPreview} onSaved={saved} onClose={close} onReload={() => setReload((n) => n + 1)} />
        {relatedMemos.length > 0 && (
          <aside className="memo-network-panel" aria-label="연관된 이전 메모">
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
              연관된 이전 메모 ({relatedMemos.length}건)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {relatedMemos.map((rel) => (
                <button key={rel.id} type="button" className="memo-network-card" onClick={() => router.push(memoDocumentHref(params, { note: rel.id }), { scroll: false })}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                    {rel.title}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {rel.reasons.map((r, i) => (
                      <span key={i} style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                        • {r}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}
      </>
    )}
  </div>;
}
