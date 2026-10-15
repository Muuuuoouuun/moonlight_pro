import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { researchBriefReadHref, selectedResearchBrief } from '../../../lib/research-inbox-navigation.js';
const ui = await import('./research-run-ui.js').catch(() => ({}));

const settle = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ ok: true, json: async () => data });
const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
async function mountedInbox(query, reader) {
  const slots = []; let cursor = 0, effects = [], params = new URLSearchParams(query), latest;
  const HookReact = { ...React,
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const index = cursor++, slot = slots[index] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useCallback(fn, deps) { const index = cursor++; if (slots[index] && sameDeps(slots[index].deps, deps)) return slots[index].fn; slots[index] = { fn, deps }; return fn; },
    useEffect(effect, deps) { const index = cursor++; if (!slots[index] || !sameDeps(slots[index].deps, deps)) effects.push({ index, effect, deps }); },
  };
  const Placeholder = () => null;
  const router = { replace(url) { params = new URL(url, 'https://local.test').searchParams; } };
  const catalog = { brands: [], syncState: 'live' };
  const dependencies = { ...ui, React: HookReact, useRouter: () => router, useSearchParams: () => params,
    useToast: () => ({ success() {}, error() {}, info() {} }), usePageCreateHotkey() {}, useContentLedger: () => catalog,
    researchBriefReadHref, selectedResearchBrief,
    fetch: (url, options) => url.startsWith('/api/hub/research/runs') ? Promise.resolve(response({ status: 'live', runs: [], settings: null })) : reader(url, options),
  };
  for (const name of ['Button', 'Card', 'CertaintyBadge', 'Drawer', 'EmptyState', 'Kbd', 'SegmentedControl', 'SelectField', 'Skeleton', 'TextAreaField', 'TextField', 'TruthBadge']) dependencies[name] = Placeholder;
  const source = (await readFile(new URL('./research-inbox.jsx', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/^export function /gm, 'function ');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Inbox = new Function(...Object.keys(dependencies), code + '\nreturn ResearchInbox;')(...Object.values(dependencies));
  function render() {
    cursor = 0; effects = []; latest = Inbox();
    for (const pending of effects) { slots[pending.index]?.cleanup?.(); slots[pending.index] = { deps: pending.deps, cleanup: pending.effect() }; }
    return latest;
  }
  function find(element, predicate) {
    if (!element || typeof element !== 'object') return null;
    if (predicate(element)) return element;
    for (const child of [element.props?.children, element.props?.action].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  render();
  return { render, state: () => slots[0].value, setRoute(query) { params = new URLSearchParams(query); return render(); },
    async retry() { const button = find(latest, element => element.props?.children === '다시 불러오기'); assert.ok(button); await button.props.onClick(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}

test('the real research page reads an old deep link exactly, exposes missing links and retries errors', async () => {
  const id = '22222222-2222-4222-8222-222222222222'; let calls = 0; const reads = [];
  const mounted = await mountedInbox(`brief=${id}`, async (url, options) => {
    calls++; reads.push([url, options]);
    return response(calls === 1 ? { status: 'error', briefs: [] } : { status: 'live', briefs: [{ id, title: '선택한 오래된 원본', state: 'new', createdAt: '2026-01-01T00:00:00Z' }] });
  });
  await settle(); mounted.render();
  assert.equal(mounted.state().status, 'error');
  await mounted.retry();
  const view = mounted.render();
  assert.equal(mounted.state().briefs[0].id, id);
  assert.match(JSON.stringify(view), /선택한 오래된 원본/);
  assert.ok(reads.every(([url, options]) => new URL(url, 'https://local.test').searchParams.get('brief') === id && !options.method));
  mounted.unmount();
  const missing = await mountedInbox('brief=missing-id', async () => response({ status: 'invalid-input', briefs: [] }));
  await settle();
  assert.match(JSON.stringify(missing.render()), /링크의 리서치를 찾을 수 없어요/);
  assert.match(JSON.stringify(missing.render()), /같은 링크 다시 확인/);
  missing.unmount();
});

test('a delayed research read cannot replace a newer missing source or create a write', async () => {
  let resolve;
  const mounted = await mountedInbox('brief=old', url => new URL(url, 'https://local.test').searchParams.get('brief') === 'old'
    ? new Promise(done => { resolve = done; }) : Promise.resolve(response({ status: 'not-found', briefs: [] })));
  await settle();
  mounted.setRoute('brief=missing');
  await settle();
  assert.equal(mounted.state().status, 'not-found');
  resolve(response({ status: 'live', briefs: [{ id: 'old', title: '오래된 지연 응답', state: 'new' }] }));
  await settle();
  const text = JSON.stringify(mounted.render());
  assert.equal(mounted.state().status, 'not-found');
  assert.match(text, /링크의 리서치를 찾을 수 없어요/);
  assert.doesNotMatch(text, /오래된 지연 응답/);
  mounted.unmount();
});

test('navigating from the new-candidate filter to a promoted deep link still opens that exact source', async () => {
  const mounted = await mountedInbox('', url => Promise.resolve(response(new URL(url, 'https://local.test').searchParams.has('brief')
    ? { status: 'live', briefs: [{ id: 'promoted-id', title: '전환된 원본 리서치', state: 'promoted' }] }
    : { status: 'live', briefs: [] })));
  await settle(); mounted.render();
  mounted.setRoute('brief=promoted-id');
  await settle();
  assert.match(JSON.stringify(mounted.render()), /전환된 원본 리서치/);
  mounted.unmount();
});

test('promoted content link reaches same item after Studio changes its lifecycle from idea to draft', () => {
  assert.equal(typeof ui.researchContentHref, 'function');
  const brief = { brandId: 'brand-id', promotion: { destination: 'idea', content_id: 'content-id' } };
  const link = new URL(ui.researchContentHref(brief), 'https://hub.invalid');
  assert.equal(link.searchParams.get('item'), 'content-id');
  assert.equal(link.searchParams.has('tab'), false);
  assert.equal(link.pathname, '/dashboard/content/studio');
});
test('run status never describes partial/error/running as completed and unknown costs stay null', () => {
  assert.equal(typeof ui.researchRunSummary, 'function');
  assert.equal(ui.researchRunSummary({ status: 'running', preparedCount: 0 }).label, '준비 중');
  assert.equal(ui.researchRunSummary({ status: 'success', preparedCount: 3 }).label, '준비됨');
  assert.equal(ui.researchRunSummary({ status: 'unknown', preparedCount: null }).label, '결과 확인 필요');
  assert.equal(ui.researchRunSummary({ status: 'partial', preparedCount: 1, reason: 'source-failed' }).label, '일부 준비됨');
  const failed = ui.researchRunSummary({ status: 'error', reason: 'source-failed', estimatedCostUsd: null });
  assert.equal(failed.label, '준비 실패');
  assert.equal(failed.cost, null);
  assert.equal(failed.reasonCode, 'source-failed');
  assert.equal(failed.reason, '준비 상태를 확인해 주세요.');
});

test('preparation skips and uncertain model results give readable operator actions without losing their reason code', () => {
  assert.equal(ui.researchRunSummary({ reason: 'invalid-model-evidence' }).reason, 'AI 근거를 원문에서 확인하지 못해 저장하지 않았어요.');
  assert.equal(ui.researchRunSummary({ reason: 'robots-disallowed' }).reason, '원문 사이트의 접근 정책으로 건너뛰었어요.');
  for (const reason of ['daily-quantity-reached', 'run-quantity-reached', 'no-new-source', 'model-outcome-unknown', 'model-response-invalid', 'model-request-rejected', 'invalid-preparation']) {
    const summary = ui.researchRunSummary({ reason });
    assert.equal(summary.reasonCode, reason); assert.ok(summary.reason && summary.reason !== reason && !summary.reason.includes('준비 상태를 확인'));
  }
});
test('browser preparation sends only operator inputs and shares request on an uncertain retry', async () => {
  assert.equal(typeof ui.createResearchRunWriter, 'function');
  let next = 0; const received = [];
  const writer = ui.createResearchRunWriter({ uuid: () => `run-${++next}`, fetch: async (_url, options) => {
    received.push(JSON.parse(options.body));
    if (received.length === 1) throw Error('lost');
    return { ok: true, json: async () => ({ status: 'running', run: { id: 'one' } }) };
  } });
  const command = { brand: 'class.moon', topic: '교육', limit: 3, origin: 'operator', verificationLevel: 'verified' };
  await assert.rejects(writer(command)); await writer(command);
  assert.deepEqual(received[0], { requestId: 'run-1', brand: 'class.moon', topic: '교육', limit: 3 });
  assert.equal(received[1].requestId, 'run-1');
});

test('a completed failure starts a fresh preparation while HTTP failures retain the uncertain request', async () => {
  let counter = 0; const received = [];
  const writer = ui.createResearchRunWriter({ uuid: () => `run-${++counter}`, fetch: async (_url, options) => {
    received.push(JSON.parse(options.body));
    return { ok: received.length !== 1, json: async () => ({ status: received.length === 1 ? 'ok' : 'error', run: { id: 'one', status: 'failed', finishedAt: '2026-10-01T00:00:00Z' } }) };
  } });
  assert.equal((await writer({ brand: '22nomad', limit: 1 })).status, 'error');
  await writer({ brand: '22nomad', limit: 1 });
  assert.equal(received[0].requestId, received[1].requestId);
  await writer({ brand: '22nomad', limit: 1 });
  assert.notEqual(received[1].requestId, received[2].requestId);
});

test('an unknown model outcome retains its request even when the run has a finished timestamp', async () => {
  let counter = 0; const received = [];
  const writer = ui.createResearchRunWriter({ uuid: () => `run-${++counter}`, fetch: async (_url, options) => {
    received.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ status: 'error', run: { id: 'unknown-run', status: 'unknown', finishedAt: '2026-10-01T00:00:00Z' }, reason: 'model-outcome-unknown' }) };
  } });
  await writer({ brand: '22nomad', limit: 1 }); await writer({ brand: '22nomad', limit: 1 });
  assert.equal(received[0].requestId, received[1].requestId);
});

test('research review renders source quotations and conditions before promotion', async () => {
  const source = await readFile(new URL('./research-inbox.jsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('research-inbox.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ResearchFacts');
  assert.ok(node, 'research facts must retain their source evidence');
  const code = ts.transpileModule(node.getText(ast).replace(/^export /, ''), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Facts = new Function('React', `${code}; return ResearchFacts;`)(React);
  const html = renderToStaticMarkup(React.createElement(Facts, { brief: { facts: ['원문 사실'], factEvidence: [{ text: '원문 사실', quote: 'Quoted original sentence.', locator: 'L3' }], conditions: '계정 조건 확인 필요' } }));
  assert.match(html, /원문 사실/); assert.match(html, /Quoted original sentence\./); assert.match(html, /L3/);
  assert.match(source, /selected\.conditions/); assert.match(source, /적용 조건/);
  assert.match(source, /researchContentHref\(selected\)/); assert.doesNotMatch(source, /tab=idea/);
});
