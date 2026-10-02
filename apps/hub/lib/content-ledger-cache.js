export const CONTENT_LEDGER_CHANGED_EVENT = "moonlight:content-ledger-changed";

export const EMPTY_CONTENT_LEDGER = Object.freeze({
  source: "preview", syncState: "preview", brands: [], items: [], variants: [],
  assets: [], publishLogs: [], campaigns: [], queue: [], pipeline: [], attention: [],
  summary: null, ideaQueue: [], cadence: null, tagTrends: [],
});
const LOADING_CONTENT_LEDGER = Object.freeze({ ...EMPTY_CONTENT_LEDGER, syncState: "loading" });

const READ_TIMEOUT_MS = 15_000;
const SERVABLE_MS = 5 * 60 * 1000;

function readableEnvelope(data, catalogOnly) {
  if (data?.source === "preview" && data.status === "preview") return true;
  return data?.source === "supabase"
    && ["live", "partial"].includes(data.status)
    && (catalogOnly ? ["brands"] : ["brands", "items", "variants"]).every((key) => Array.isArray(data[key]));
}

// Shared by the editor, queue and brand log. An invalidated read cannot overwrite a
// newer post-save read, and simultaneous consumers share one request.
export function createContentLedgerCache(fetcher = (...args) => fetch(...args), { catalogOnly = false } = {}) {
  let snapshot = LOADING_CONTENT_LEDGER;
  let pending = null;
  let generation = 0;
  let refreshedAt = 0;
  const listeners = new Set();
  const publish = (next) => { snapshot = next; listeners.forEach((fn) => fn()); };
  const hasRecentLive = () => snapshot.source === "supabase" && Date.now() - refreshedAt < SERVABLE_MS;
  const refresh = () => {
    if (pending) return pending.promise;
    const current = generation;
    const controller = new AbortController();
    const request = { controller, promise: null };
    // Register before notifying subscribers or calling transport. Either can
    // re-enter refresh, and a synchronous transport failure must release pending.
    request.promise = Promise.resolve().then(async () => {
      let deadline;
      try {
        if (current !== generation) return snapshot;
        if (!hasRecentLive()) publish(LOADING_CONTENT_LEDGER);
        if (current !== generation) return snapshot;
        deadline = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
        const response = await fetcher(catalogOnly ? "/api/hub/content/catalog" : "/api/hub/content", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted || !response.ok || !readableEnvelope(data, catalogOnly)) throw new Error("Content read failed");
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
        if (current === generation) publish(hasRecentLive()
          ? { ...snapshot, syncState: "partial" }
          : { ...EMPTY_CONTENT_LEDGER, syncState: "error" });
      } finally {
        clearTimeout(deadline);
        if (pending === request) pending = null;
      }
      return snapshot;
    });
    pending = request;
    return request.promise;
  };
  return {
    getSnapshot: () => snapshot.source === "supabase" && !hasRecentLive() ? LOADING_CONTENT_LEDGER : snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    refresh,
    invalidate: () => {
      generation += 1;
      pending?.controller.abort();
      pending = null;
      return refresh();
    },
  };
}

export function notifyContentLedgerChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONTENT_LEDGER_CHANGED_EVENT));
}
