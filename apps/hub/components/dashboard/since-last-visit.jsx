"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Since-last-visit helpers for Slice 4 of the Delivery Situation Board.
 *
 * The hub's detail pages (PMS, Roadmap, Releases) are server components,
 * so we ship a tiny client context + a few dumb leaf components:
 *
 *   <SinceLastVisitProvider scope="pms"> wraps the page
 *   <NewSinceDot at="2026-04-09T..." /> lights up if the timestamp is
 *   newer than the previous visit recorded in localStorage
 *
 * On mount, the provider reads the previous timestamp and schedules a
 * write of the current time back to localStorage after a short delay so
 * the user actually SEES the "new" markers before they're dismissed.
 */

const STORAGE_PREFIX = "hub.lastVisit.";
const COMMIT_DELAY_MS = 6000;

const SinceLastVisitContext = createContext({ previousVisitAt: 0 });

export function SinceLastVisitProvider({ scope, children }) {
  const [previousVisitAt, setPreviousVisitAt] = useState(0);
  const committed = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const key = `${STORAGE_PREFIX}${scope}`;
    const raw = window.localStorage.getItem(key);
    const prev = raw ? Number.parseInt(raw, 10) : 0;
    setPreviousVisitAt(Number.isFinite(prev) ? prev : 0);

    const commit = () => {
      if (committed.current) return;
      committed.current = true;
      try {
        window.localStorage.setItem(key, String(Date.now()));
      } catch {
        /* quota or privacy mode — no-op */
      }
    };

    const timeoutId = window.setTimeout(commit, COMMIT_DELAY_MS);
    // Also commit on unmount so navigating away seals the visit.
    return () => {
      window.clearTimeout(timeoutId);
      commit();
    };
  }, [scope]);

  const value = useMemo(() => ({ previousVisitAt }), [previousVisitAt]);

  return (
    <SinceLastVisitContext.Provider value={value}>{children}</SinceLastVisitContext.Provider>
  );
}

export function useIsNewSince(at) {
  const { previousVisitAt } = useContext(SinceLastVisitContext);
  if (!previousVisitAt) return false;
  if (!at) return false;
  const atMs = typeof at === "number" ? at : new Date(at).getTime();
  if (!Number.isFinite(atMs)) return false;
  return atMs > previousVisitAt;
}

export function NewSinceDot({ at, label = "NEW" }) {
  const isNew = useIsNewSince(at);
  if (!isNew) return null;
  return <span className="hub-new-dot">{label}</span>;
}
