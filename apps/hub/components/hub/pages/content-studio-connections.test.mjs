import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as client from '../../../lib/content-workflow-client.js';
import * as routing from '../../../lib/content-studio-routing.js';
import * as queue from '../../../lib/content-studio-save-queue.js';
import * as workflow from '../../../lib/content-workflow.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ ok: true, json: async () => data });
const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
function mountStudio(query, fetcher = () => assert.fail('unexpected read'), sender = () => assert.fail('unexpected write')) {
  const slots = [], timers = new Map(), urls = [], mirrors = [];
  let cursor = 0, effects = [], params = new URLSearchParams(query), nextTimer = 0;
  const React = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const index = cursor++, slot = slots[index] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, update => { slot.value = typeof update === 'function' ? update(slot.value) : update; }];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (slots[index] && same(slots[index].deps, deps)) return slots[index].fn;
      slots[index] = { fn, deps }; return fn;
    },
    useEffect(effect, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) effects.push({ index, effect, deps }); },
  };
  const dependencies = { ...client, ...routing, ...queue, ...workflow, React,
    resolveStudioCampaignContext: (ref, options) => routing.resolveStudioCampaignContext(ref, { ...options, fetchImpl: fetcher }),
    resolveStudioBrandId: (ref, options) => routing.resolveStudioBrandId(ref, { ...options, fetchImpl: fetcher }),
    useSearchParams: () => params, usePathname: () => '/dashboard/content/studio',
    fetch: fetcher, postStudio: sender, refreshContentLedger: () => assert.fail('unexpected refresh'),
    readStudioMirror: async () => null, readStudioDocumentMirror: async () => null,
    writeStudioMirror: async (...args) => { mirrors.push(args); return '2026-10-05T00:00:00Z'; },
    window: { history: { replaceState(_state, _title, url) { urls.push(url); params = new URL(url, 'https://local.test').searchParams; } },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
  };
  const source = readFileSync(new URL('./use-content-studio.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/^export \{[^}]+\};/gm, '').replace(/^export function /gm, 'function ');
  const hook = new Function(...Object.keys(dependencies), source + '\nreturn useContentStudio;')(...Object.values(dependencies));
  const render = () => {
    cursor = 0; effects = [];
    const view = hook();
    for (const pending of effects) {
      slots[pending.index]?.cleanup?.();
      slots[pending.index] = { deps: pending.deps, cleanup: pending.effect() };
    }
    return view;
  };
  render();
  return { render, urls, mirrors, setRoute(query) { params = new URLSearchParams(query); return render(); },
    async flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); await settle(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}

test('the real Studio hook opens and changes empty formats without server creation or a pending receipt', async () => {
  const mounted = mountStudio('new=draft&scope=personal');
  await settle();
  let view = mounted.render();
  assert.equal(view.ready, true);
  assert.equal(view.scope, 'personal');
  assert.equal(mounted.mirrors.length, 0, 'opening a route does not persist a draft');
  view.edit({ channel: 'instagram', variantType: 'card_news' });
  view = mounted.render();
  assert.equal(view.dirty, false);
  assert.equal(view.saveState, 'idle');
  await mounted.flushTimers();
  await view.save(true);
  assert.equal(mounted.render().draft.contentId, null);
  assert.ok(mounted.mirrors.every(([, value]) => value.dirty === false && !value.pendingSave));
  assert.equal(new URL(mounted.urls.at(-1), 'https://local.test').searchParams.get('scope'), 'personal');
  mounted.unmount();
});

test('a verified Campaign opens a visible unsupported state and never reads an unrelated active draft or saves', async () => {
  const id = '22222222-2222-4222-8222-222222222222', brandId = '33333333-3333-4333-8333-333333333333';
  const calls = [];
  const mounted = mountStudio(`new=draft&campaign=${id}&brand=${brandId}&scope=classin`, async url => {
    calls.push(url); return response({ status: 'live', attributionSupported: false, campaign: { id, brandId, orgScope: 'classin' } });
  });
  await settle();
  const view = mounted.render();
  assert.equal(view.ready, false);
  assert.match(view.loadError, /캠페인 연결 저장을 아직 지원하지/);
  assert.equal(view.campaignContext.id, id);
  assert.equal(view.draft.brandId, brandId);
  assert.equal(new URL(calls[0], 'https://local.test').searchParams.get('scope'), 'classin');
  assert.equal(new URL(mounted.urls[0], 'https://local.test').searchParams.get('campaign'), id);
  view.edit({ body: '연결되지 않은 초안을 만들면 안 됨' });
  assert.equal(await view.save(), null);
  assert.equal(await view.mutate({ action: 'create_variant' }), null);
  assert.equal(await view.newDraft(), false);
  assert.equal(mounted.mirrors.length, 0);
  mounted.unmount();
});

test('invalid Campaign IDs and delayed Campaign reads cannot replace the current general draft', async () => {
  const invalid = mountStudio('new=draft&campaign=old-slug');
  await settle();
  assert.match(invalid.render().loadError, /캠페인 주소/);
  assert.equal(invalid.render().campaignContext, null);
  invalid.unmount();
  const blank = mountStudio('new=draft&campaign=');
  await settle();
  assert.match(blank.render().loadError, /캠페인 주소/);
  blank.setRoute('new=draft');
  await settle();
  assert.equal(blank.render().ready, true, 'explicitly leaving an empty Campaign query opens the general Studio');
  blank.unmount();
  let resolve;
  const id = '22222222-2222-4222-8222-222222222222';
  const mounted = mountStudio(`new=draft&campaign=${id}`, () => new Promise(done => { resolve = done; }));
  mounted.setRoute('new=draft&scope=personal');
  await settle();
  assert.equal(mounted.render().ready, true);
  resolve(response({ status: 'live', campaign: { id, brandId: null } }));
  await settle();
  const current = mounted.render();
  assert.equal(current.ready, true);
  assert.equal(current.campaignContext, null);
  assert.equal(current.loadError, '');
  assert.equal(current.scope, 'personal');
  mounted.unmount();
});

test('typing, a lost save response and retry preserve the same receipt in the real Studio hook', async () => {
  const requests = [];
  const mounted = mountStudio('new=draft&scope=personal', undefined, async (_path, request) => {
    requests.push(request);
    if (requests.length === 1) throw Error('response lost');
    return { status: 'duplicate', item: { id: 'content-id', updated_at: 'item-version', workspace_id: 'workspace' },
      variant: { id: 'variant-id', content_id: 'content-id', updated_at: 'variant-version', body: request.variant.body } };
  });
  await settle();
  mounted.render().edit({ body: '직접 작성한 원고' });
  mounted.render(); await mounted.flushTimers();
  assert.equal(mounted.render().saveState, 'error');
  assert.equal(mounted.render().dirty, true);
  await mounted.render().save();
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(mounted.render().saveState, 'saved');
  assert.equal(mounted.render().draft.contentId, 'content-id');
  assert.equal(mounted.render().draft.body, '직접 작성한 원고');
  mounted.unmount();
});
