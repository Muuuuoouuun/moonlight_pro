'use client';
import React from 'react';
import { createOfficeSessionStore } from './office-session';
import { OfficeSessionContext } from './office-session-provider';

export function useOfficeSession(scope) {
  const holder = React.useContext(OfficeSessionContext);
  if (!holder) throw new Error('오피스는 Hub 세션 안에서 열어 주세요.');
  if (!holder.store) holder.store = createOfficeSessionStore();
  const { store } = holder;
  const getSnapshot = React.useCallback(() => store.get(scope), [store, scope]);
  const session = React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
  return { session, store, update: patch => store.update(scope, patch) };
}
