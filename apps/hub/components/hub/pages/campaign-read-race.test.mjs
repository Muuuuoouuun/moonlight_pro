import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import ts from 'typescript';
import * as truth from '../../../lib/campaign-business-truth.js';
import { createContentLedgerCache, EMPTY_CONTENT_LEDGER } from '../../../lib/content-ledger-cache.js';

const tick = () => new Promise(setImmediate);
const response = data => ({ ok: true, status: 200, json: async () => data });
const live = campaigns => ({ ...EMPTY_CONTENT_LEDGER, source: 'supabase', status: 'live', campaigns });
const saved = { id: 'confirmed-campaign', name: '저장 확인한 캠페인', channels: ['Email'], status: 'Draft' };
const page = await readFile(new URL('./content.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(page.slice(page.indexOf('function buildPreviewCampaignDetail(')).replace('export function Campaigns', 'function Campaigns'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(write = async () => response({ status: 'saved', campaign: saved }), query = '') {
  const reads = [], writes = [], cells = [];
  const cache = createContentLedgerCache((url, options) => new Promise(resolve => reads.push({ url, signal: options.signal, resolve: data => resolve(response(data)) })));
  let cursor = 0, effects = [], tree, override = null, params = new URLSearchParams(query);
  const HookReact = { ...React,
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useRef(initial) { return cells[cursor++] ??= { current: initial }; },
    useCallback: callback => callback,
    useEffect(effect, deps) { const index = cursor++; if (cells[index]?.deps?.length === deps.length && cells[index].deps.every((value, i) => Object.is(value, deps[i]))) return;
      effects.push(() => { cells[index]?.cleanup?.(); cells[index] = { deps, cleanup: effect() }; }); },
  };
  const dependencies = { ...truth, React: HookReact,
    useRouter: () => ({ push() {}, replace(url) { params = new URL(url, 'https://local.test').searchParams; } }), useSearchParams: () => params, usePageCreateHotkey() {},
    useContentLedger: () => override || cache.getSnapshot(), refreshContentLedger: () => cache.invalidate(),
    window: { addEventListener() {}, removeEventListener() {} }, CAMPAIGN_TABS: [], CAMPAIGN_WAR_ROOMS: {},
    fetch: async (url, options) => { assert.equal(url, '/api/hub/campaigns'); writes.push(JSON.parse(options.body)); return write(); },
  };
  for (const name of ['Button', 'Card', 'Badge', 'Kbd', 'SyncBadge', 'EmptyState', 'Skeleton', 'Iconed', 'Progress', 'GoalLinks', 'CampaignMetric', 'Tabs', 'CampaignTabPanel']) dependencies[name] = name;
  const Campaigns = new Function(...Object.keys(dependencies), code + ';return Campaigns;')(...Object.values(dependencies));
  const render = () => { cursor = 0; effects = []; tree = Campaigns(); effects.forEach(effect => effect()); return tree; };
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children, node.props?.action].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
    return null;
  }
  const button = text => { const node = find(tree, node => node.type === 'Button' && node.props.children === text); assert.ok(node, text); return node; };
  render();
  return { cache, reads, writes, render, button,
    route: () => params,
    selected: () => find(tree, node => node.type === 'CampaignTabPanel')?.props.campaign.id,
    create: () => find(tree, node => node.type === 'Button' && node.props.icon === 'plus'),
    contains: text => JSON.stringify(tree).includes(text),
    override(value) { override = value; render(); render(); },
  };
}

test('creating a campaign from an older explicit campaign selects the saved record and preserves other query fields', async () => {
  const previous = { ...saved, id: 'previous-campaign', name: '이전에 연 캠페인' };
  const h = harness(undefined, 'campaign=previous-campaign&view=details');
  const initial = h.cache.refresh(); await tick(); h.reads[0].resolve(live([previous])); await initial;
  h.render(); h.render(); assert.equal(h.selected(), previous.id);
  await h.create().props.onClick(); await tick(); h.render(); h.render();
  assert.equal(h.route().get('campaign'), saved.id); assert.equal(h.route().get('view'), 'details');
  assert.equal(h.selected(), saved.id);
  const afterSave = h.cache.refresh(); h.reads[1].resolve(live([previous, saved])); await afterSave;
  h.render(); h.render(); assert.equal(h.selected(), saved.id);
});

