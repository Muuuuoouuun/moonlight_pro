"use client";

import React from 'react';
import { Button, Drawer, EmptyState, Skeleton } from './hub-primitives';
import { MemoComposer } from './pages/memo-composer';
import { MemoUseComposer } from './pages/memo-use-composer';
import { fetchJournal, useMemoDocument } from './pages/use-memos';
import { contextMemoKey } from '@/lib/project-customer-context';
import { isCanonicalUuid } from '@/lib/uuid';
import { rememberJournalWorkspace } from '@/lib/journal-browser-store';
import { MEMO_CHANGED_EVENT } from '@/lib/journal-search-client';
import './pages/memos.css';

function ContextDocument({ id, storageKey, ledger, contexts, onClose, onReload, onSaved }) {
  const model = useMemoDocument({ id, isNew: !ledger.entry, workspaceId: ledger.workspaceId,
    workspaceConfirmed: isCanonicalUuid(ledger.workspaceId), source: ledger.status, entry: ledger.entry,
    contexts, onSaved: (entry) => {
      window.dispatchEvent(new Event(MEMO_CHANGED_EVENT));
      if (storageKey) { try { sessionStorage.removeItem(storageKey); } catch { /* draft store reports failures */ } }
      onSaved?.(entry);
      onClose();
    } });
  return model.reuseDraft ? <MemoUseComposer model={model} onReload={onReload} />
    : <MemoComposer model={model} isNew={!ledger.entry} focused onClose={onClose} onReload={onReload} />;
}

// The existing journal writer owns idempotency, conflicts and same-tab recovery.
// This wrapper keeps capture inside its source screen instead of navigating away.
export function ContextMemoDrawer({ contexts = [], noteId = null, onClose, onSaved }) {
  const [state, setState] = React.useState({ status: 'loading' });
  const [reload, setReload] = React.useState(0);
  const identity = contextMemoKey(contexts);
  React.useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    async function load() {
      try {
        const ledger = await fetchJournal(noteId ? `?note=${encodeURIComponent(noteId)}` : '');
        if (!active) return;
        if (ledger.workspaceId) rememberJournalWorkspace(ledger.workspaceId);
        const storageKey = noteId ? null : `moonlight:context-memo:v1:${ledger.workspaceId || 'preview'}:${identity}`;
        let id = noteId;
        if (!id) {
          try { const stored = sessionStorage.getItem(storageKey); if (isCanonicalUuid(stored)) id = stored; } catch { /* writer displays recovery errors */ }
          id ||= crypto.randomUUID();
          try { sessionStorage.setItem(storageKey, id); } catch { /* writer displays recovery errors */ }
        }
        setState({ ...ledger, id, storageKey });
      } catch (failure) { if (active) setState({ status: 'error', message: failure.message }); }
    }
    load();
    return () => { active = false; };
  }, [identity, noteId, reload]);
  const retry = () => setReload((value) => value + 1);
  if (!state.id) return <Drawer title="메모 남기기" presentation="compact" onClose={onClose}>
    {state.status === 'loading' ? <Skeleton lines={3} height={16} label="메모 저장소 확인 중" />
      : <EmptyState title="메모 저장소를 확인하지 못했어요" description={state.message} action={<Button onClick={retry}>다시 불러오기</Button>} />}
  </Drawer>;
  return <ContextDocument key={`${state.workspaceId}:${state.id}`} id={state.id} storageKey={state.storageKey} ledger={state} contexts={contexts} onClose={onClose} onReload={retry} onSaved={onSaved} />;
}
