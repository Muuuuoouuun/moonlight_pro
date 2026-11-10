import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import ts from 'typescript';
import * as performance from '../../../lib/content-performance.js';
import * as client from '../../../lib/content-performance-client.js';
import * as logs from '../../../lib/content-publish-log.js';
import { formatKstShort } from '../../../lib/content-schedule.js';

const tick = () => new Promise(setImmediate);
const response = data => ({ ok: true, json: async () => data });
const target = { id: 'old-variant', contentId: 'old-content', title: '작년에 발행한 글', brandId: 'brand-id', brandName: '확인한 브랜드', channel: 'threads',
  publishedAt: '2025-12-31T16:00:00Z', updatedAt: '2026-01-02T00:00:00Z', metrics: { views: null, shares: null, replies: null, capturedAt: null }, href: '/dashboard/content/studio?item=old-content&variant=old-variant' };
const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children, node.props?.action, node.props?.footer].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
  return null;
};
async function compile(file, name, dependencies) {
  const source = (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), js + `;return ${name};`)(...Object.values(dependencies));
}
async function mount(file, name, query, dependencies) {
  const cells = []; let cursor = 0, effects = [], dirty = false, tree, params = new URLSearchParams(query);
  const same = (a, b) => a?.length === b?.length && a.every((value, i) => Object.is(value, b[i]));
  const HookReact = { ...React,
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], value => { const next = typeof value === 'function' ? value(cells[index]) : value; if (!Object.is(next, cells[index])) { cells[index] = next; dirty = true; } }]; },
    useRef(initial) { return cells[cursor++] ??= { current: initial }; },
    useMemo: callback => callback(),
    useCallback(callback, deps) { const index = cursor++; if (same(cells[index]?.deps, deps)) return cells[index].callback; cells[index] = { callback, deps }; return callback; },
    useEffect(effect, deps) { const index = cursor++; if (!same(cells[index]?.deps, deps)) effects.push(() => { cells[index]?.cleanup?.(); cells[index] = { deps, cleanup: effect() }; }); },
  };
  const go = url => { params = new URL(url, 'https://local.test').searchParams; dirty = true; };
  const window = new EventTarget();
  const deps = { ...performance, ...client, ...logs, React: HookReact, Link: 'Link', formatKstShort,
    useRouter: () => ({ replace: go, push: go }), useSearchParams: () => params,
    window, setInterval: () => 0, clearInterval() {},
    ...dependencies,
  };
  for (const primitive of ['Button', 'Card', 'Drawer', 'EmptyState', 'SegmentedControl', 'SelectField', 'Skeleton', 'TextField', 'TruthBadge', 'LifecycleBadge', 'PublishLogView']) deps[primitive] = primitive;
  const Component = await compile(file, name, deps);
  function render() {
    let passes = 0;
    do { assert.ok(passes++ < 20, 'component effects settle'); dirty = false; cursor = 0; effects = []; tree = Component(); effects.forEach(effect => effect()); } while (dirty);
    return tree;
  }
  render();
  return { render, route: () => params,
    element: predicate => find(tree, predicate), text: () => JSON.stringify(tree),
    setRoute(query) { params = new URLSearchParams(query); return render(); },
    async flush() { await tick(); return render(); },
    unmount() { cells.forEach(cell => cell?.cleanup?.()); },
  };
}

