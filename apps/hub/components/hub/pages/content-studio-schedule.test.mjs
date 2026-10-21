import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { emptyStudioDraft } from '../../../lib/content-workflow-client.js';

const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const variantId = '11111111-1111-4111-8111-111111111111';
const contentId = '22222222-2222-4222-8222-222222222222';
const otherVariantId = '33333333-3333-4333-8333-333333333333';
const savedDraft = () => ({ ...emptyStudioDraft(), variantId, contentId, body: '직접 작성한 원고', channel: 'threads' });
const row = (revision = 7, state = 'scheduled') => ({ variantId, contentId, revision, state, status: state, scheduledAt: '2030-10-20T10:00:00Z' });
const live = (revision = 7) => ({ status: 'live', schedules: revision ? [row(revision)] : [] });

// Execute the real component's hook setup and handlers up to its JSX return.
// Rendering is explicit so saved IDs can reach the stateRef before or after a render.
function mount(initial = savedDraft()) {
  const slots = [], effects = new Set(), requests = [], notices = [];
  let cursor = 0, currentDraft = initial, renderDraft = initial, documentIdentity = 1, saveCount = 0;
  let save = async () => currentDraft;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index]);
  const React = {
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++, slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useEffect(setup, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) { slots[index] = { ...slots[index], setup, deps }; effects.add(index); }
    },
  };
  const fetch = (url, options = {}) => new Promise(resolve => requests.push({ url, options,
    resolve: data => resolve({ ok: true, json: async () => data }),
  }));
  const hookSource = readFileSync(new URL('./use-content-schedule.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const useContentSchedule = new Function('React', 'fetch', hookSource + '\nreturn useContentSchedule;')(React, fetch);
  const source = readFileSync(new URL('./content-studio.jsx', import.meta.url), 'utf8').split('  return <div className="hub-page content-studio">')[0]
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '')
    + '\nreturn { submitSchedule, cancelSchedule, openSchedule, scheduleAt, scheduleError, scheduleSaving, drawer, schedules, currentSchedule }; }\nreturn ContentStudio;';
  const deps = {
    React, useContentSchedule,
    useContentStudio: () => ({ draft: renderDraft, ready: true, scope: 'personal',
      getDraft: () => currentDraft, getDocumentIdentity: () => documentIdentity,
      save: async () => { saveCount++; return save(); } }),
    useToast: () => ({ success: value => notices.push(value) }), useRouter: () => ({}),
    useContentTemplates: () => ({ templates: [] }), filterBrandsByWorkspace: value => value,
    BRIEF_FIELDS: [], usePageCreateHotkey() {}, channelLabel: value => value,
    formatKstShort: value => value, schedulePresets: () => [{ at: '2030-10-20T10:00:00Z' }, { at: '2030-10-21T10:00:00Z' }],
    window: { localStorage: { getItem: () => null } },
  };
  const component = new Function(...Object.keys(deps), source)(...Object.values(deps));
  const render = ({ flush = true } = {}) => {
    cursor = 0; const view = component({ workspace: 'personal', ledger: { brands: [] } });
    if (flush) flushEffects();
    return view;
  };
  const flushEffects = () => {
    for (const index of effects) { slots[index].cleanup?.(); slots[index].cleanup = slots[index].setup(); }
    effects.clear();
  };
  const unmount = () => { for (const slot of slots) slot.cleanup?.(); };
  render();
  return { requests, notices, render, flushEffects, unmount, saveCount: () => saveCount,
    assign(draft, { newDocument = false } = {}) { if (newDocument) documentIdentity++; currentDraft = renderDraft = draft; },
    setSave(fn) { save = fn; },
    posts: () => requests.filter(request => request.options.method === 'POST'),
  };
}
async function prime(revision = 7) {
  const h = mount(); await tick(); h.requests[0].resolve(live(revision)); await tick();
  h.render().openSchedule(); h.render(); return h;
}
function resolveReads(h, data) { for (const request of h.requests) if (request.options.method !== 'POST') request.resolve(data); }

