import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tick = () => new Promise(setImmediate);
const brief = (revision) => ({ id: 'research-one', state: 'new', revision, stateVersion: revision });
const live = (revision) => ({ status: 'live', briefs: [brief(revision)] });
const metrics = (views) => ({ status: 'live', publications: [{ id: 'publication-one', metrics: { capturedAt: '2026-10-02', views } }] });

// Execute the pages' actual pre-JSX logic, with explicit render/effect phases.
// Deferred responses deliberately ignore abort so ownership checks are exercised too.
function harness(page) {
  const filename = page === 'research' ? 'research-inbox' : 'content-publish-log';
  const name = page === 'research' ? 'ResearchInbox' : 'ContentPublishLog';
  const ending = page === 'research' ? '\n  return <div className="hub-page' : '\n  return (\n    <div className="hub-page';
  const exposed = page === 'research' ? '{state, catalog, reload, decide, create, setForm}' : '{metricsById, metricsFailed}';
  const source = readFileSync(new URL(`../components/hub/pages/${filename}.jsx`, import.meta.url), 'utf8')
    .split(ending)[0].replace(/^import .*;$/gm, '').replace(/^export /gm, '') + `\nreturn ${exposed};\n}\nreturn ${name};`;
  const slots = [], effects = new Set(), requests = [], events = new EventTarget(), catalogReads = [];
  const params = new URLSearchParams();
  let cursor = 0, writes = 0, toastCount = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const React = {
    useState(initial) {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => { writes++; slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) { return (slots[cursor++] ||= { current: initial }); },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useMemo(callback, deps) { return React.useCallback(callback, deps)(); },
    useEffect(setup, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) { slots[index] = { ...slots[index], setup, deps }; effects.add(index); }
    },
  };
  const dependencies = {
    React,
    fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, reject,
      resolve: (data, ok = true) => resolve({ ok, json: async () => data }) })),
    window: events,
    useRouter: () => ({ replace() {}, push() {} }),
    useSearchParams: () => params,
    useToast: () => ({ success() { toastCount++; }, error() { toastCount++; } }),
    useContentLedger: (options) => { catalogReads.push(options); return { syncState: 'live', brands: [], publishLogs: [] }; },
    useContentSchedule: () => ({ status: 'live', schedules: [] }),
    buildPublishLog: () => [], filterLog: () => [], weekStrip: () => [], countLog: () => ({}),
    createFollowUpStarter: () => () => {},
  };
  const component = new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));
  return {
    requests, catalogReads, writes: () => writes, toasts: () => toastCount,
    render() { cursor = 0; return component(); },
    start() { for (const index of effects) { slots[index].cleanup?.(); slots[index].cleanup = slots[index].setup(); } effects.clear(); },
    replay() { for (const slot of slots) if (slot.setup) { slot.cleanup?.(); slot.cleanup = slot.setup(); } },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
    refreshMetrics() { events.dispatchEvent(new Event('moonlight:content-saved')); },
  };
}

async function start(t, page) {
  const h = harness(page); t.after(() => h.unmount()); h.render(); h.start(); await tick(); return h;
}

test('research refresh cannot be rolled back by an older read', async (t) => {
  const h = await start(t, 'research');
  const old = h.requests.find(r => r.url === '/api/hub/research/briefs');
  const refreshing = h.render().reload(); await tick();
  const latest = h.requests.filter(r => r.url === old.url).at(-1);
  latest.resolve(live(2)); await refreshing;
  old.resolve(live(1)); await tick();
  assert.equal(h.render().state.briefs[0].revision, 2);
  assert.equal(old.options.signal.aborted, true);
});

test('research unmount cancels reads and suppresses late state updates', async (t) => {
  const h = await start(t, 'research'); h.unmount(); const before = h.writes();
  for (const request of h.requests) request.resolve(request.url.includes('catalog') ? { status: 'live', brands: [] } : live(1));
  await tick();
  assert.equal(h.writes(), before);
  assert.equal(h.requests[0].options.signal.aborted, true);
});

test('research Strict Mode replay dispatches only the surviving list read', async (t) => {
  const h = harness('research'); t.after(() => h.unmount()); h.render(); h.start(); h.replay(); await tick();
  assert.equal(h.requests.filter(r => r.url === '/api/hub/research/briefs').length, 1);
});