test('the selected publication action preserves the exact variant and Seoul reporting period through the performance editor', async () => {
  const publishLog = { variantId: target.id, contentId: target.contentId, title: target.title, channel: target.channel, publishedAt: target.publishedAt,
    status: 'published', provider: 'manual', event: 'operator_published', provenance: 'operator_confirmed' };
  const sender = await mount('./content-publish-log.jsx', 'ContentPublishLog', `variant=${target.id}`, {
    useContentLedger: () => ({ syncState: 'live', items: [{ id: target.contentId, brandId: target.brandId }], publishLogs: [publishLog] }),
    useContentSchedule: () => ({ status: 'live', schedules: [], reload() {} }), createFollowUpStarter: () => () => { throw Error('unexpected write'); }, postStudio() { throw Error('unexpected write'); },
    fetch: async () => response({ status: 'live', publications: [] }),
  });
  const view = sender.element(node => node.type === 'PublishLogView');
  const Detail = await compile('./publish-log-view.jsx', 'PublishLogDetail', { React, Button: 'Button', LifecycleBadge: 'LifecycleBadge', SegmentedControl: 'SegmentedControl', ...logs, formatKstShort });
  const detail = Detail({ row: view.props.allRows[0], onOpenPerformance: view.props.onOpenPerformance });
  find(detail, node => node.type === 'Button' && node.props.children === '성과 기록').props.onClick();
  assert.equal(sender.route().get('variant'), target.id); assert.equal(sender.route().get('year'), '2026'); assert.equal(sender.route().get('month'), '01');
  assert.equal(sender.route().get('brand'), target.brandId); assert.equal(sender.route().get('channel'), target.channel);
  const reads = [];
  const receiver = await mount('./content-performance.jsx', 'ContentPerformance', sender.route().toString(), {
    fetch: async (url, options) => { assert.equal(options?.method, undefined); reads.push(url); return response({ status: 'live', generatedAt: '2026-10-27T00:00:00Z', publications: [target], brands: [], channels: [] }); },
  });
  await receiver.flush();
  const editor = receiver.element(node => node.type?.name === 'MetricEditor');
  assert.equal(editor?.props.entry.id, target.id); assert.equal(reads[0], '/api/hub/content/performance?year=2026');
  editor.props.onClose(); receiver.render();
  assert.equal(receiver.route().has('variant'), false); assert.equal(receiver.route().get('year'), '2026'); assert.equal(receiver.route().get('brand'), target.brandId);
  assert.equal(receiver.element(node => node.type?.name === 'MetricEditor'), null);
  sender.unmount(); receiver.unmount();
});

test('an older-year explicit publication opens exactly, while absent targets never open another publication', async () => {
  const old = { ...target, publishedAt: '2024-06-01T00:00:00Z' };
  const h = await mount('./content-performance.jsx', 'ContentPerformance', `view=monthly&year=2024&month=06&variant=${target.id}`, {
    fetch: async (url, options) => { assert.equal(options.method, undefined); assert.equal(url, '/api/hub/content/performance?year=2024'); return response({ status: 'live', publications: [old] }); },
  });
  await h.flush(); assert.equal(h.element(node => node.type?.name === 'MetricEditor')?.props.entry.id, target.id);
  assert.equal(h.route().get('brand'), target.brandId); assert.equal(h.route().get('channel'), target.channel);
  h.setRoute('view=monthly&year=2024&month=06&variant=absent');
  assert.equal(h.element(node => node.type?.name === 'MetricEditor'), null); assert.match(h.text(), /선택한 발행 원고를 이 연도에서 찾을 수 없습니다/);
  h.unmount();
});

test('a target read failure preserves its address and retries without creating or editing a different row', async () => {
  let calls = 0;
  const h = await mount('./content-performance.jsx', 'ContentPerformance', `view=monthly&year=2024&month=06&variant=${target.id}`, {
    fetch: async (_url, options) => { assert.equal(options.method, undefined); return response(++calls === 1 ? { status: 'error' } : { status: 'live', publications: [{ ...target, publishedAt: '2024-06-01T00:00:00Z' }] }); },
  });
  await h.flush(); assert.match(h.text(), /집계를 확인하지 못했습니다/); assert.equal(h.route().get('variant'), target.id);
  h.element(node => node.type === 'Button' && node.props.children === '다시 불러오기').props.onClick(); h.render(); await h.flush();
  assert.equal(h.element(node => node.type?.name === 'MetricEditor')?.props.entry.id, target.id); assert.equal(calls, 2);
  h.unmount();
});
