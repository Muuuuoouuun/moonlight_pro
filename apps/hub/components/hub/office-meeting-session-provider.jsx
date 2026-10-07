'use client';
import React from 'react';
import { OfficeSessionContext } from './office-session-provider';
import { createOfficeSessionStore } from './office-session';
import { registerOfficeUnloadStore } from './office-unload';

// The saved-room composer is independent of the existing transient conversation.
// Its module stays loaded across Hub page navigation, retaining unsent text without
// writing it to browser storage or claiming it was saved on the server.
const holder = { store: createOfficeSessionStore() };
registerOfficeUnloadStore(holder.store);

export function OfficeMeetingSessionProvider({ children }) {
  return <OfficeSessionContext.Provider value={holder}>{children}</OfficeSessionContext.Provider>;
}