test('confirmed campaign survives an older initial read, loading and then an authoritative post-save read', async () => {
  const h = harness(); const initial = h.cache.refresh(); await tick(); h.render(); h.render();
  const create = h.create().props.onClick;
  const saving = create(); await create(); await saving; await tick(); h.render(); h.render();
  assert.equal(h.writes.length, 1, 'captured double click sends one POST');
  assert.equal(h.reads.length, 2); assert.equal(h.reads[0].signal.aborted, true);
  assert.equal(h.contains(saved.id), true);
  h.override({ ...EMPTY_CONTENT_LEDGER, syncState: 'loading' });
  assert.equal(h.contains(saved.id), true, 'loading does not erase a confirmed row');
  h.override(null);
  h.reads[0].resolve(live([])); await initial; h.render(); h.render();
  assert.equal(h.contains(saved.id), true, 'obsolete initial result cannot erase the confirmed create');
  const afterSave = h.cache.refresh(); h.reads[1].resolve(live([saved])); await afterSave; h.render(); h.render();
  assert.equal(h.contains(saved.id), true);
  const authoritative = h.button('목록 새로고침').props.onClick(); await tick();
  h.reads[2].resolve(live([])); await authoritative; h.render(); h.render();
  assert.equal(h.contains(saved.id), false, 'a later authoritative empty read is respected; no permanent local overlay');
});

test('a failed post-save re-read is an explicit error with a retry, not empty success', async () => {
  const h = harness(); const initial = h.cache.refresh(); await tick(); h.render();
  await h.create().props.onClick(); await tick();
  h.reads[0].resolve(live([])); await initial;
  const afterSave = h.cache.refresh(); h.reads[1].resolve({ source: 'error', status: 'error' }); await afterSave;
  h.render(); h.render();
  assert.equal(h.contains('캠페인 목록을 읽지 못했습니다'), true);
  assert.equal(h.contains('캠페인이 없습니다'), false);
  const retry = h.button('다시 불러오기').props.onClick(); await tick();
  h.reads[2].resolve(live([saved])); await retry; h.render(); h.render();
  assert.equal(h.contains(saved.id), true);
});

test('a create acknowledgement still inserts its confirmed row when the initial read finishes during the POST', async () => {
  let acknowledge;
  const h = harness(() => new Promise(resolve => { acknowledge = () => resolve(response({ status: 'saved', campaign: saved })); }));
  const initial = h.cache.refresh(); await tick(); h.render();
  const saving = h.create().props.onClick(); h.render();
  h.reads[0].resolve(live([])); await initial; h.render(); h.render();
  assert.equal(h.contains(saved.id), false, 'pending creation is not shown as a saved campaign');
  acknowledge(); await saving; await tick(); h.render(); h.render();
  assert.equal(h.contains(saved.id), true);
  const afterSave = h.cache.refresh(); h.reads[1].resolve(live([saved])); await afterSave;
});

test('a recent empty snapshot followed by a failed post-save read remains partial with a retry', async () => {
  const h = harness(); const initial = h.cache.refresh(); await tick();
  h.reads[0].resolve(live([])); await initial; h.render(); h.render();
  await h.create().props.onClick(); await tick();
  const afterSave = h.cache.refresh(); h.reads[1].resolve({ source: 'error', status: 'error' }); await afterSave;
  h.render(); h.render();
  assert.equal(h.contains('불러온 목록에서 캠페인을 확인하지 못했습니다'), true);
  assert.equal(h.contains('캠페인이 없습니다'), false); assert.ok(h.button('다시 불러오기'));
});

test('an uncertain create requires a successful list check before another create is available', async () => {
  const h = harness(async () => { throw Error('synthetic lost response'); });
  const initial = h.cache.refresh(); await tick(); h.render();
  await h.create().props.onClick(); h.render(); h.render();
  assert.equal(h.contains('중복 생성을 피하려면'), true); assert.equal(h.create().props.disabled, true);
  await h.create().props.onClick(); assert.equal(h.writes.length, 1);
  const checking = h.button('생성 여부 확인').props.onClick(); await tick();
  h.reads[0].resolve(live([])); await initial;
  h.reads[1].resolve({ source: 'error', status: 'error' }); await checking; h.render(); h.render();
  assert.equal(h.create().props.disabled, true, 'failed verification cannot unlock another create');
  const retry = h.button('생성 여부 확인').props.onClick(); await tick();
  h.reads[2].resolve(live([saved])); await retry; h.render(); h.render();
  assert.equal(h.create().props.disabled, false); assert.equal(h.contains(saved.id), true); assert.equal(h.writes.length, 1);
});
