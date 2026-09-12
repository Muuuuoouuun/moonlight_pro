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
import './memos.css';

function MemoDocument({ onClose, onReload, ...props }) {
  const model = useMemoDocument(props);
  return model.reuseDraft ? <MemoUseComposer model={model} onReload={onReload} /> : <MemoComposer model={model} isNew={props.isNew} onClose={onClose} onReload={onReload} />;
}
const summary = (entry) => ({ id: entry.id, title: entry.title, excerpt: entry.body.slice(0,180), occurredAt: entry.occurredAt, noteMeta: { kind: entry.noteMeta?.kind }, revision: entry.revision });
const initial = { status: 'loading', workspaceId: null, entries: [], entry: null, nextCursor: null, workspaceConfirmed: false };
export function Memos() {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const noteId = params.get('note'), isNew = params.get('new') === 'note', draftId = params.get('draft');
  const id = isNew ? draftId : noteId;
  const requestKey = `${isNew ? 'new' : 'note'}:${id || ''}`;
  const fromPreview = params.get('from') === 'preview';
  const contextType = params.get('contextType'), contextId = params.get('contextId');
  const context = React.useMemo(() => contextId ? { type: contextType, id: contextId } : null, [contextType, contextId]);
  const [ledger, setLedger] = React.useState(() => ({ ...initial, workspaceId: lastJournalWorkspace() })), [reload, setReload] = React.useState(0), [error, setError] = React.useState('');
  const [moreBusy, setMoreBusy] = React.useState(false), [recoveries, setRecoveries] = React.useState([]), [localError, setLocalError] = React.useState(false);
  const generation = React.useRef(0), currentLedger = React.useRef(ledger); currentLedger.current = ledger;

  React.useEffect(() => {
    if (!isNew || draftId) return;
    const next = new URLSearchParams(params.toString()); next.set('draft', crypto.randomUUID());
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [isNew, draftId, params, pathname, router]);

  React.useEffect(() => {
    const ticket = ++generation.current; let active = true;
    setLedger((previous) => ({ ...previous, status: 'loading', entry: null })); setError(''); setMoreBusy(false);
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
    router.push(`${pathname}?new=note&draft=${crypto.randomUUID()}`, { scroll: false });
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
  function close() { readRecoveries(); router.replace(pathname, { scroll: false }); }
  function saved(entry) {
    setLedger((prior) => ({ ...prior, entry, entries: [summary(entry), ...prior.entries.filter((row) => row.id !== entry.id)]
      .sort((a,b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)) }));
    if (isNew) router.replace(`${pathname}?note=${entry.id}`, { scroll: false });
    readRecoveries();
  }
  async function more() {
    if (moreBusy || !ledger.nextCursor) return;
    const ticket = generation.current, cursor = ledger.nextCursor; setMoreBusy(true); setError('');
    try {
      const response = await fetch(`/api/hub/journal?before=${encodeURIComponent(cursor.before)}&beforeId=${encodeURIComponent(cursor.beforeId)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || data.status !== 'live') throw Error('read-failed');
      if (generation.current !== ticket) return;
      setLedger((prior) => ({ ...prior, nextCursor: data.nextCursor, entries: [...prior.entries, ...data.entries.filter((row) => !prior.entries.some((old) => old.id === row.id))] }));
    } catch { if (generation.current === ticket) setError('이전 메모를 더 불러오지 못했어요. 다시 시도해 주세요.'); }
    finally { if (generation.current === ticket) setMoreBusy(false); }
  }
  const validId = isCanonicalUuid(id);
  return <div className="hub-page memos-page fade-up">
    <header className="memos-header"><div><h2>메모</h2><p>남긴 생각을 다음 할 일과 콘텐츠에 이어 쓰세요.</p></div>
      <Button variant="primary" icon="plus" onClick={create} disabled={Boolean(id) || ledger.status === 'loading'}>메모 남기기 <Kbd>N</Kbd></Button>
    </header>
    <div className="memos-state"><TruthBadge state={ledger.status} /><span className="memo-muted">하루 리뷰와 함께 보관하는 개인 기록</span></div>
    {recoveries.length > 0 && <section className="memo-recovery" aria-label="작성 중인 메모"><h3>이어서 쓸 메모</h3>{recoveries.map((doc) => <Button key={doc.draft.id} className="hub-row" onClick={() => router.push(doc.draft.expectedRevision ? `${pathname}?note=${doc.draft.id}` : `${pathname}?new=note&draft=${doc.draft.id}${doc.fromPreview ? '&from=preview' : ''}`)}>
      {doc.draft.title || doc.draft.body.slice(0,60) || '작성 중인 메모'} · {doc.pending ? '이전 요청 확인' : doc.fromPreview ? '연결 전 초안 이어쓰기' : '이어서 쓰기'}
    </Button>)}</section>}
    {localError && <p role="alert" className="memo-feedback">브라우저에 보관된 메모를 확인하지 못했어요. 열려 있는 입력은 복사해 보관해 주세요.</p>}
    {error && <div className="memo-feedback" role="alert"><p>{error}</p><Button onClick={() => setReload((n) => n + 1)}>다시 불러오기</Button></div>}
    {ledger.status === 'loading' ? <p role="status" className="memo-muted">메모를 불러오고 있어요…</p> : ledger.status === 'preview' ? <EmptyState icon="content" title="메모 저장소 연결이 필요해요" description="작성한 내용은 현재 탭에 임시 보관합니다. 탭을 닫기 전 연결해 저장하거나 입력을 복사해 주세요." action={<Button onClick={create} disabled={Boolean(id)}>메모 남기기</Button>} />
      : ledger.status === 'live' && (ledger.entries.length === 0 ? <EmptyState icon="content" title="기억하고 싶은 일부터 한 줄" description="제목이나 분류 없이 바로 남겨보세요. 필요할 때 보강하고 활용할 수 있어요." action={<Button onClick={create} disabled={Boolean(id)}>첫 메모 남기기</Button>} />
        : <Card pad={false} className="memo-list"><ol>{ledger.entries.map((row) => <li key={row.id}>
          <button className="hub-row memo-list-row" onClick={() => router.push(`${pathname}?note=${row.id}`, { scroll: false })}>
            <div className="memo-row-top"><span className="mono memo-muted">{memoTime(row.occurredAt)}</span><span className="memo-muted">{NOTE_QUESTIONS.find((item) => item.value === row.noteMeta?.kind)?.label || '메모'}</span></div>
            {row.title && <strong>{row.title}</strong>}<p>{row.excerpt}</p><span className="memo-row-open">열어서 보강·활용 →</span>
          </button>
        </li>)}</ol>{ledger.nextCursor && <div className="memo-more"><Button variant="outline" onClick={more} disabled={moreBusy}>{moreBusy ? '불러오는 중…' : '이전 메모 더 보기'}</Button></div>}</Card>)}
    {id && !validId && <p role="alert">메모 주소가 올바르지 않아요. <Button onClick={close}>목록으로</Button></p>}
    {validId && <MemoDocument key={id} id={id} isNew={isNew} workspaceId={ledger.workspaceId} workspaceConfirmed={ledger.workspaceConfirmed} source={ledger.requestKey === requestKey ? ledger.status : 'loading'} entry={ledger.entry?.id === id ? ledger.entry : null} context={context} fromPreview={fromPreview} onSaved={saved} onClose={close} onReload={() => setReload((n) => n + 1)} />}
  </div>;
}
