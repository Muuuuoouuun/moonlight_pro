"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CONTENT_LEDGER_CHANGED_EVENT, createContentLedgerCache, EMPTY_CONTENT_LEDGER } from "@/lib/content-ledger-cache";

const EVENTS = [CONTENT_LEDGER_CHANGED_EVENT, "hub:brand-updated", "moonlight:content-saved"];
function createStore(catalogOnly) {
  const cache = createContentLedgerCache(undefined, { catalogOnly });
  return { cache, consumers: 0, onChanged: () => { void cache.invalidate(); } };
}
const fullStore = createStore(false);
const catalogStore = createStore(true);

export function useContentLedger({ catalogOnly = false } = {}) {
  const store = catalogOnly ? catalogStore : fullStore;
  const { cache, onChanged } = store;
  const state = useSyncExternalStore(cache.subscribe, cache.getSnapshot, () => EMPTY_CONTENT_LEDGER);
  useEffect(() => {
    if (store.consumers++ === 0) EVENTS.forEach((name) => window.addEventListener(name, onChanged));
    void cache.refresh();
    return () => {
      if (--store.consumers === 0) EVENTS.forEach((name) => window.removeEventListener(name, onChanged));
    };
  }, [store]);
  return state;
}

export const refreshContentLedger = () => fullStore.cache.invalidate();
// Deep links await the shared in-flight read before interpreting a cache miss.
export const readContentLedger = () => fullStore.cache.refresh();
