import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as navigation from '../../../lib/journal-search-client.js';
import { isCanonicalUuid } from '../../../lib/uuid.js';

const W = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const COMPANY = '33333333-3333-4333-8333-333333333333';
const PERSONAL = '44444444-4444-4444-8444-444444444444';
const settle = () => new Promise(setImmediate);
const succeeded = { status: 'succeeded', patterns: [{ id: 'company-pattern', title: 'Synthetic company result' }] };
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

// Run the actual page callbacks/effects. Deferred responses deliberately ignore
// AbortSignal so a scope return (company -> personal -> company) tests ownership too.
function mount(query = 'noteScope=company', displayedRows = null) {
  const slots = [], requests = [], events = new EventTarget();
  let params = new URLSearchParams(query), workspaceId = W, cursor = 0, effects = [], writes = 0;
  const React = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const index = cursor++, slot = slots[index] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, update => { writes++; slot.value = typeof update === 'function' ? update(slot.value) : update; }];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (slots[index] && same(slots[index].deps, deps)) return slots[index].fn;
      slots[index] = { fn, deps }; return fn;
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn(), deps };
      return slots[index].value;
    },
    useEffect(effect, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) effects.push({ index, effect, deps }); },
  };
  const dependencies = { ...navigation, isCanonicalUuid, React,
    useRouter: () => ({ replace(url) { params = new URL(url, 'https://local.test').searchParams; }, push() {} }),
    useSearchParams: () => params, usePathname: () => '/dashboard/work/memos',
    useMemoSearch: () => ({ status: 'live', entries: displayedRows || [{ id: params.get('noteScope') === 'personal' ? PERSONAL : COMPANY,
      noteMeta: { scope: params.get('noteScope') === 'unclassified' ? undefined : params.get('noteScope') || 'company' } }] }),
    lastJournalWorkspace: () => null, rememberJournalWorkspace() {},
    createJournalStore: () => ({ list: () => [], read: () => null }), journalTabId: () => 'test-tab',
    sessionStorage: {}, window: events, MEMO_SAVED_EVENT: 'synthetic:memo-saved',
    findRelatedMemos: () => [],
    fetch(url, options = {}) {
      if (options.method !== 'POST') return Promise.resolve(Response.json({ status: 'live', workspaceId, entries: [], entry: null }));
      assert.equal(url, '/api/hub/journal/analyze');
      return new Promise((resolve, reject) => requests.push({ body: JSON.parse(options.body), options,
        resolve: (data, status = 200) => resolve(Response.json(data, { status })), reject }));
    },
  };
  const source = readFileSync(new URL('./memos.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('const initial ='), end = source.indexOf('\n  return <div className="hub-page memos-page fade-up">');
  assert.ok(start >= 0 && end > start, 'actual page callback boundary must exist');
  const component = new Function(...Object.keys(dependencies), source.slice(start, end).replace(/^export /gm, '')
    + '\nreturn { selectedIds, patternState, ledger, toggleSelect, bulkSelectionIds, allSelected, toggleSelectAll, runPatternAnalysis, runWeeklySynthesis, runAnalysis, closePattern, applyFilters };\n}\nreturn Memos;')(...Object.values(dependencies));
  const render = (commit = true) => {
    cursor = 0; effects = [];
    const view = component();
    if (commit) for (const pending of effects) {
      slots[pending.index]?.cleanup?.();
      slots[pending.index] = { deps: pending.deps, cleanup: pending.effect() };
    }
    return view;
  };
  const h = { requests, render, writes: () => writes,
    setDisplayedRows(rows) { displayedRows = rows; return render(); },
    setRoute(query, commit = true) { params = new URLSearchParams(query); return render(commit); },
    async ready() { for (let i = 0; i < 3; i++) { render(); await settle(); } return render(); },
    async changeWorkspace() { workspaceId = OTHER; events.dispatchEvent(new Event('synthetic:memo-saved')); return h.ready(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
  render(); return h;
}
const select = (view, id = COMPANY) => view.toggleSelect(id, { stopPropagation() {} });

test('scope navigation hides old selection/result before effects and discards a late company response', async (t) => {
  const h = mount(); t.after(() => h.unmount());
  select(await h.ready()); h.render().runPatternAnalysis();
  const old = h.requests[0]; assert.ok(old);
  h.render().applyFilters({ noteScope: 'personal' });
  let view = h.render(false);
  assert.deepEqual(view.selectedIds, []);
  assert.equal(view.patternState.status, 'idle');
  view = await h.ready();
  assert.equal(old.options.signal?.aborted, true);
  old.resolve(succeeded); await settle();
  view = h.render();
  assert.deepEqual(view.selectedIds, []);
  assert.equal(view.patternState.status, 'idle');
  assert.equal(view.patternState.request, null);
  view.runAnalysis(old.body);
  assert.equal(h.requests.length, 1, 'a retired retry must not dispatch in personal scope');
});

test('bulk selection checks and clears the same first ten displayed eligible notes', async (t) => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, noteMeta: { scope: 'company' } }));
  const h = mount('noteScope=company', [{ id: PERSONAL, noteMeta: { scope: 'personal' } }, { id: 'invalid', noteMeta: { scope: 'company' } }, ...rows]);
  t.after(() => h.unmount());
  let view = await h.ready();
  const eligible = rows.slice(0, 10).map(row => row.id);
  assert.deepEqual(view.bulkSelectionIds, eligible);
  view.toggleSelectAll(); view = h.render();
  assert.deepEqual(view.selectedIds, eligible);
  assert.equal(view.allSelected, true);
  view.toggleSelectAll(); assert.deepEqual(h.render().selectedIds, []);
});

