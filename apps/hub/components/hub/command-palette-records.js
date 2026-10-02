import { revenueLedgerCache } from './revenue-shared-cache.js';

const SOURCES = ['revenue', 'tasks'];
const CACHE_MS = 60_000;

export const paletteItemKey = (item) => item && `${item.kind}:${item.path || item.action}:${item.label}`;

export function matchingPaletteRecords(records, matches, selectedKey, limit = 8) {
  const hits = [];
  let selectedFound = false;
  for (const item of records) {
    if (!matches(item)) continue;
    const selected = paletteItemKey(item) === selectedKey;
    if (hits.length < limit) hits.push(item);
    else if (selected) hits[limit - 1] = item;
    selectedFound ||= selected;
    if (hits.length === limit && (!selectedKey || selectedFound)) break;
  }
  return hits;
}

function recordItems(source, data) {
  if (data.status === 'preview') return [];
  const items = [];
  if (source === 'revenue') {
    for (const lead of data.leads) {
      if (!lead?.id || !lead?.name) continue;
      items.push({ kind: '고객', label: lead.name, icon: 'leads',
        path: `dashboard/revenue/customers?customer=${encodeURIComponent(`lead:${lead.id}`)}`,
        keywords: [lead.companyName || '', lead.stage || ''] });
    }
    for (const deal of data.deals) {
      if (!deal?.id || !deal?.name) continue;
      items.push({ kind: '딜', label: deal.name, icon: 'deals',
        path: `dashboard/revenue/deals?deal=${encodeURIComponent(deal.id)}` });
    }
  } else {
    for (const task of data.tasks) {
      if (!task?.id || !task?.title || task.done) continue;
      items.push({ kind: '할 일', label: task.title, icon: 'inbox',
        path: `dashboard/work/my?task=${encodeURIComponent(task.id)}` });
    }
  }
  return items;
}

function sourceResult(source, data) {
  if (!data || data.source === 'error' || !['live', 'partial', 'preview'].includes(data.status)) {
    throw Error('record-read-failed');
  }
  const fields = source === 'revenue' ? ['leads', 'deals'] : ['tasks'];
  if (data.status !== 'preview' && fields.some((field) => !Array.isArray(data[field]))) {
    throw Error('record-read-invalid');
  }
  return { status: data.status, items: recordItems(source, data) };
}

// Revenue has one authoritative cache shared with its pages. Only tasks have a
// palette-owned cache; either source can finish without waiting for the other.
export function createCommandPaletteRecordLoader({
  fetcher = (...args) => fetch(...args), revenueCache = revenueLedgerCache, now = Date.now,
} = {}) {
  let taskCache = null, taskPending = null;
  let indexedSnapshot = null, indexedRevenue = null;
  function revenueResult() {
    const snapshot = revenueCache.getSnapshot();
    if (snapshot !== indexedSnapshot) {
      indexedSnapshot = snapshot;
      indexedRevenue = ['loading', 'error'].includes(snapshot.syncState)
        ? { status: snapshot.syncState, items: [] }
        : sourceResult('revenue', { ...snapshot.ledger, status: snapshot.syncState });
    }
    return indexedRevenue;
  }
  function readTasks() {
    if (taskPending) return taskPending;
    const promise = Promise.resolve().then(async () => {
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Error('record-read-timeout')); }, 15_000);
      });
      try {
        const result = await Promise.race([deadline, (async () => {
          const response = await fetcher('/api/hub/tasks', { cache: 'no-store', signal: controller.signal });
          if (!response.ok || controller.signal.aborted) throw Error('record-read-failed');
          return sourceResult('tasks', await response.json());
        })()]);
        // A partial result remains usable now, but a retry must read it again.
        if (result.status !== 'partial') taskCache = { at: now(), result };
        return result;
      } catch {
        return { status: 'error', items: [] };
      } finally {
        clearTimeout(timer);
        if (taskPending === promise) taskPending = null;
      }
    });
    taskPending = promise;
    return promise;
  }
  return function load(onChange) {
    let active = true;
    const shared = revenueCache.getServableSnapshot();
    if (!shared || shared.syncState === 'partial') void revenueCache.refresh();
    const states = {
      revenue: revenueResult(),
      tasks: taskCache && now() - taskCache.at < CACHE_MS ? taskCache.result : { status: 'loading', items: [] },
    };
    const emit = () => {
      if (active) onChange({
        items: SOURCES.flatMap((source) => states[source].items),
        sources: Object.fromEntries(SOURCES.map((source) => [source, states[source].status])),
      });
    };
    const unsubscribe = revenueCache.subscribe(() => { states.revenue = revenueResult(); emit(); });
    emit();
    if (states.tasks.status === 'loading') {
      readTasks().then((result) => { states.tasks = result; emit(); });
    }
    // Closing removes only listeners. Bounded reads can still warm the next open.
    return () => { active = false; unsubscribe(); };
  };
}

export const loadPaletteRecords = createCommandPaletteRecordLoader();