test('research uses the shared brand catalog subscription', async (t) => {
  const h = await start(t, 'research');
  assert.deepEqual(h.catalogReads[0], { catalogOnly: true });
  assert.equal(h.requests.some(r => r.url.includes('/catalog')), false);
});

test('research malformed and failed envelopes become an explicit empty error', async (t) => {
  for (const [data, ok] of [[{ status: 'live', briefs: {} }, true], [{ status: 'live', briefs: [null] }, true],
    [{ ...live(1), source: 'error' }, true], [{ status: 'unknown', briefs: [] }, true], [live(1), false]]) {
    const h = await start(t, 'research'); h.requests[0].resolve(data, ok); await tick();
    assert.equal(h.render().state.status, 'error'); assert.deepEqual(h.render().state.briefs, []); h.unmount();
  }
});

test('research preview/error never expose attached business rows', async (t) => {
  for (const status of ['preview', 'error']) {
    const h = await start(t, 'research'); h.requests[0].resolve({ ...live(1), status }); await tick();
    assert.equal(h.render().state.status, status); assert.deepEqual(h.render().state.briefs, []); h.unmount();
  }
});

test('research partial lists retain their truthful partial state', async (t) => {
  const h = await start(t, 'research'); h.requests[0].resolve({ ...live(1), status: 'partial' }); await tick();
  assert.equal(h.render().state.status, 'partial'); assert.equal(h.render().state.briefs.length, 1);
});

test('research late write acknowledgements do not reload or notify after unmount', async (t) => {
  const h = await start(t, 'research'); h.requests[0].resolve(live(1)); await tick();
  const writing = h.render().decide('defer'); await tick();
  const write = h.requests.find(r => r.options.method === 'POST'); h.unmount(); const before = h.writes();
  const count = h.requests.length; write.resolve({ status: 'saved' }); await tick();
  h.requests.slice(count).forEach(request => request.resolve(live(2))); await writing;
  assert.equal(h.writes(), before); assert.equal(h.toasts(), 0); assert.equal(h.requests.length, count);
});

test('publish metrics keep the latest refresh when an older response arrives last', async (t) => {
  const h = await start(t, 'metrics'); const old = h.requests[0];
  h.refreshMetrics(); await tick(); h.requests[1].resolve(metrics(20)); await tick();
  old.resolve(metrics(10)); await tick();
  assert.equal(h.render().metricsById['publication-one'].views, 20);
  assert.equal(old.options.signal.aborted, true);
});

test('publish metrics ignore an obsolete failure after a successful refresh', async (t) => {
  const h = await start(t, 'metrics'); h.refreshMetrics(); await tick();
  h.requests[1].resolve(metrics(20)); await tick(); h.requests[0].reject(Error('late failure')); await tick();
  assert.equal(h.render().metricsFailed, false);
});

test('publish metrics validate HTTP and source failure while retaining labeled stale metrics', async (t) => {
  for (const [data, ok] of [[metrics(30), false], [{ ...metrics(30), source: 'error' }, true], [{ status: 'live', publications: {} }, true]]) {
    const h = await start(t, 'metrics'); h.requests[0].resolve(metrics(20)); await tick();
    h.refreshMetrics(); await tick(); h.requests[1].resolve(data, ok); await tick();
    assert.equal(h.render().metricsFailed, true); assert.equal(h.render().metricsById['publication-one'].views, 20); h.unmount();
  }
});

test('publish metrics cancel transport on unmount and suppress late completions', async (t) => {
  const h = await start(t, 'metrics'); h.unmount(); const before = h.writes();
  h.requests[0].resolve(metrics(20)); await tick();
  assert.equal(h.writes(), before); assert.equal(h.requests[0].options.signal.aborted, true);
});

test('publish metrics defer the current year to the server Seoul calendar', async (t) => {
  const h = await start(t, 'metrics'); assert.equal(h.requests[0].url, '/api/hub/content/performance');
});

test('publish metrics Strict Mode replay starts one surviving request', async (t) => {
  const h = harness('metrics'); t.after(() => h.unmount()); h.render(); h.start(); h.replay(); await tick();
  assert.equal(h.requests.length, 1);
});
