'use client';
import React from 'react';
import { loadedOfficeUnloadStores, officeUnloadGuard } from './office-unload';

export const OfficeSessionContext = React.createContext(null);

// The shell holds an empty box; the Office screen fills it with the composer store the
// first time it opens (use-office-session.js), so the Office code stays out of the first
// bundle. Mentor consultations live in a module store that outlives page navigation and
// registers itself when loaded, so one guard covers both kinds of unsent text.
export function OfficeSessionProvider({ children }) {
  const [holder] = React.useState(() => ({ store: null }));
  React.useEffect(() => {
    const guard = event => officeUnloadGuard([holder.store, ...loadedOfficeUnloadStores()])(event);
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [holder]);
  return <OfficeSessionContext.Provider value={holder}>{children}</OfficeSessionContext.Provider>;
}
