import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContentLedgerCache, EMPTY_CONTENT_LEDGER } from './content-ledger-cache.js';

const hookSource = readFileSync(new URL('../components/hub/use-content-ledger.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../components/hub/pages/content.jsx', import.meta.url), 'utf8');
const tick = () => new Promise(setImmediate);

function harness() {
  const effects = [], requests = [], updates = [];
  const window = new EventTarget();
  const store = (fetcher, options) => createContentLedgerCache((url, request) => new Promise((resolve) => {
    requests.push({ url, signal: request.signal, resolve: (data) => resolve({ ok: true, json: async () => data }) });
  }), options);
  const useEffect = (effect) => effects.push(effect);
  const useSyncExternalStore = (subscribe, getSnapshot) => {
    const unsubscribe = subscribe(() => updates.push(getSnapshot()));
    effects.push(() => unsubscribe);
    return getSnapshot();
  };
  const source = hookSource.replace(/^import .*;$/gm, '').replace(/\bexport /g, '');
  const api = new Function('useEffect', 'useSyncExternalStore', 'createContentLedgerCache',
    'EMPTY_CONTENT_LEDGER', 'CONTENT_LEDGER_CHANGED_EVENT', 'window',
    `${source}\nreturn { useContentLedger, refreshContentLedger };`)(
    useEffect, useSyncExternalStore, store, EMPTY_CONTENT_LEDGER, 'moonlight:content-ledger-changed', window);
  const cleanups = [];
  const mount = (options) => {
    const initial = api.useContentLedger(options);
    while (effects.length) cleanups.push(effects.shift()());
    return initial;
  };
  return { ...api, mount, requests, updates, window, unmount: () => cleanups.forEach((fn) => fn?.()) };
}

test('content pages consume the shared hook instead of owning a second ledger cache', () => {
  assert.match(pageSource, /import\s*\{\s*useContentLedger\s*\}\s*from\s*["']\.\.\/use-content-ledger["']/);
  assert.doesNotMatch(pageSource, /(?:function useContentLedger|let contentLedgerCache|let catalogCache)/);
});

test('queue and brand log share one read while Studio reads its independent lightweight catalog', async () => {
  const h = harness();
  h.mount(); h.mount(); h.mount({ catalogOnly: true });
  await tick();
  h.requests.forEach((request) => request.resolve({ ...EMPTY_CONTENT_LEDGER, source: 'preview', status: 'preview' }));
  await tick();
  h.unmount();
  assert.deepEqual(h.requests.map((request) => request.url).sort(), ['/api/hub/content', '/api/hub/content/catalog']);
});

test('a brand change refreshes mounted Studio catalog and unmount removes its event listener', async () => {
  const h = harness();
  h.mount({ catalogOnly: true });
  await tick();
  h.requests[0].resolve({ source: 'supabase', status: 'live', brands: [{ id: 'before' }] });
  await tick();
  h.window.dispatchEvent(new Event('hub:brand-updated'));
  await tick();
  h.requests[1].resolve({ source: 'supabase', status: 'live', brands: [{ id: 'after' }] });
  await tick();
  const urls = h.requests.map((request) => request.url);
  h.unmount();
  h.window.dispatchEvent(new Event('hub:brand-updated'));
  await tick();
  assert.deepEqual(urls, ['/api/hub/content/catalog', '/api/hub/content/catalog']);
  assert.equal(h.requests.length, 2);
  assert.equal(h.updates.at(-1).brands[0]?.id, 'after');
});
