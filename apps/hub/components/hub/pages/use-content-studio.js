"use client";

import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  emptyStudioDraft, draftFromDetail, studioFingerprint, studioMirrorKey,
  studioErrorMessage, isDurableStudioSave,
} from '@/lib/content-workflow-client';
import { manualPublicationFields, publicationIsVerified } from '@/lib/content-workflow';
import { refreshContentLedger } from '../use-content-ledger';
import { createStudioSaveQueue, isDefinitiveStudioRejection } from '@/lib/content-studio-save-queue';
import { readStudioMirror, readStudioDocumentMirror, writeStudioMirror } from '@/lib/content-studio-storage';

export async function postStudio(path, body) {
  const response = await fetch('/api/hub/content/' + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(path === 'transform' ? 65000 : 20000),
  });
  const result = await response.json();
  if (!result || typeof result.status !== 'string') throw new Error('서버 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요.');
  return result;
}
async function getDetail(contentId) {
  const response = await fetch('/api/hub/content/workflow?item=' + encodeURIComponent(contentId), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok || result.status !== 'live') throw new Error(studioErrorMessage(result, '저장된 콘텐츠를 불러오지 못했습니다. 다시 시도해주세요.'));
  return result;
}
const copyAsNew = (draft) => ({
  ...draft, contentId: null, variantId: null, itemUpdatedAt: null, variantUpdatedAt: null, status: 'draft', sourceRefs: [],
});
const routeIdentity = (scope, item, variant, fresh, draft) => [scope, item || '', variant || '', fresh || '', draft || ''].join('|');
const emptyHistory = () => ({ revisions: [], nextCursor: null, loading: false, error: '' });
const busyState = { busy: false, pendingSave: null, pendingMutation: null };

