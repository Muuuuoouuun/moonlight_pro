import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as model from './reports-model.js';
import { weeklyPeriods } from '../../../lib/weekly-report-fields.js';
import { reportScopeForWorkspace } from '../workspace-map.js';

const tick = () => new Promise(setImmediate);
const row = (id = 'one', revision = 1) => ({ id: `stored:${id}`, revision, kind: 'qa', scope: 'personal', title: id, createdAt: '2026-10-01T00:00:00Z', decision: `revision ${revision}` });
const page = (reports = [row()], nextCursor = null) => ({ status: 'live', reports, failedSources: [], nextCursor });

// Execute the real page's callbacks with explicit render/commit/cleanup phases.
// Transport deliberately ignores cancellation to also check response ownership.
function harness(query = '') {
  const source = readFileSync(new URL('./reports.jsx', import.meta.url), 'utf8');
  const logic = source.slice(source.indexOf('function completedPeriod('), source.indexOf('  return <div className="hub-page reports-hub"')).replace('export function Reports', 'function Reports');
  const exposed = '{ state, moreBusy, moreError, detailState, busy, error, document, drawer, visible, weeks, reload, loadMore, save, importFile, openCreate, openDecision, setDocument, setCreateKind, setDrawer }';
  const slots = [], pendingEffects = new Set(), requests = [], navigations = [], notices = [];
  const params = new URLSearchParams(query);
  const router = { replace: (...args) => navigations.push(args) };
  let cursor = 0, writes = 0, dirty = false;
  const changed = (a,b) => !a || a.length !== b.length || a.some((value,i) => value !== b[i]);
  const React = {
    useState(initial) {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; writes++; if (!Object.is(value, slots[index].value)) dirty = true; slots[index].value = value; }];
    },
    useRef(initial) { return (slots[cursor++] ||= { current: initial }); },
    useCallback(callback, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { value: callback, deps }; return slots[index].value; },
    useMemo(callback, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { value: callback(), deps }; return slots[index].value; },
    useEffect(setup, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) { slots[index] = { ...slots[index], setup, deps }; pendingEffects.add(index); } },
  };
  const deps = {
    React, ...model, weeklyPeriods, reportScopeForWorkspace,
    useRouter: () => router, useSearchParams: () => params, usePageCreateHotkey() {},
    useToast: () => ({ success: message => notices.push(message) }),
    fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, reject, resolve: (data, ok = true) => resolve({ ok, json: async () => data }) })),
    createReportWriter: () => model.createReportWriter({ fetch: deps.fetch }),
  };
  const Component = new Function(...Object.keys(deps), logic + `return ${exposed};\n}\nreturn Reports;`)(...Object.values(deps));
  const h = {
    requests, navigations, notices, writes: () => writes,
    render() { cursor = 0; return Component({}); },
    start() { const work = [...pendingEffects]; pendingEffects.clear(); for (const index of work) slots[index].cleanup?.(); for (const index of work) slots[index].cleanup = slots[index].setup(); },
    commit() { for (let i = 0; i < 20; i++) { dirty = false; const value = h.render(); h.start(); if (!dirty) return value; } throw Error('effect loop'); },
    replay() { for (const slot of slots) if (slot.setup) slot.cleanup?.(); for (const slot of slots) if (slot.setup) slot.cleanup = slot.setup(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
  return h;
}
async function start(t, query) { const h = harness(query); t.after(() => h.unmount()); h.commit(); await tick(); return h; }
async function loaded(t, query, data = page([row()], 'cursor-one')) { const h = await start(t, query); h.requests[0].resolve(data); await tick(); h.commit(); await tick(); return h; }
const lastRead = h => h.requests.filter(r => !r.options.method).at(-1);

test('report refresh cancels obsolete transport and preserves the newest list', async t => {
  const h = await start(t); const first = h.requests[0]; const refreshing = h.render().reload(); await tick();
  lastRead(h).resolve(page([row('one', 2)])); await refreshing;
  first.resolve(page([row('one', 1)])); await tick();
  assert.equal(h.render().state.reports[0].revision, 2);
  assert.equal(first.options.signal.aborted, true);
});
test('Strict Mode dispatches only its surviving report list read', async t => {
  const h = harness(); t.after(() => h.unmount()); h.commit(); h.replay(); await tick();
  assert.equal(h.requests.length, 1);
});
test('obsolete pagination cannot append rows or roll back a refreshed revision and cursor', async t => {
  const h = await loaded(t); const more = h.render().loadMore(); await tick(); const old = lastRead(h);
  const refreshing = h.render().reload(); await tick(); lastRead(h).resolve(page([row('one', 3)], 'fresh-cursor')); await refreshing;
  old.resolve(page([row('one', 1), row('obsolete')], 'old-cursor')); await more;
  assert.deepEqual(h.render().state.reports.map(r => [r.id,r.revision]), [['stored:one',3]]);
  assert.equal(h.render().state.nextCursor, 'fresh-cursor'); assert.equal(old.options.signal.aborted, true);
});
test('same-render pagination clicks send one request and refresh releases its busy state', async t => {
  const h = await loaded(t); const api = h.render(); const a = api.loadMore(), b = api.loadMore(); await tick();
  assert.equal(h.requests.filter(r => r.url.includes('?cursor=')).length, 1);
  const old = lastRead(h), refreshing = h.render().reload(); await tick();
  assert.equal(h.render().moreBusy, false);
  lastRead(h).resolve(page([row()], 'next')); await refreshing; old.resolve(page([row('old')])); await Promise.all([a,b]);
});
test('obsolete pagination failures cannot label a freshly loaded archive as failed', async t => {
  const h = await loaded(t); const more = h.render().loadMore(); await tick(); const old = lastRead(h);
  const refreshing = h.render().reload(); await tick(); lastRead(h).resolve(page()); await refreshing;
  old.reject(Error('late failure')); await more;
  assert.equal(h.render().moreError, '');
});
test('page addition remains partial and failed page reads preserve the current list', async t => {
  const h = await loaded(t); const more = h.render().loadMore(); await tick();
  lastRead(h).resolve({ ...page([row('older')], 'next'), status: 'partial', failedSources: ['office'] }); await more;
  assert.equal(h.render().state.status, 'partial'); assert.deepEqual(h.render().state.failedSources, ['office']);
  const retry = h.render().loadMore(); await tick(); lastRead(h).resolve({ ...page([row('wrong')]), source: 'error' }); await retry;
  assert.deepEqual(h.render().state.reports.map(r => r.id), ['stored:one', 'stored:older']); assert.ok(h.render().moreError);
});
test('refresh invalidates a missing-report read before React runs effect cleanup', async t => {
  const h = await loaded(t, 'report=stored:old'); const detail = lastRead(h); assert.match(detail.url, /\?report=/);
  const refreshing = h.render().reload(); await tick(); const fresh = lastRead(h);
  detail.resolve(page([row('old', 1)])); await tick();
  assert.equal(h.render().state.reports.some(r => r.id === 'stored:old'), false);
  fresh.resolve(page([row('old', 3)])); await refreshing;
  assert.equal(detail.options.signal.aborted, true);
});
test('a late detail snapshot cannot replace a newer revision loaded by pagination', async t => {
  const h = await loaded(t, 'report=stored:old'); const detail = lastRead(h);
  const more = h.render().loadMore(); await tick(); lastRead(h).resolve(page([row('old', 3)])); await more;
  detail.resolve(page([row('old', 1)])); await tick();
  assert.equal(h.render().state.reports.find(r => r.id === 'stored:old').revision, 3);
});
test('unmount cancels list detail and pagination and suppresses their late completions', async t => {
  const h = await loaded(t, 'report=stored:old'); const more = h.render().loadMore(); await tick();
  const active = h.requests.slice(1); h.unmount(); const before = h.writes();
  for (const request of active) request.resolve(page([row('old')])); await more; await tick();
  assert.equal(h.writes(), before); for (const request of active) assert.equal(request.options.signal.aborted, true);
});
test('a late save acknowledgement cannot navigate notify or read after leaving Reports', async t => {
  const h = await loaded(t); h.render().openDecision(row()); h.commit();
  const saving = h.render().save({ preventDefault() {} }); await tick(); const request = h.requests.find(r => r.options.method === 'POST');
  h.unmount(); const before = h.writes(), count = h.requests.length, navigationCount = h.navigations.length;
  request.resolve({ status: 'saved', reportId: 'one' }); await tick();
  h.requests.slice(count).forEach(r => r.resolve(page())); await saving;
  assert.equal(h.writes(), before); assert.equal(h.requests.length, count); assert.equal(h.navigations.length, navigationCount); assert.equal(h.notices.length, 0);
});
test('same-render save clicks issue one POST while retaining the writer receipt', async t => {
  const h = await loaded(t); h.render().openDecision(row()); h.commit(); const api = h.render();
  const a = api.save({ preventDefault() {} }), b = api.save({ preventDefault() {} }); await tick();
  const requests = h.requests.filter(r => r.options.method === 'POST'); assert.equal(requests.length, 1);
  requests[0].resolve({ status: 'conflict' }); await tick(); lastRead(h).resolve(page()); await Promise.all([a,b]);
});
function fileEvent(name) {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { resolve, event: { target: { value: name, files: [{ name, size: 100, text: () => promise }] } } };
}
async function documentForm(t) { const h = await loaded(t); h.render().openCreate(); h.render().setCreateKind('document'); h.commit(); return h; }
test('newer document import wins over an older slow file', async t => {
  const h = await documentForm(t); const first = fileEvent('first.md'), second = fileEvent('second.md');
  const a = h.render().importFile(first.event), b = h.render().importFile(second.event);
  second.resolve('new document'); await b; first.resolve('old document'); await a;
  assert.equal(h.render().document.body, 'new document'); assert.equal(h.render().document.title, 'second');
});
test('file reading cannot replace edits made after choosing the file', async t => {
  const h = await documentForm(t); const file = fileEvent('chosen.md'), reading = h.render().importFile(file.event);
  h.render().setDocument(current => ({ ...current, body: 'edited while waiting' }));
  file.resolve('file body'); await reading;
  assert.equal(h.render().document.body, 'edited while waiting');
});
test('closing the form or leaving Reports prevents a pending file from changing the draft', async t => {
  for (const leaving of [false,true]) {
    const h = await documentForm(t); const file = fileEvent('chosen.md'), reading = h.render().importFile(file.event);
    if (leaving) h.unmount(); else { h.render().setDrawer(null); h.commit(); }
    const before = h.writes(); file.resolve('late body'); await reading;
    assert.equal(h.writes(), before); assert.equal(h.render().document.body, '');
  }
});
test('typing in the document reuses derived report filters and week options', async t => {
  const h = await documentForm(t); const before = h.render();
  h.render().setDocument(current => ({ ...current, body: 'a keystroke' })); const after = h.render();
  assert.equal(after.visible, before.visible); assert.equal(after.weeks, before.weeks);
});
test('an obsolete page completion cannot release a newer pagination lock', async t => {
  const h = await loaded(t), oldMore = h.render().loadMore(); await tick(); const old = lastRead(h);
  const refreshing = h.render().reload(); await tick(); lastRead(h).resolve(page([row()], 'fresh')); await refreshing;
  const more = h.render().loadMore(); await tick(); const latest = lastRead(h);
  old.resolve(page([row('old')])); await oldMore;
  assert.equal(h.render().moreBusy, true);
  const duplicate = h.render().loadMore(); await tick(); assert.equal(lastRead(h), latest);
  latest.resolve(page([row('latest')])); await Promise.all([more, duplicate]);
  assert.deepEqual(h.render().state.reports.map(r => r.id), ['stored:one', 'stored:latest']);
});
test('pending imports cannot replace the submitted draft and uncertain save retries retain their receipt', async t => {
  const h = await documentForm(t);
  h.render().setDocument(current => ({ ...current, title: 'Saved title', body: 'Submitted body' })); h.commit();
  const file = fileEvent('late.md'), reading = h.render().importFile(file.event);
  const saving = h.render().save({ preventDefault() {} }); await tick(); const first = h.requests.at(-1);
  file.resolve('Late file'); await reading; assert.equal(h.render().document.body, 'Submitted body');
  first.reject(Error('response lost')); await saving;
  assert.equal(h.render().drawer, 'create'); assert.ok(h.render().error); assert.equal(h.render().busy, false);
  const retry = h.render().save({ preventDefault() {} }); await tick(); const second = h.requests.at(-1);
  assert.deepEqual(JSON.parse(second.options.body), JSON.parse(first.options.body));
  second.resolve({ status: 'duplicate', reportId: 'one' }); await tick(); lastRead(h).resolve(page()); await retry;
  assert.equal(h.render().drawer, null); assert.equal(h.render().document.body, ''); assert.equal(h.notices.length, 1);
});
test('leaving during the post-save refresh suppresses its late notification', async t => {
  const h = await loaded(t); h.render().openDecision(row()); h.commit();
  const saving = h.render().save({ preventDefault() {} }); await tick(); h.requests.at(-1).resolve({ status: 'saved', reportId: 'one' }); await tick();
  const refresh = lastRead(h); h.unmount(); const before = h.writes(); refresh.resolve(page()); await saving;
  assert.equal(h.writes(), before); assert.equal(h.notices.length, 0); assert.equal(refresh.options.signal.aborted, true);
});
test('a refresh batched into one commit restarts a deep-link detail outside the first page', async t => {
  const h = await loaded(t, 'report=stored:old'); const old = lastRead(h);
  const refreshing = h.render().reload(); await tick(); lastRead(h).resolve(page()); await refreshing;
  h.commit(); await tick(); const fresh = lastRead(h);
  assert.notEqual(fresh, old); assert.match(fresh.url, /\?report=/); assert.equal(old.options.signal.aborted, true);
  fresh.resolve(page([row('old', 3)])); await tick(); h.commit();
  assert.equal(h.render().state.reports.find(r => r.id === 'stored:old').revision, 3);
});
