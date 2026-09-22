"use client";

import React from 'react';
import { buildNoteSave, createJournalWriter, initialMemoContexts, isJournalEntry, noteFingerprint, noteToDraft } from '@/lib/journal-client';
import { createJournalStore, journalTabId } from '@/lib/journal-browser-store';

export async function fetchJournal(path = '') {
  const response = await fetch('/api/hub/journal' + path, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || data.status === 'error' || data.source === 'error') throw Error(data.message || '메모를 불러오지 못했어요. 다시 시도해 주세요.');
  if (!['live', 'preview'].includes(data.status)) throw Error('저장 상태를 확인하지 못했어요.');
  return data;
}

export function useMemoDocument({ id, isNew, workspaceId, workspaceConfirmed, entry, source, context, contexts, fromPreview = false, onSaved }) {
  const [state, setState] = React.useState({ draft: null, entry: null, pending: null, ready: false, dirty: false,
    localError: false, loadError: '', message: '', saveState: 'idle', conflict: null, reuseDraft: null, target: null });
  const ref = React.useRef(state), mounted = React.useRef(true), initialized = React.useRef(false);
  const documentEpoch = React.useRef(0), currentWorkspace = React.useRef(workspaceId); currentWorkspace.current = workspaceId;
  const priorWorkspace = React.useRef(workspaceId);
  const store = React.useRef(null), writer = React.useRef(null), savedCallback = React.useRef(onSaved);
  savedCallback.current = onSaved;
  const update = React.useCallback((patch) => { ref.current = { ...ref.current, ...patch }; if (mounted.current) setState(ref.current); }, []);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; documentEpoch.current++; initialized.current = false; }; }, []);

  React.useEffect(() => {
    if (entry && entry.id !== id) return;
    const loadKey = `${workspaceId || 'preview'}:${source}`;
    if (initialized.current === loadKey || source === 'loading') return;
    const epoch = ++documentEpoch.current;
    let cancelled = false;
    async function initialize() {
      let local = null, localError = false, previewStore = null, documentStore = null;
      store.current = null;
      const carry = workspaceId && !priorWorkspace.current && ref.current.draft && !ref.current.pending && !ref.current.entry
        ? { draft: ref.current.draft, dirty: ref.current.dirty, entry: null, pending: null } : null;
      try {
        documentStore = createJournalStore({ storage: sessionStorage, workspaceId, tabId: journalTabId() });
        store.current = documentStore;
        local = documentStore.read(id);
        if (!local && workspaceId && (carry || (isNew && fromPreview))) {
          previewStore = createJournalStore({ storage: sessionStorage, workspaceId: null, tabId: journalTabId() });
          local = carry || previewStore.read(id);
        }
        if (local?.volatile) localError = true;
      } catch { localError = true; }
      let draft = local?.draft || (entry ? noteToDraft(entry) : isNew ? noteToDraft({ id, occurredAt: new Date().toISOString() }) : null);
      let message = local?.pending ? '이전 저장 결과를 확인해야 해요. 같은 요청으로 확인하면 중복 생성되지 않아요.'
        : local?.dirty ? '작성 중이던 내용을 불러왔어요.' : '';
      const seeds = initialMemoContexts(context, contexts);
      if (!local && isNew && seeds.length) {
        const resolved = await Promise.all(seeds.map(async (seed) => {
          try {
            const result = await fetchJournal(`/contexts?type=${encodeURIComponent(seed.type)}&id=${encodeURIComponent(seed.id)}`);
            return result.contexts?.find((row) => row.id === seed.id && row.type === seed.type) || null;
          } catch { return null; }
        }));
        // Keep the intended relationship on a failed lookup; the save RPC validates
        // every identity atomically instead of silently saving an orphaned note.
        draft.contexts = resolved.map((value, index) => value || { ...seeds[index], label: seeds[index].label || '연결 확인 필요' });
        if (resolved.some((value) => !value)) message = '시작한 업무 연결을 모두 확인하지 못했어요. 저장 전에 업무 연결에서 다시 선택해 주세요.';
      }
      if (cancelled || !mounted.current || documentEpoch.current !== epoch) return;
      initialized.current = loadKey;
      priorWorkspace.current = workspaceId;
      const conflict = local?.dirty && entry && local.draft.expectedRevision !== entry.revision ? entry : null;
      const useLocal = local && (local.dirty || local.pending);
      if (entry && !useLocal) draft = noteToDraft(entry);
      const next = { draft, entry: entry || local?.entry || null, pending: local?.pending || null,
        dirty: local ? Boolean(local.dirty) : Boolean(isNew), ready: true, localError,
        reuseDraft: local?.reuseDraft || null, conflict, saveState: conflict ? 'conflict' : 'idle', message,
        loadError: !draft ? '이 메모를 확인하지 못했어요. 목록을 다시 불러오거나 주소를 확인해 주세요.' : '' };
      update(next);
      if (draft && !localError) {
        try { documentStore.write(id, next); previewStore?.remove(id); } catch { update({ localError: true }); }
      }
      writer.current = createJournalWriter({
        get: () => ref.current, isCurrent: () => mounted.current && documentEpoch.current === epoch && currentWorkspace.current === workspaceId,
        persist: (next) => { if (!documentStore) throw Error('storage-unavailable'); documentStore.write(id, next); }, update,
        send: async (request) => {
          const response = await fetch('/api/hub/journal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request), signal: AbortSignal.timeout(20000) });
          const result = await response.json();
          if (!response.ok && ['saved', 'duplicate'].includes(result?.status)) throw Error('unconfirmed-save');
          return result;
        },
      });
    }
    initialize();
    return () => { cancelled = true; };
  }, [id, isNew, workspaceId, source, entry, context, contexts, fromPreview, update]);

  function keep(patch) {
    const next = { ...ref.current, ...patch };
    try { store.current.write(id, next); next.localError = false; }
    catch { next.localError = true; }
    update(next);
  }
  function edit(patch) {
    if (ref.current.pending || ref.current.saveState === 'saving') return;
    const draft = { ...ref.current.draft, ...patch };
    keep({ draft, dirty: noteFingerprint(draft) !== noteFingerprint(ref.current.entry && noteToDraft(ref.current.entry)),
      saveState: 'editing', message: '', target: null });
  }
  async function run(request) {
    if (!workspaceConfirmed || source === 'loading') { update({ message: '저장소 연결을 다시 확인한 뒤 이전 요청을 확인해 주세요.' }); return { status: 'unconfirmed-workspace' }; }
    const activeWriter = writer.current, epoch = documentEpoch.current;
    const result = await activeWriter?.run(request);
    if (!mounted.current || epoch !== documentEpoch.current || activeWriter !== writer.current) return result;
    if (['saved', 'duplicate'].includes(result?.status) && isJournalEntry(result.entry, id)) {
      savedCallback.current?.(result.entry);
      if (result.target?.type === 'content') window.dispatchEvent(new Event('moonlight:content-saved'));
      if (result.target?.type === 'task') window.dispatchEvent(new Event('moonlight:tasks-saved'));
    }
    return result;
  }
  function save() {
    if (!ref.current.draft?.body.trim()) { update({ message: '기억하고 싶은 문장을 한 줄 남겨주세요.' }); return; }
    return run(buildNoteSave(ref.current.draft, crypto.randomUUID()));
  }
  function chooseConflict(useLocal) {
    if (!ref.current.conflict || ref.current.pending) return;
    const latest = ref.current.conflict;
    const draft = useLocal ? { ...ref.current.draft, expectedRevision: latest.revision } : noteToDraft(latest);
    keep({ draft, entry: latest, conflict: null, dirty: useLocal, saveState: useLocal ? 'editing' : 'saved',
      message: useLocal ? '내 입력을 확인한 뒤 수정 저장을 눌러주세요.' : '현재 저장본을 불러왔어요.' });
  }
  function prepareUse(action, selection) {
    if (!selection || ref.current.dirty || ref.current.pending || !ref.current.entry) return;
    const linked = ref.current.draft.contexts;
    const reuseDraft = { action, selection, targetContext: linked.find((c) => c.type === (action === 'create_task' ? 'project' : 'brand')) || null, target: { title: '',
      ...(action === 'create_task' ? { dueAt: null, projectId: linked.find((c) => c.type === 'project')?.id || null }
        : { brandId: linked.find((c) => c.type === 'brand')?.id || null, channel: 'threads' }) } };
    keep({ reuseDraft, target: null, message: '' });
  }
  function editUse(patch) {
    if (ref.current.pending || ref.current.saveState === 'saving') return;
    keep({ reuseDraft: { ...ref.current.reuseDraft, target: { ...ref.current.reuseDraft.target, ...patch } } });
  }
  function editUseContext(context) {
    if (ref.current.pending || ref.current.saveState === 'saving') return;
    const reuseDraft = ref.current.reuseDraft;
    const key = reuseDraft.action === 'create_task' ? 'projectId' : 'brandId';
    keep({ reuseDraft: { ...reuseDraft, targetContext: context, target: { ...reuseDraft.target, [key]: context?.id || null } } });
  }
  function submitUse() {
    const { reuseDraft, draft } = ref.current;
    if (!reuseDraft?.target.title.trim()) { update({ message: '할 일 또는 콘텐츠의 제목을 입력해주세요.' }); return; }
    return run({ action: reuseDraft.action, selection: reuseDraft.selection, target: reuseDraft.target, requestId: crypto.randomUUID(), entryId: id, expectedRevision: draft.expectedRevision });
  }
  return { ...state, source, workspaceConfirmed, save, edit, run, retry: () => run(), chooseConflict, prepareUse, editUse, editUseContext, submitUse,
    closeUse: () => { if (ref.current.saveState !== 'saving') keep({ reuseDraft: null, target: null, message: ref.current.pending ? ref.current.message : '' }); },
    busy: state.saveState === 'saving', locked: state.saveState === 'saving' || Boolean(state.pending),
  };
}
