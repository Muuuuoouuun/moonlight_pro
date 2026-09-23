"use client";
import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, EmptyState, Kbd, TruthBadge } from '../hub-primitives';
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
export function Memos() {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const filters = filtersFromParams(params), searchQuery = memoSearchParams(filters).toString();
  const search = useMemoSearch(searchQuery);
  const noteId = params.get('note'), isNew = params.get('new') === 'note', draftId = params.get('draft');
  const id = isNew ? draftId : noteId;
  const requestKey = `${isNew ? 'new' : 'note'}:${id || ''}`;
  const fromPreview = params.get('from') === 'preview';
  const contextType = params.get('contextType'), contextId = params.get('contextId');
  const context = React.useMemo(() => contextId ? { type: contextType, id: contextId } : null, [contextType, contextId]);
  const [ledger, setLedger] = React.useState(() => ({ ...initial, workspaceId: lastJournalWorkspace() })), [reload, setReload] = React.useState(0), [error, setError] = React.useState('');
  const [recoveries, setRecoveries] = React.useState([]), [localError, setLocalError] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [patternGoal, setPatternGoal] = React.useState('sales_insight');
  const [patternState, setPatternState] = React.useState({ show: false, loading: false, patterns: [], error: null });
  const generation = React.useRef(0), currentLedger = React.useRef(ledger); currentLedger.current = ledger;

  const toggleSelect = React.useCallback((memoId, e) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(memoId) ? prev.filter((x) => x !== memoId) : prev.length < 10 ? [...prev, memoId] : prev
    );
  }, []);

  const runPatternAnalysis = React.useCallback(async () => {
    if (selectedIds.length === 0) return;
    setPatternState({ show: true, loading: true, patterns: [], error: null });
    try {
      const res = await fetch('/api/hub/journal/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          goal: patternGoal,
          noteIds: selectedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'failed') {
        setPatternState({ show: true, loading: false, patterns: [], error: data.error || '분석에 실패했습니다.' });
      } else {
        setPatternState({ show: true, loading: false, patterns: data.patterns || [], error: null });
      }
    } catch (err) {
      setPatternState({ show: true, loading: false, patterns: [], error: err.message });
    }
  }, [selectedIds, patternGoal]);

  const runWeeklySynthesis = React.useCallback(async () => {
    setPatternState({ show: true, loading: true, patterns: [], error: null });
    try {
      const res = await fetch('/api/hub/journal/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          goal: 'weekly_synthesis',
          range: '7d',
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'failed') {
        setPatternState({ show: true, loading: false, patterns: [], error: data.error || data.message || '주간 종합 분석에 실패했습니다.' });
      } else {
        setPatternState({ show: true, loading: false, patterns: data.patterns || [], error: null });
      }
    } catch (err) {
      setPatternState({ show: true, loading: false, patterns: [], error: err.message });
    }
  }, []);

  React.useEffect(() => {
    if (!isNew || draftId) return;
    const next = new URLSearchParams(params.toString()); next.set('draft', crypto.randomUUID());
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [isNew, draftId, params, pathname, router]);

  React.useEffect(() => {
    const ticket = ++generation.current; let active = true;
    setLedger((previous) => ({ ...previous, status: 'loading', entry: null })); setError('');
    const query = noteId && !isNew ? '?note=' + encodeURIComponent(noteId) : '';
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
  }, [noteId, isNew, draftId, reload]);

  // 빠른 메모(M·⌘K)도 2026-09-20부터 같은 journal 저장소를 쓴다. 저장 이벤트를 듣지 않으면
  // 이 화면에서 메모를 남겨도 새로고침 전까지 목록에 뜨지 않는다(실측).
  React.useEffect(() => {
    const refresh = () => {
      setReload((value) => value + 1);
      // 화면의 목록은 ledger 가 아니라 검색 훅(useMemoSearch)이 그리고, 그건
      // MEMO_CHANGED_EVENT 만 듣는다. 두 이벤트를 여기서 잇는다.
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
      setRecoveries(docs); setLocalError(docs.some((doc) => doc.volatile));
    } catch { setLocalError(true); }
  }
  React.useEffect(() => { if (ledger.status !== 'loading') readRecoveries(); }, [ledger.workspaceId, ledger.status, id, reload]);
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
        <Button variant="outline" size="sm" onClick={runWeeklySynthesis} disabled={patternState.loading}>
          ✦ 최근 7일 종합 보고서
        </Button>
        <Button variant="primary" icon="plus" onClick={create} disabled={Boolean(id) || ledger.status === 'loading'}>메모 남기기 <Kbd>N</Kbd></Button>
      </div>
    </header>
    <div className="memos-state"><TruthBadge state={search.status} /><span className="memo-muted">하루 리뷰와 함께 보관하는 개인 기록</span></div>
    <MemoSearchControls filters={filters} context={search.context} onApply={applyFilters} />
    {selectedIds.length > 0 && (
      <div style={{ padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>선택한 메모 {selectedIds.length}개</strong>
          <select
            value={patternGoal}
            onChange={(e) => setPatternGoal(e.target.value)}
            className="hub-input"
            style={{ height: 32, fontSize: 12, padding: '0 8px' }}
          >
            <option value="weekly_synthesis">주간 신경망 종합 보고서</option>
            <option value="sales_insight">영업 인사이트 도출</option>
            <option value="content_hook">콘텐츠 훅 도출</option>
            <option value="operational_rule">운영 체크리스트 도출</option>
            <option value="decision_rationale">의사결정 배경 분석</option>
            <option value="general">종합 패턴 분석</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="primary" size="xs" icon="sparkle" onClick={runPatternAnalysis} disabled={patternState.loading}>
            {patternState.loading ? '분석 중…' : '패턴 분석 실행'}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setSelectedIds([])}>
            선택 취소
          </Button>
        </div>
      </div>
    )}
    {patternState.show && (
      <MemoPatternPanel
        loading={patternState.loading}
        error={patternState.error}
        patterns={patternState.patterns}
        onClose={() => setPatternState((prev) => ({ ...prev, show: false }))}
        onNavigate={(path) => router.push(`/${path}`)}
      />
    )}
    {recoveries.length > 0 && <section className="memo-recovery" aria-label="작성 중인 메모"><h3>이어서 쓸 메모</h3>{recoveries.map((doc) => <Button key={doc.draft.id} className="hub-row" onClick={() => router.push(memoDocumentHref(params, doc.draft.expectedRevision ? { note: doc.draft.id } : { new: 'note', draft: doc.draft.id, from: doc.fromPreview ? 'preview' : '' }), { scroll: false })}>
      {doc.draft.title || doc.draft.body.slice(0,60) || '작성 중인 메모'} · {doc.pending ? '이전 요청 확인' : doc.fromPreview ? '연결 전 초안 이어쓰기' : '이어서 쓰기'}
    </Button>)}</section>}
    {localError && <p role="alert" className="memo-feedback">브라우저에 보관된 메모를 확인하지 못했어요. 열려 있는 입력은 복사해 보관해 주세요.</p>}
    {error && <div className="memo-feedback" role="alert"><p>{error}</p><Button onClick={() => setReload((n) => n + 1)}>다시 불러오기</Button></div>}
    {search.error && <div className="memo-feedback" role="alert"><p>{search.error}</p><Button onClick={search.refresh}>다시 찾기</Button></div>}
    {search.status === 'live' && search.entries.length > 0 && <p className="memo-muted" role="status">불러온 메모 <span className="num">{search.entries.length}</span>개{search.nextCursor ? ' · 더 볼 수 있어요' : ''}</p>}
    {search.status === 'loading' ? <p role="status" className="memo-muted">메모를 찾고 있어요…</p> : search.status === 'preview' ? <EmptyState icon="content" title="메모 저장소 연결이 필요해요" description="작성한 내용은 현재 탭에 임시 보관합니다. 탭을 닫기 전 연결해 저장하거나 입력을 복사해 주세요." action={<Button onClick={create} disabled={Boolean(id)}>메모 남기기</Button>} />
      : search.status === 'live' && (search.entries.length === 0 ? <EmptyState icon="content" title={searchQuery ? '조건에 맞는 메모가 없어요' : '기억하고 싶은 일부터 한 줄'} description={searchQuery ? '검색어를 짧게 바꾸거나 조건을 해제해 보세요.' : '제목이나 분류 없이 바로 남겨보세요. 필요할 때 보강하고 활용할 수 있어요.'} action={searchQuery ? <Button onClick={() => applyFilters({})}>조건 모두 해제</Button> : <Button onClick={create} disabled={Boolean(id)}>첫 메모 남기기</Button>} />
        : <Card pad={false} className="memo-list"><ol>{search.entries.map((row) => <li key={row.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ padding: '24px 0 0 16px', display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={selectedIds.includes(row.id)}
              onChange={(e) => toggleSelect(row.id, e)}
              aria-label="메모 선택"
              style={{ cursor: 'pointer', width: 16, height: 16 }}
            />
          </div>
          <button className="hub-row memo-list-row" style={{ flex: 1 }} onClick={() => router.push(memoDocumentHref(params, { note: row.id }), { scroll: false })}>
            <div className="memo-row-top"><span className="mono memo-muted">{memoTime(row.occurredAt)}</span><span className="memo-muted">{NOTE_QUESTIONS.find((item) => item.value === row.noteMeta?.kind)?.label || '메모'}{row.used ? ' · 활용함' : ''}</span></div>
            <strong><MatchText text={row.title || row.excerpt.split('\n')[0]} query={filters.q} /></strong><p><MatchText text={row.match?.text || row.excerpt} query={row.match ? Array.from(filters.q.trim()).slice(0, 180).join('') : filters.q} /></p>
            {row.match && <span className="memo-muted">{({ title: '제목', body: '본문', enhancement: '보강 내용', tags: '태그' })[row.match.field]}에서 찾음</span>}
            {search.context && <span className="memo-muted">{search.context.label}에 연결됨</span>}
            <span className="memo-row-open">열어서 보강·활용 →</span>
          </button>
        </li>)}</ol>{search.nextCursor && <div className="memo-more"><Button variant="outline" onClick={search.more} disabled={search.moreBusy || search.refreshing}>{search.moreBusy ? '불러오는 중…' : '메모 더 보기'}</Button></div>}</Card>)}
    {id && !validId && <p role="alert">메모 주소가 올바르지 않아요. <Button onClick={close}>목록으로</Button></p>}
    {validId && (
      <>
        <MemoDocument key={id} id={id} isNew={isNew} workspaceId={ledger.workspaceId} workspaceConfirmed={ledger.workspaceConfirmed} source={ledger.requestKey === requestKey ? ledger.status : 'loading'} entry={ledger.entry?.id === id ? ledger.entry : null} context={context} fromPreview={fromPreview} onSaved={saved} onClose={close} onReload={() => setReload((n) => n + 1)} />
        {relatedMemos.length > 0 && (
          <aside className="memo-network-panel" aria-label="연관된 이전 메모">
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--moon-200)' }}>
              ✦ AI 지식 신경망: 연관된 이전 메모 ({relatedMemos.length}건)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {relatedMemos.map((rel) => (
                <div key={rel.id} className="memo-network-card" onClick={() => router.push(memoDocumentHref(params, { note: rel.id }), { scroll: false })}>
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
                </div>
              ))}
            </div>
          </aside>
        )}
      </>
    )}
  </div>;
}