test('Studio reads the selected result and can cancel a reservation beyond the list cap', async () => {
  const h = await prime();
  assert.match(h.requests[0].url, new RegExp(`variantId=${variantId}&contentId=${contentId}$`));
  assert.equal(h.render().currentSchedule.revision, 7);
  const writing = h.render().cancelSchedule(); await tick();
  assert.deepEqual(JSON.parse(h.posts()[0].options.body), { action: 'cancel', variantId, expectedRevision: 7 });
  h.posts()[0].resolve({ status: 'saved', schedule: row(8, 'cancelled') }); await writing; await tick();
  resolveReads(h, { status: 'live', schedules: [row(8, 'cancelled')] }); await tick();
  assert.equal(h.render().drawer, null); assert.equal(h.notices.length, 1); h.unmount();
});

test('the real submit handler blocks loading, error and preview including Enter invocation', async () => {
  for (const status of ['loading', 'error', 'preview']) {
    const h = mount(); await tick();
    if (status !== 'loading') { h.requests[0].resolve({ status, schedules: [] }); await tick(); }
    h.render().openSchedule(); await h.render().submitSchedule();
    assert.equal(h.saveCount(), 0, status); assert.equal(h.posts().length, 0, status); h.unmount();
  }
});

for (const order of ['render-before-save', 'render-during-read', 'render-during-write']) {
  test(`first save continues through assigned IDs: ${order}`, async () => {
    const h = mount({ ...emptyStudioDraft(), body: '새 원고' }); await tick();
    assert.equal(h.requests.length, 0, 'an unsaved draft does not read a broad list');
    const saving = deferred(); h.setSave(() => saving.promise);
    h.render().openSchedule(); const submitting = h.render().submitSchedule();
    h.assign(savedDraft());
    if (order === 'render-before-save') { h.render(); await tick(); }
    saving.resolve(savedDraft()); await tick();
    if (order === 'render-during-read') { h.render(); await tick(); }
    resolveReads(h, live(0)); await tick();
    assert.equal(h.posts().length, 1);
    assert.equal(JSON.parse(h.posts()[0].options.body).expectedRevision, 0);
    if (order === 'render-during-write') { h.render(); await tick(); }
    h.posts()[0].resolve({ status: 'saved', schedule: row(1) }); await submitting; await tick();
    resolveReads(h, live(1)); await tick();
    assert.equal(h.render().drawer, null); assert.equal(h.notices.length, 1);
    assert.equal(h.render().scheduleSaving, false); h.unmount();
  });
}

test('an existing content item can save its first variant before checking its reservation', async () => {
  const h = mount({ ...emptyStudioDraft(), contentId, body: '첫 결과물' }); await tick();
  h.setSave(async () => { h.assign(savedDraft()); return savedDraft(); });
  h.render().openSchedule(); const submitting = h.render().submitSchedule(); await tick();
  assert.equal(h.requests.length, 1); assert.match(h.requests[0].url, /variantId=/);
  h.requests[0].resolve(live(0)); await tick();
  assert.equal(h.posts().length, 1);
  h.posts()[0].resolve({ status: 'saved', schedule: row(1) }); await submitting; h.unmount();
});

test('failed first-save exact lookup preserves input and sends no reservation POST', async () => {
  const h = mount({ ...emptyStudioDraft(), body: '새 원고' }); await tick();
  h.setSave(async () => { h.assign(savedDraft()); return savedDraft(); });
  h.render().openSchedule(); const before = h.render().scheduleAt;
  const submitting = h.render().submitSchedule(); await tick();
  h.requests[0].resolve({ status: 'error', schedules: [], message: '조회 실패' }); await submitting;
  const view = h.render();
  assert.equal(h.posts().length, 0); assert.equal(view.scheduleAt, before);
  assert.equal(view.drawer, 'schedule'); assert.equal(view.scheduleError, '조회 실패'); h.unmount();
});

