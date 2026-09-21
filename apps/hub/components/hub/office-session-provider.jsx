'use client';
import React from 'react';
import { createOfficeSessionStore } from './office-session';

const OfficeSessionContext = React.createContext(null);

export function OfficeSessionProvider({ children }) {
  const [store] = React.useState(createOfficeSessionStore);
  React.useEffect(() => {
    const guard = event => {
      if (!store.hasUnsentDrafts()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [store]);
  return <OfficeSessionContext.Provider value={store}>{children}</OfficeSessionContext.Provider>;
}

export function useOfficeSession(scope) {
  const store = React.useContext(OfficeSessionContext);
  if (!store) throw new Error('Office는 Hub 세션 안에서 열어 주세요.');
  const getSnapshot = React.useCallback(() => store.get(scope), [store, scope]);
  const session = React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
  return { session, store, update: patch => store.update(scope, patch) };
}
