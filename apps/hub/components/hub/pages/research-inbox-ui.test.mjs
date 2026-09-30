import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const ui = await import('./research-run-ui.js').catch(() => ({}));

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
  for (const reason of ['daily-quantity-reached', 'run-quantity-reached', 'no-new-source', 'model-outcome-unknown', 'invalid-preparation']) {
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