export function useContentStudio(workspace) {
  const params = useSearchParams(), pathname = usePathname();
  const scope = workspace || 'all';
  const itemParam = params.get('item'), variantParam = params.get('variant'), newParam = params.get('new'), brandParam = params.get('brand'), draftParam = params.get('draft');
  const [state, setState] = React.useState(() => ({
    draft: emptyStudioDraft(), dirty: false, ready: false, loadError: '', saveState: 'idle', saveMessage: '',
    localState: 'idle', localSavedAt: null, recovery: null, detail: null, history: emptyHistory(), editTick: 0, ...busyState,
  }));
  const stateRef = React.useRef(state), epoch = React.useRef(0), queueRef = React.useRef(null);
  const historyRequest = React.useRef(0);
  const publicationAttempt = React.useRef(null);
  const draftKey = React.useRef(null), loadedRoute = React.useRef(null);
  const update = React.useCallback((patch) => {
    const next = typeof patch === 'function' ? patch(stateRef.current) : { ...stateRef.current, ...patch };
    stateRef.current = next; setState(next);
  }, []);
  const routeKey = routeIdentity(scope, itemParam, variantParam, newParam, draftParam);
  const writeUrl = React.useCallback((draft) => {
    const query = new URLSearchParams();
    if (draft.contentId) query.set('item', draft.contentId);
    if (draft.variantId) query.set('variant', draft.variantId);
    if (!draft.contentId) { query.set('new', 'draft'); query.set('draft', draftKey.current); }
    loadedRoute.current = routeIdentity(scope, draft.contentId, draft.variantId, draft.contentId ? '' : 'draft', draft.contentId ? '' : draftKey.current);
    window.history.replaceState(null, '', pathname + '?' + query.toString());
  }, [pathname, scope]);
  const mirror = React.useCallback((next, dirty, receiptPatch = {}, options = {}) => {
    const key = studioMirrorKey({ ...next, draftKey: draftKey.current });
    const documentEpoch = epoch.current;
    return writeStudioMirror(key, { draft: next, dirty, ...receiptPatch }, scope, { draftKey: draftKey.current, ...options }).then((savedAt) => {
      if (epoch.current === documentEpoch) update({ localState: 'saved', localSavedAt: savedAt });
      return savedAt;
    }).catch((error) => {
      if (epoch.current === documentEpoch) update({ localState: 'error' });
      throw error;
    });
  }, [scope, update]);
  const resetQueue = React.useCallback(() => {
    const documentEpoch = epoch.current, identity = draftKey.current;
    const current = () => epoch.current === documentEpoch;
    queueRef.current = createStudioSaveQueue({
      get: () => stateRef.current, isCurrent: current, initialPending: stateRef.current.pendingSave,
      send: (request) => postStudio('workflow', request),
      persistPending: async (pendingSave) => {
        if (!current()) throw Error('document-changed');
        update({ pendingSave });
        await mirror(stateRef.current.draft, stateRef.current.dirty, { pendingSave });
      },
      commit: async ({ draft, dirty }, result, pending) => {
        if (!current()) return;
        const prior = stateRef.current.detail;
        const variants = [...(prior?.variants || []).filter((variant) => variant.id !== result.variant.id), result.variant];
        const previousKey = !pending.sent.variantId ? studioMirrorKey({ ...pending.sent, draftKey: identity }) : undefined;
        // Advance versions immediately so typing during the IDB acknowledgement
        // carries the assigned IDs. The serialized mirror write clears the receipt.
        update({ draft, dirty, detail: { ...prior, item: result.item, variants }, pendingSave: null, saveState: dirty ? 'editing' : 'saved', saveMessage: '' });
        await mirror(draft, dirty, { pendingSave: null }, { previousKey });
        if (!current()) return;
        writeUrl(draft);
        window.dispatchEvent(new Event('moonlight:content-saved'));
      },
    });
  }, [mirror, update, writeUrl]);

  React.useEffect(() => {
    if (loadedRoute.current === routeKey) return;
    loadedRoute.current = routeKey;
    const documentEpoch = ++epoch.current;
    draftKey.current = draftParam || crypto.randomUUID();
    const current = () => epoch.current === documentEpoch;
    update({ draft: emptyStudioDraft(brandParam || ''), ready: false, loadError: '', recovery: null, detail: null, dirty: false,
      saveState: 'idle', saveMessage: '', history: emptyHistory(), localState: 'idle', localSavedAt: null, ...busyState });
    // A bare new=draft is intentional creation. Give it a stable address before
    // any typing, persistence or reload can happen.
    if (!itemParam && newParam && !draftParam) writeUrl(emptyStudioDraft(brandParam || ''));
    async function initialize() {
      let contentId = itemParam, variantId = variantParam, local = null;
      try {
        if (contentId || draftParam) {
          local = await readStudioDocumentMirror({ scope, contentId, variantId, draftKey: draftParam });
          if (!current()) return;
          if (!contentId && local?.draft) { contentId = local.draft.contentId; variantId = local.draft.variantId; }
        } else if (!newParam) {
          const pointer = await readStudioMirror('active:v2:' + scope);
          if (!current()) return;
          if (pointer?.mirrorKey) {
            local = await readStudioMirror(pointer.mirrorKey);
            if (!current()) return;
            contentId = pointer.contentId; variantId = pointer.variantId;
          } else {
            const old = await readStudioMirror('active');
            if (!current()) return;
            if (old && (old.body || old.title || old.slides?.length)) local = { draft: {
              ...emptyStudioDraft(old.brandId), title: old.title || '', variantTitle: old.title || '',
              body: old.mode === 'carousel' ? JSON.stringify({ slides: old.slides || [] }) : old.body || '',
              variantType: old.mode === 'carousel' ? 'card_news' : 'blog_insight', channel: old.mode === 'carousel' ? 'instagram' : 'blog',
            }, dirty: true, legacy: true };
          }
        }
      } catch { if (current()) update({ localState: 'error' }); }
      if (!current()) return;
      if (local?.draftKey && !draftParam) draftKey.current = local.draftKey;
      let detail = null, draft = emptyStudioDraft(brandParam || ''), unavailable = false, readError = '';
      if (contentId) {
        try {
          detail = await getDetail(contentId);
          if (!current()) return;
          draft = draftFromDetail(detail, variantId);
        } catch (error) {
          if (!current()) return;
          unavailable = true; readError = error.message;
        }
        if (!local && !unavailable) {
          try { local = await readStudioMirror(studioMirrorKey(draft)); }
          catch { if (current()) update({ localState: 'error' }); }
          if (!current()) return;
        }
      }
      if (!current()) return;
      if (unavailable && !local?.draft) { update({ loadError: readError, ready: false }); return; }
      const pendingSave = local?.pendingSave || null, pendingMutation = local?.pendingMutation || null;
      if (local?.draft && (pendingSave || pendingMutation)) {
        // An uncertain receipt takes precedence over copying stale content.
        // Save/retry resumes it before any new write can be constructed.
        update({ draft: local.draft, dirty: Boolean(local.dirty || pendingSave), detail, ready: true, recovery: null,
          pendingSave, pendingMutation, saveState: 'error', localSavedAt: local.savedAt,
          saveMessage: pendingMutation ? '이전 작업의 응답을 확인하지 못했습니다. 이전 작업 상태 확인으로 같은 요청을 재개해주세요.' : '이전 저장의 응답을 확인하지 못했습니다. 다시 저장하면 같은 요청부터 확인합니다.' });
        resetQueue(); writeUrl(local.draft); return;
      }
      const recovery = local?.draft && (unavailable || local.dirty || local.legacy) && (unavailable || studioFingerprint(local.draft) !== studioFingerprint(draft))
        ? { local: local.draft, server: draft, savedAt: local.savedAt, unavailable, stale: Boolean(unavailable || local.legacy || local.draft.contentId && (
          local.draft.variantUpdatedAt !== draft.variantUpdatedAt || local.draft.itemUpdatedAt !== draft.itemUpdatedAt)) }
        : null;
      update({ draft, dirty: false, detail, ready: true, recovery, saveState: draft.variantId ? 'saved' : 'idle',
        saveMessage: unavailable ? '서버 상태를 확인할 수 없습니다. 브라우저 사본을 새 콘텐츠로 복구하거나 다시 불러올 수 있습니다.' : '' });
      resetQueue();
      if (!unavailable) writeUrl(draft);
    }
    initialize();
  }, [routeKey, scope, itemParam, variantParam, newParam, draftParam, brandParam, resetQueue, update, writeUrl]);
  React.useEffect(() => () => { epoch.current += 1; loadedRoute.current = null; }, []);

  const edit = React.useCallback((patch) => {
    const current = stateRef.current;
    if (!current.ready || current.recovery || current.busy || current.pendingMutation) return;
    const draft = typeof patch === 'function' ? patch(current.draft) : { ...current.draft, ...patch };
    update({ draft, dirty: true, editTick: current.editTick + 1, saveState: 'editing', saveMessage: '' });
    mirror(draft, true).catch(() => {});
  }, [mirror, update]);
  const save = React.useCallback(async (checkpoint = false) => {
    if (!stateRef.current.ready || stateRef.current.recovery || stateRef.current.pendingMutation) return null;
    const documentEpoch = epoch.current;
    update({ saveState: 'saving', saveMessage: '' });
    try {
      const draft = await queueRef.current.flush(checkpoint || !stateRef.current.draft.variantId);
      if (epoch.current !== documentEpoch) return null;
      update({ saveState: stateRef.current.dirty ? 'editing' : draft.variantId ? 'saved' : 'idle' });
      return draft;
    } catch (error) {
      if (epoch.current !== documentEpoch) return null;
      update({ saveState: error.result?.status === 'preview' ? 'local' : error.result?.status === 'conflict' ? 'conflict' : 'error',
        saveMessage: error.result ? studioErrorMessage(error.result) : '서버 저장을 확인하지 못했습니다. 다시 저장하면 같은 요청부터 확인합니다.' });
      return null;
    }
  }, [update]);
  React.useEffect(() => {
    if (!state.ready || !state.dirty || state.recovery || state.busy || state.pendingMutation || state.saveState !== 'editing') return;
    const timer = setTimeout(() => { save(); }, 1200);
    return () => clearTimeout(timer);
  }, [state.editTick, state.ready, state.recovery, state.busy, state.pendingMutation, state.saveState, state.dirty, save]);
  React.useEffect(() => {
    const beforeUnload = (event) => { if (stateRef.current.dirty || stateRef.current.pendingSave || stateRef.current.pendingMutation) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const adopt = React.useCallback((draft, detail, dirty = false, { newIdentity = false, persisted = false } = {}) => {
    epoch.current += 1;
    if (newIdentity) draftKey.current = crypto.randomUUID();
    update({ draft, detail, dirty, recovery: null, ready: true, loadError: '', saveState: dirty ? 'editing' : draft.variantId ? 'saved' : 'idle',
      saveMessage: '', history: emptyHistory(), ...busyState, editTick: stateRef.current.editTick + 1 });
    resetQueue(); writeUrl(draft);
    if (!persisted) mirror(draft, dirty, { pendingSave: null, pendingMutation: null }).catch(() => {});
  }, [mirror, resetQueue, update, writeUrl]);
  const switchVariant = async (variantId) => {
    const state = stateRef.current;
    if (!state.ready || state.busy || state.recovery || state.pendingMutation) return;
    const documentEpoch = epoch.current;
    update({ busy: true });
    try {
      const saved = await save();
      if (epoch.current !== documentEpoch || !saved?.contentId) return;
      const detail = await getDetail(saved.contentId);
      if (epoch.current !== documentEpoch) return;
      adopt(draftFromDetail(detail, variantId), detail);
    } catch (error) { if (epoch.current === documentEpoch) update({ saveMessage: error.message }); }
    finally { if (epoch.current === documentEpoch) update({ busy: false }); }
  };
  const newDraft = async () => {
    const state = stateRef.current;
    if ((!state.ready && !state.loadError) || state.busy || state.recovery || state.pendingMutation) return;
    const documentEpoch = epoch.current, brand = state.draft.brandId;
    update({ busy: true });
    try {
      if ((state.dirty || state.pendingSave) && !await save()) return;
      if (epoch.current !== documentEpoch) return;
      adopt(emptyStudioDraft(brand), null, false, { newIdentity: true });
    } finally { if (epoch.current === documentEpoch) update({ busy: false }); }
  };
  const refreshHistory = async (more = false) => {
    const { contentId, variantId } = stateRef.current.draft, documentEpoch = epoch.current;
    const previous = stateRef.current.history;
    if (!contentId || !variantId || (more && (previous.loading || !previous.nextCursor))) return;
    const request = ++historyRequest.current;
    const params = new URLSearchParams({ item: contentId, variant: variantId });
    if (more) for (const [key, value] of Object.entries(previous.nextCursor)) params.set(key, value);
    update({ history: { ...(more ? previous : emptyHistory()), loading: true } });
    const current = () => epoch.current === documentEpoch && historyRequest.current === request && stateRef.current.draft.variantId === variantId;
    try {
      const response = await fetch('/api/hub/content/history?' + params, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!current()) return;
      if (!response.ok || result.status !== 'live') throw Error('버전 기록을 불러오지 못했습니다. 다시 시도해주세요.');
      const revisions = [...(more ? previous.revisions : []), ...result.revisions];
      update({ history: { revisions: [...new Map(revisions.map(row => [row.id, row])).values()], nextCursor: result.nextCursor, loading: false, error: '' } });
    } catch (error) { if (current()) update({ history: { ...stateRef.current.history, loading: false, error: error.message } }); }
  };
  const compareLatest = async () => {
    const before = stateRef.current, documentEpoch = epoch.current;
    if (!before.draft.contentId || before.busy || before.pendingSave || before.pendingMutation) return;
    update({ busy: true });
    try {
      const detail = await getDetail(before.draft.contentId);
      if (epoch.current !== documentEpoch) return;
      update({ detail, recovery: { local: stateRef.current.draft, server: draftFromDetail(detail, before.draft.variantId), stale: true } });
    } catch (error) { if (epoch.current === documentEpoch) update({ saveMessage: error.message }); }
    finally { if (epoch.current === documentEpoch) update({ busy: false }); }
  };
  const retryLoad = () => { loadedRoute.current = null; window.location.reload(); };
  const recover = (useLocal) => {
    const { recovery, detail, busy, pendingSave, pendingMutation } = stateRef.current;
    if (!recovery || busy || pendingSave || pendingMutation) return;
    if (!useLocal && recovery.unavailable) { retryLoad(); return; }
    const draft = useLocal ? recovery.stale ? copyAsNew(recovery.local) : recovery.local : recovery.server;
    adopt(draft, draft.contentId ? detail : null, useLocal, { newIdentity: useLocal && recovery.stale });
  };
  const mutate = async (command) => {
    const state = stateRef.current;
    if (!state.ready || state.busy || state.recovery) return null;
    if (state.pendingMutation && JSON.stringify(state.pendingMutation.command) !== JSON.stringify(command)) {
      update({ saveMessage: '이전 작업의 응답을 확인하지 못했습니다. 먼저 이전 작업 상태를 확인해주세요.' }); return null;
    }
    const documentEpoch = epoch.current;
    const current = () => epoch.current === documentEpoch;
    update({ busy: true });
    try {
      let pending = stateRef.current.pendingMutation;
      if (!pending) {
        const draft = await save();
        if (!current() || !draft?.variantId) return null;
        pending = { command: structuredClone(command), request: {
          ...command, requestId: command.requestId || crypto.randomUUID(),
          contentId: draft.contentId, variantId: draft.variantId,
          expectedItemUpdatedAt: draft.itemUpdatedAt, expectedVariantUpdatedAt: draft.variantUpdatedAt,
        } };
        update({ pendingMutation: pending });
      }
      const source = stateRef.current.draft;
      const sourceKey = studioMirrorKey({ ...source, draftKey: draftKey.current });
      await mirror(source, stateRef.current.dirty, { pendingMutation: pending });
      if (!current()) return null;
      const result = await postStudio('workflow', pending.request);
      if (!current()) return null;
      if (!isDurableStudioSave(result)) {
        if (isDefinitiveStudioRejection(result)) {
          await mirror(stateRef.current.draft, stateRef.current.dirty, { pendingMutation: null });
          if (!current()) return null;
          update({ pendingMutation: null });
        }
        update({ saveState: result.status === 'conflict' ? 'conflict' : 'error', saveMessage: studioErrorMessage(result) });
        return null;
      }
      const prior = stateRef.current.detail;
      const detail = { ...prior, item: result.item, variants: [...(prior?.variants || []).filter((row) => row.id !== result.variant.id), result.variant] };
      const draft = draftFromDetail(detail, result.variant.id);
      // A branch's accepted mirror and its source receipt clear share one IDB
      // transaction; the source variant's own draft remains at its exact key.
      await mirror(draft, false, { pendingSave: null, pendingMutation: null }, { clearMutationKey: sourceKey });
      if (!current()) return null;
      adopt(draft, detail, false, { persisted: true });
      window.dispatchEvent(new Event('moonlight:content-saved'));
      return result;
    } catch { if (current()) update({ saveMessage: '처리 결과를 확인하지 못했습니다. 이전 작업 상태 확인으로 같은 요청을 재개해주세요.', saveState: 'error' }); return null; }
    finally { if (current()) update({ busy: false }); }
  };
  const recordPublication = async (url, date) => {
    if (!stateRef.current.ready || stateRef.current.busy || stateRef.current.recovery || stateRef.current.pendingMutation) return false;
    const documentEpoch = epoch.current;
    const current = () => documentEpoch === epoch.current;
    update({ busy: true });
    try {
      if (publicationAttempt.current && (publicationAttempt.current.contentId !== stateRef.current.draft.contentId || publicationAttempt.current.variantId !== stateRef.current.draft.variantId)) publicationAttempt.current = null;
      let command = publicationAttempt.current;
      if (!command) {
        const fields = manualPublicationFields(url, date);
        const saved = await save();
        if (!current() || !saved?.variantId) return false;
        command = { action: 'record_publication', contentId: saved.contentId, variantId: saved.variantId,
          logId: crypto.randomUUID(), channel: saved.channel, ...fields };
        publicationAttempt.current = command;
      }
      const response = await fetch('/api/hub/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!current()) return false;
      if (!response.ok || !['saved', 'duplicate'].includes(result.status)) {
        if (response.status === 400) publicationAttempt.current = null;
        throw new Error(result.error || '발행 기록을 저장하지 못했습니다. 같은 기록으로 다시 확인해주세요.');
      }
      const ledger = await refreshContentLedger();
      if (!current()) return false;
      if (!publicationIsVerified(ledger, command)) throw new Error('발행 기록을 다시 확인하지 못했습니다. 같은 기록으로 재시도해주세요.');
      const detail = await getDetail(command.contentId);
      if (!current()) return false;
      // Refresh exact versions after publication so the next edit does not use stale timestamps.
      const latest = draftFromDetail(detail, command.variantId);
      const dirty = stateRef.current.dirty;
      const draft = dirty ? { ...stateRef.current.draft, itemUpdatedAt: latest.itemUpdatedAt,
        variantUpdatedAt: latest.variantUpdatedAt, status: latest.status } : latest;
      adopt(draft, detail, dirty);
      publicationAttempt.current = null;
      window.dispatchEvent(new Event('moonlight:content-saved'));
      return true;
    } catch (error) {
      if (current()) update({ saveMessage: error.message });
      return false;
    } finally { if (current()) update({ busy: false }); }
  };
  return { ...state, edit, save, recordPublication, switchVariant, newDraft, refreshHistory, compareLatest, recover, mutate, retryLoad,
    retryMutation: () => stateRef.current.pendingMutation && mutate(stateRef.current.pendingMutation.command), getDraft: () => stateRef.current.draft };
}