test('existing revision is observed before save and a conflict requires an explicit retry', async () => {
  const h = await prime(7), saving = deferred(); h.setSave(() => saving.promise);
  const before = h.render().scheduleAt, submitting = h.render().submitSchedule();
  const reading = h.render().schedules.reload(); await tick(); h.requests[1].resolve(live(8)); await reading;
  h.render(); saving.resolve(savedDraft()); await tick();
  assert.equal(JSON.parse(h.posts()[0].options.body).expectedRevision, 7, 'do not silently adopt a newer revision during save');
  h.posts()[0].resolve({ status: 'conflict', message: '다른 창에서 변경됨' }); await submitting; await tick();
  resolveReads(h, live(8)); await tick();
  const view = h.render(); assert.equal(view.scheduleAt, before); assert.equal(view.drawer, 'schedule');
  assert.equal(view.scheduleError, '다른 창에서 변경됨'); assert.equal(h.posts().length, 1);
  h.setSave(async () => savedDraft()); const retry = view.submitSchedule(); await tick();
  assert.equal(JSON.parse(h.posts()[1].options.body).expectedRevision, 8);
  h.posts()[1].resolve({ status: 'saved', schedule: row(9) }); await retry; await tick(); resolveReads(h, live(9)); await tick(); h.unmount();
});

test('a document change during first-save lookup cannot send POST or publish old feedback', async () => {
  const h = mount({ ...emptyStudioDraft(), body: '새 원고' }); await tick();
  h.setSave(async () => { h.assign(savedDraft()); return savedDraft(); });
  h.render().openSchedule(); const submitting = h.render().submitSchedule(); await tick();
  h.assign({ ...savedDraft(), variantId: otherVariantId }, { newDocument: true }); h.render(); await tick();
  h.requests[0].resolve(live(0)); await submitting;
  assert.equal(h.posts().length, 0); assert.equal(h.notices.length, 0);
  assert.equal(h.render().scheduleError, ''); h.unmount();
});

test('another unsaved document owns its feedback when the old save returns null', async () => {
  const h = mount({ ...emptyStudioDraft(), body: '이전 초안' }); await tick();
  const saving = deferred(); h.setSave(() => saving.promise);
  h.render().openSchedule(); const submitting = h.render().submitSchedule();
  h.assign({ ...emptyStudioDraft(), body: '새 문서' }, { newDocument: true }); h.render();
  saving.resolve(null); await submitting;
  assert.equal(h.render().scheduleError, ''); assert.equal(h.notices.length, 0); assert.equal(h.posts().length, 0); h.unmount();
});

test('late write success after switching documents cannot close the new drawer or announce success', async () => {
  const h = await prime(); const submitting = h.render().submitSchedule(); await tick();
  h.assign({ ...savedDraft(), variantId: otherVariantId }, { newDocument: true }); h.render(); await tick();
  h.posts()[0].resolve({ status: 'saved', schedule: row(8) }); await submitting;
  assert.equal(h.notices.length, 0); assert.equal(h.render().drawer, 'schedule');
  assert.equal(h.render().schedules.anyForVariant(variantId), null); h.unmount();
});

test('duplicate submit and unmount during exact lookup do not send reservation writes', async () => {
  const h = mount({ ...emptyStudioDraft(), body: '새 원고' }); await tick();
  h.setSave(async () => { h.assign(savedDraft()); return savedDraft(); });
  h.render().openSchedule(); const view = h.render(), submitting = view.submitSchedule();
  await view.submitSchedule(); await tick();
  assert.equal(h.saveCount(), 1); h.unmount(); await submitting;
  assert.equal(h.posts().length, 0); assert.equal(h.notices.length, 0);
});

test('a departed render cannot start booking for a new unsaved document before rerender', async () => {
  const h = mount({ ...emptyStudioDraft(), body: '이전 초안' }); await tick();
  h.render().openSchedule(); const departed = h.render();
  h.assign({ ...emptyStudioDraft(), body: '새 문서' }, { newDocument: true });
  await departed.submitSchedule();
  assert.equal(h.saveCount(), 0); assert.equal(h.posts().length, 0); assert.equal(h.notices.length, 0); h.unmount();
});
