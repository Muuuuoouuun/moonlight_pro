"use client";

// Revenue pages and command search share the browser read, its truth state and
// invalidation. Keep this small module out of the large revenue page chunk.
export const REVENUE_CACHE_SERVABLE_MS = 5 * 60 * 1000;
const READ_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1200;

const EMPTY_REVENUE_LEDGER = Object.freeze({
  source: 'preview', leads: [], deals: [], stages: [], accounts: [], cases: [], contacts: [], companies: [],
  // Unknown/unread is null; {} would falsely claim that no monthly targets exist.
  revenueTargets: null, summary: null,
});
const INITIAL_SNAPSHOT = Object.freeze({ at: null, ledger: EMPTY_REVENUE_LEDGER, syncState: 'loading' });
const COLLECTIONS = ['leads', 'deals', 'stages', 'accounts', 'cases', 'contacts', 'companies'];

function revenueSnapshot(data, at) {
  if (!data || data.source === 'error' || !['live', 'partial', 'preview'].includes(data.status)) {
    throw Error('revenue-read-failed');
  }
  if (data.status === 'preview') {
    if (data.source !== 'preview') throw Error('revenue-read-invalid');
    return { at, ledger: EMPTY_REVENUE_LEDGER, syncState: 'preview' };
  }
  if (data.source !== 'supabase' || !Array.isArray(data.leads) || !Array.isArray(data.deals)
    || COLLECTIONS.some((key) => data[key] != null && !Array.isArray(data[key]))) {
    throw Error('revenue-read-invalid');
  }
  const ledger = { ...EMPTY_REVENUE_LEDGER, source: 'supabase' };
  for (const key of COLLECTIONS) ledger[key] = data[key] || [];
  ledger.revenueTargets = data.revenueTargets && typeof data.revenueTargets === 'object' ? data.revenueTargets : null;
  ledger.summary = data.summary || null;
  return { at, ledger, syncState: data.status };
}

export function createRevenueLedgerCache({ fetcher = (...args) => fetch(...args), now = Date.now } = {}) {
  let snapshot = INITIAL_SNAPSHOT;
  let pending = null;
  const listeners = new Set();
  const isServable = () => snapshot.at !== null && now() - snapshot.at < REVENUE_CACHE_SERVABLE_MS;
  // A render must not switch to loading just because time passed. Only an actual
  // refresh publishes that transition and starts the request that can finish it.
  const getSnapshot = () => snapshot;
  const publish = (next) => { snapshot = next; listeners.forEach((listener) => listener()); };

  async function request(work) {
    const controller = new AbortController();
    work.cancel = () => controller.abort();
    let onAbort;
    const interrupted = new Promise((_, reject) => {
      onAbort = () => reject(Error('revenue-read-aborted'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    try {
      // Race the whole read, including json(), so even an unresponsive transport
      // releases the pending slot. Its later completion never publishes directly.
      return await Promise.race([interrupted, (async () => {
        if (controller.signal.aborted) throw Error('revenue-read-aborted');
        const response = await fetcher('/api/hub/revenue', { cache: 'no-store', signal: controller.signal });
        if (!response.ok || controller.signal.aborted) throw Error('revenue-read-failed');
        return revenueSnapshot(await response.json(), now());
      })()]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      work.cancel = null;
    }
  }

  function retryPause(work) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { work.cancel = null; resolve(); }, RETRY_DELAY_MS);
      work.cancel = () => { clearTimeout(timer); resolve(); };
    });
  }

  function refresh(reset = false) {
    if (pending) return pending.promise;
    const work = { promise: null, cancel: null };
    // Register before publishing or calling the transport: either can reenter.
    work.promise = Promise.resolve().then(async () => {
      try {
        for (let attempt = 0; attempt < 2 && pending === work; attempt++) {
          try {
            const next = await request(work);
            if (pending === work) publish(next);
            break;
          } catch {
            if (pending !== work) break;
            if (attempt === 0) {
              await retryPause(work);
            } else {
              // Check age now, not at request start. A failed refresh never renews
              // the age of the last successful read or keeps preview rows alive.
              publish(isServable() && snapshot.ledger.source === 'supabase'
                ? { ...snapshot, syncState: 'partial' }
                : { ...INITIAL_SNAPSHOT, syncState: 'error' });
            }
          }
        }
      } finally {
        if (pending === work) pending = null;
      }
      return getSnapshot();
    });
    pending = work;
    if (reset || !isServable()) publish(INITIAL_SNAPSHOT);
    return work.promise;
  }

  return {
    getSnapshot,
    getServableSnapshot: () => isServable() ? snapshot : null,
    getServerSnapshot: () => INITIAL_SNAPSHOT,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    refresh: () => refresh(),
    invalidate: () => {
      const obsolete = pending;
      pending = null;
      obsolete?.cancel?.();
      return refresh(true);
    },
  };
}

export const revenueLedgerCache = createRevenueLedgerCache();
