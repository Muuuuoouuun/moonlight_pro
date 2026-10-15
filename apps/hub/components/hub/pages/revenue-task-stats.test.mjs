import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = readFileSync(new URL('./revenue.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('revenue.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let handler, counter;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadDealTaskStats') handler = node.initializer.arguments[0].getText(ast);
  if (ts.isArrowFunction(node) && node.getText(ast).includes('const stat = dealTaskStats.get(d.id);') && !node.getText(ast).includes('const [dealTaskStats')) counter = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler && counter, 'exercise the current production handler and card count expression');

const prior = new Map([['deal', { done: 1, total: 3 }]]);
async function load(data, { ok = true, throws = false, invalidJson = false } = {}) {
  let stats = prior, state = 'live';
  const fetch = async (path, options) => {
    assert.equal(path, '/api/hub/tasks');
    assert.equal(options.cache, 'no-store');
    if (throws) throw Error('synthetic read unavailable');
    return { ok, json: async () => { if (invalidJson) throw Error('synthetic malformed JSON'); return data; } };
  };
  const run = new Function('fetch', 'setDealTaskStats', 'setDealTaskStatsState', `return (${handler});`)(fetch, value => { stats = value; }, value => { state = value; });
  await run();
  return { stats, state };
}

const rows = [{ dealId: 'deal', done: true }, { dealId: 'deal', done: false }, { dealId: null, done: true }];
test('live task rows replace prior counts with confirmed complete counts', async () => {
  const { stats, state } = await load({ status: 'live', source: 'supabase', tasks: rows, failedSources: [] });
  assert.notEqual(stats, prior);
  assert.deepEqual([...stats], [['deal', { done: 1, total: 2 }]]);
  assert.equal(state, 'live');
});

test('partial joins still allow complete task counts when tasks were not among the failed sources', async () => {
  const { stats, state } = await load({ status: 'partial', source: 'supabase', tasks: rows, failedSources: ['projects'] });
  assert.deepEqual([...stats], [['deal', { done: 1, total: 2 }]]);
  assert.equal(state, 'live', 'the count refers to complete tasks even when another join is partial');
});

for (const [name, data, state] of [
  ['HTTP 200 business failure', { status: 'error', source: 'error', tasks: [] }, 'error'],
  ['unconfigured preview', { status: 'preview', tasks: [] }, 'preview'],
  ['partial task window', { status: 'partial', tasks: rows, failedSources: ['tasks'] }, 'partial'],
  ['partialSources task window', { status: 'partial', tasks: rows, partialSources: ['tasks'] }, 'partial'],
  ['error source', { status: 'live', source: 'error', tasks: [] }, 'error'],
  ['missing task array', { status: 'live', source: 'supabase' }, 'error'],
]) test(`${name} preserves the last confirmed map and marks current counts unverified`, async () => {
  const result = await load(data);
  assert.equal(result.stats, prior);
  assert.equal(result.state, state);
});

test('HTTP failure, malformed JSON and thrown reads keep prior counts', async () => {
  for (const options of [{ ok: false }, { invalidJson: true }, { throws: true }]) {
    const result = await load({ status: 'live', tasks: rows }, options);
    assert.equal(result.stats, prior);
    assert.equal(result.state, 'error');
  }
});

test('a confirmed empty read clears old counts without declaring an outage', async () => {
  const result = await load({ status: 'live', source: 'supabase', tasks: [], failedSources: [] });
  assert.deepEqual([...result.stats], []);
  assert.equal(result.state, 'live');
});

function markup(stats, state) {
  const code = ts.transpileModule(`const renderCount = ${counter};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const render = new Function('React', 'dealTaskStats', 'dealTaskStatsState', 'd', `${code}; return renderCount;`)(React, stats, state, { id: 'deal' });
  return renderToStaticMarkup(render());
}

test('the actual card distinguishes confirmed counts from preserved prior counts', () => {
  assert.match(markup(prior, 'live'), />✓1\/3<\/span>/);
  for (const state of ['partial', 'error', 'preview']) {
    const html = markup(prior, state);
    assert.match(html, /이전 ✓1\/3 · 미확인/);
    assert.match(html, /현재 할 일 집계를 확인하지 못했습니다/);
    assert.doesNotMatch(html, />✓1\/3<\/span>/);
  }
});

test('missing current counts show unverified rather than zero while confirmed empty/loading remain quiet', () => {
  const empty = new Map();
  for (const state of ['partial', 'error', 'preview']) assert.match(markup(empty, state), /할 일 미확인/);
  assert.equal(markup(empty, 'live'), '');
  assert.equal(markup(empty, 'loading'), '');
});
