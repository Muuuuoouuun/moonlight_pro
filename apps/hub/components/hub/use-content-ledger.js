"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CONTENT_LEDGER_CHANGED_EVENT, createContentLedgerCache, EMPTY_CONTENT_LEDGER } from "@/lib/content-ledger-cache";

const cache = createContentLedgerCache();
let consumers = 0;
const onChanged = () => { void cache.invalidate(); };

export function useContentLedger() {
  const state = useSyncExternalStore(cache.subscribe, cache.getSnapshot, () => EMPTY_CONTENT_LEDGER);
  useEffect(() => {
    if (consumers++ === 0) {
      window.addEventListener(CONTENT_LEDGER_CHANGED_EVENT, onChanged);
      window.addEventListener("hub:brand-updated", onChanged);
      window.addEventListener("moonlight:content-saved", onChanged);
    }
    void cache.refresh();
    return () => {
      if (--consumers === 0) {
        window.removeEventListener(CONTENT_LEDGER_CHANGED_EVENT, onChanged);
        window.removeEventListener("hub:brand-updated", onChanged);
        window.removeEventListener("moonlight:content-saved", onChanged);
      }
    };
  }, []);
  return state;
}

export const refreshContentLedger = () => cache.invalidate();
// Deep links await the shared in-flight read before interpreting a cache miss.
export const readContentLedger = () => cache.refresh();
