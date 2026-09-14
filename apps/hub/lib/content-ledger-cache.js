export const CONTENT_LEDGER_CHANGED_EVENT = "moonlight:content-ledger-changed";

export const EMPTY_CONTENT_LEDGER = Object.freeze({
  source: "preview", syncState: "preview", brands: [], items: [], variants: [],
  assets: [], publishLogs: [], campaigns: [], queue: [], pipeline: [], attention: [],
  summary: null, ideaQueue: [], cadence: null,
});

// Shared by the editor, queue and brand log. An invalidated read cannot overwrite a
// newer post-save read, and simultaneous consumers share one request.
export function createContentLedgerCache(fetcher = (...args) => fetch(...args)) {
  let snapshot = EMPTY_CONTENT_LEDGER;
  let pending = null;
  let generation = 0;
  let refreshedAt = 0;
  const listeners = new Set();
  const publish = (next) => { snapshot = next; listeners.forEach((fn) => fn()); };
  const refresh = () => {
    if (pending) return pending;
    const current = generation;
    const hadLive = snapshot.source === "supabase" && Date.now() - refreshedAt < 5 * 60 * 1000;
    if (!hadLive) publish({ ...EMPTY_CONTENT_LEDGER, syncState: "loading" });
    pending = (async () => {
      try {
        const response = await fetcher("/api/hub/content", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data || data.status === "error") throw new Error("Content read failed");
        if (current !== generation) return snapshot;
        if (data.source !== "supabase") {
          publish(EMPTY_CONTENT_LEDGER);
        } else {
          const next = { ...EMPTY_CONTENT_LEDGER, source: "supabase", syncState: data.status === "partial" ? "partial" : "live" };
          for (const key of Object.keys(EMPTY_CONTENT_LEDGER)) {
            if (Array.isArray(EMPTY_CONTENT_LEDGER[key])) next[key] = Array.isArray(data[key]) ? data[key] : [];
          }
          next.summary = data.summary || null;
          next.cadence = data.cadence || null;
          refreshedAt = Date.now();
          publish(next);
        }
      } catch {
        if (current === generation) publish({ ...snapshot, syncState: hadLive ? "partial" : "error" });
      } finally {
        if (current === generation) pending = null;
      }
      return snapshot;
    })();
    return pending;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    refresh,
    invalidate: () => { generation += 1; pending = null; return refresh(); },
  };
}

export function notifyContentLedgerChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONTENT_LEDGER_CHANGED_EVENT));
}
