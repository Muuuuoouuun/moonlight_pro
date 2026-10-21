'use client';

import React from 'react';

// Same threshold as the shared compact/touch control floor. A manual choice is
// separate from the responsive default, so rotating/resizing never undoes it.
export const CALENDAR_COMPACT_QUERY = '(max-width: 720px)';
export const CALENDAR_VIEWS = ['agenda', 'day', 'week'];
export function resolveCalendarView(choice, compact) {
  return CALENDAR_VIEWS.includes(choice) ? choice : compact ? 'agenda' : 'week';
}
const snapshot = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia(CALENDAR_COMPACT_QUERY).matches : false;
const serverSnapshot = () => false;
function subscribe(onChange) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(CALENDAR_COMPACT_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
export function useCalendarCompactView() {
  // Server and hydration snapshots agree; the client then resolves its viewport.
  return React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