test('bulk selection rejects unconfirmed and retired scope callbacks', async (t) => {
  const h = mount(); t.after(() => h.unmount());
  h.render().toggleSelectAll(); assert.deepEqual(h.render().selectedIds, []);
  const old = await h.ready();
  h.setRoute('noteScope=personal', false);
  old.toggleSelectAll();
  assert.deepEqual(h.render(false).selectedIds, []);
  const current = await h.ready(); current.toggleSelectAll();
  assert.deepEqual(h.render().selectedIds, [PERSONAL]);
});

test('retained selection callbacks use the current displayed list, not retired filter rows', async (t) => {
  const h = mount(); t.after(() => h.unmount());
  const retired = await h.ready();
  const currentId = '55555555-5555-4555-8555-555555555555';
  h.setDisplayedRows([{ id: currentId, noteMeta: { scope: 'company' } }]);
  retired.toggleSelect(COMPANY, { stopPropagation() {} });
  assert.deepEqual(h.render().selectedIds, []);
  retired.toggleSelectAll();
  assert.deepEqual(h.render().selectedIds, [currentId]);
});

test('direct company/personal/company navigation never restores the first company request', async (t) => {
  const h = mount(); t.after(() => h.unmount());
  select(await h.ready()); h.render().runPatternAnalysis(); const old = h.requests[0];
  h.setRoute('noteScope=personal'); await h.ready();
  h.setRoute('noteScope=company'); await h.ready();
  old.resolve(succeeded); await settle();
  assert.equal(h.render().patternState.status, 'idle');
  assert.deepEqual(h.render().selectedIds, []);
});

test('workspace changes and unmount abort transport and suppress late analysis state writes', async (t) => {
  const h = mount(); t.after(() => h.unmount());
  select(await h.ready()); h.render().runPatternAnalysis(); const first = h.requests[0];
  await h.changeWorkspace();
  assert.equal(first.options.signal?.aborted, true);
  first.resolve(succeeded); await settle();
  assert.equal(h.render().patternState.status, 'idle'); assert.deepEqual(h.render().selectedIds, []);
  h.render().runWeeklySynthesis(); const last = h.requests[1]; assert.equal(last.body.workspaceId, OTHER);
  h.unmount(); const writes = h.writes();
  assert.equal(last.options.signal.aborted, true);
  last.resolve(succeeded); await settle(); assert.equal(h.writes(), writes);
});

test('selection and weekly requests send exact current scope/workspace and close clears retry data', async (t) => {
  for (const scope of ['', 'personal', 'company', 'unclassified']) {
    const h = mount(scope ? `noteScope=${scope}` : ''); t.after(() => h.unmount());
    let view = await h.ready(); view.runWeeklySynthesis(); let request = h.requests[0];
    assert.deepEqual([request.body.scope, request.body.workspaceId, request.body.range], [scope, W, '7d']);
    request.resolve({ status: 'preview', patterns: [] }, 202); await settle();
    view = h.render(); assert.equal(view.patternState.status, 'preview'); assert.ok(view.patternState.request);
    view.closePattern(); view = h.render(); assert.equal(view.patternState.request, null); assert.deepEqual(view.patternState.patterns, []);
    const id = scope === 'personal' ? PERSONAL : COMPANY; select(view, id); h.render().runPatternAnalysis();
    request = h.requests[1]; assert.deepEqual([request.body.scope, request.body.workspaceId, request.body.noteIds], [scope, W, [id]]);
    h.unmount(); request.resolve(succeeded); await settle();
  }
});

test('unconfirmed workspaces and IDs outside the current list do not start analysis', async (t) => {
  const h = mount(); t.after(() => h.unmount());
  h.render().runWeeklySynthesis(); assert.equal(h.requests.length, 0);
  let view = await h.ready(); select(view, PERSONAL); view = h.render(); assert.deepEqual(view.selectedIds, []);
  view.runPatternAnalysis(); assert.equal(h.requests.length, 0);
});

test('live, preview and error panels all discard patterns and retry requests on a scope change', async (t) => {
  for (const [data, status] of [[succeeded, 200], [{ status: 'preview', patterns: [] }, 202], [{ status: 'error', error: 'engine-unreachable' }, 502]]) {
    const h = mount(); t.after(() => h.unmount());
    (await h.ready()).runWeeklySynthesis(); h.requests[0].resolve(data, status); await settle();
    let view = h.render(); assert.ok(view.patternState.request); assert.notEqual(view.patternState.status, 'idle');
    const retiredRetry = view.runAnalysis;
    h.setRoute('noteScope=personal', false);
    view = h.render(false); assert.equal(view.patternState.status, 'idle'); assert.equal(view.patternState.request, null); assert.deepEqual(view.patternState.patterns, []);
    await h.ready(); h.setRoute('noteScope=company'); await h.ready();
    retiredRetry(h.requests[0].body); assert.equal(h.requests.length, 1, 'retired callbacks cannot dispatch after a scope round trip');
  }
});

test('retry retains the same request and closing or replacing a request rejects late results', async (t) => {
  const h = mount(); t.after(() => h.unmount());
  (await h.ready()).runWeeklySynthesis(); const first = h.requests[0];
  first.resolve({ status: 'error', error: 'engine-unreachable' }, 502); await settle();
  const failed = h.render(); failed.runAnalysis(failed.patternState.request); const retry = h.requests[1];
  assert.deepEqual(retry.body, first.body, 'an uncertain retry uses the same request identity and scope');
  h.render().closePattern(); assert.equal(retry.options.signal.aborted, true);
  h.render().runWeeklySynthesis(); const latest = h.requests[2];
  latest.resolve({ status: 'succeeded', patterns: [{ id: 'current' }] }); await settle();
  retry.resolve(succeeded); await settle();
  assert.deepEqual(h.render().patternState.patterns, [{ id: 'current' }]);
});
