'use client';
import React from 'react';
import { createOfficeSessionStore, officeUnloadGuard } from './office-session';
import { officeMentorSessions } from './office-mentor-session';

const OfficeSessionContext = React.createContext(null);

// Mentor consultations live in a module store that outlives page navigation, so the
// Hub shell guards their unsent questions together with the Office composer drafts.
export function OfficeSessionProvider({ children, mentorStore = officeMentorSessions }) {
  const [store] = React.useState(createOfficeSessionStore);
  React.useEffect(() => {
    const guard = officeUnloadGuard([store, mentorStore]);
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [store, mentorStore]);
  return <OfficeSessionContext.Provider value={store}>{children}</OfficeSessionContext.Provider>;
}

export function useOfficeSession(scope) {
  const store = React.useContext(OfficeSessionContext);
  if (!store) throw new Error('오피스는 Hub 세션 안에서 열어 주세요.');
  const getSnapshot = React.useCallback(() => store.get(scope), [store, scope]);
  const session = React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
  return { session, store, update: patch => store.update(scope, patch) };
}
