import { readRevenueCache } from './revenue-shared-cache.js';

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

// Two small source caches keep a slow ledger from blocking the other one. Closing
// a palette removes only its listener; the bounded request can warm the next open.
export function createCommandPaletteRecordLoader({
  fetcher = (...args) => fetch(...args), readShared = readRevenueCache, now = Date.now,
} = {}) {
  const cache = new Map(), pending = new Map();
  function cached(source) {
    const hit = cache.get(source);
    if (hit && now() - hit.at < CACHE_MS) return hit.result;
    if (source === 'revenue') {
      const shared = readShared();
      if (shared && ['live', 'preview'].includes(shared.syncState)) {
        try { return sourceResult(source, { ...shared.ledger, status: shared.syncState }); } catch {}
      }
    }
    return null;
  }
  function read(source) {
    if (pending.has(source)) return pending.get(source);
    const promise = Promise.resolve().then(async () => {
      try {
        const response = await fetcher(`/api/hub/${source}`, {
          cache: 'no-store', signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw Error('record-read-failed');
        const result = sourceResult(source, await response.json());
        // A partial result remains usable now, but a retry must read it again.
        if (result.status !== 'partial') cache.set(source, { at: now(), result });
        return result;
      } catch {
        return { status: 'error', items: [] };
      } finally {
        pending.delete(source);
      }
    });
    pending.set(source, promise);
    return promise;
  }
  return function load(onChange) {
    let active = true;
    const states = Object.fromEntries(SOURCES.map((source) => [source, cached(source) || { status: 'loading', items: [] }]));
    const emit = () => {
      if (active) onChange({
        items: SOURCES.flatMap((source) => states[source].items),
        sources: Object.fromEntries(SOURCES.map((source) => [source, states[source].status])),
      });
    };
    emit();
    for (const source of SOURCES) {
      if (states[source].status !== 'loading') continue;
      read(source).then((result) => { states[source] = result; emit(); });
    }
    return () => { active = false; };
  };
}

export const loadPaletteRecords = createCommandPaletteRecordLoader();
