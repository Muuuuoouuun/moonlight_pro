import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

const source = readFileSync(new URL('./automations.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('automations.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const parts = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && ['aggregateWebhookEndpoints', 'Webhooks'].includes(node.name?.text))
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'ENGINE_INGEST_PATHS')));
const code = ts.transpileModule(parts.map(node => node.getText(ast).replace(/^export /, '')).join('\n'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Render the real Webhooks handlers against deferred local transport. No real
// webhook, Engine, or model can be invoked from this harness.
function harness(webhookEvents = [], syncState = 'live') {
  const slots = [], requests = [];
  let cursor = 0, tree, reloads = 0;
  const dependencies = {
    React: { ...React,
      useState(initial) {
        const index = cursor++;
        slots[index] ??= { value: initial };
        return [slots[index].value, update => { slots[index].value = typeof update === 'function' ? update(slots[index].value) : update; }];
      },
      useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    },
    useAutomationsLedger: () => ({ webhookEvents, syncState, reload: () => { reloads++; } }),
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    setTimeout() {},
  };
  for (const name of ['Iconed', 'Dot', 'Card', 'Badge', 'IconButton', 'Button', 'SyncBadge', 'EmptyState', 'Skeleton']) dependencies[name] = name;
  const Component = new Function(...Object.keys(dependencies), `${code}\nreturn Webhooks;`)(...Object.values(dependencies));
  function render() { cursor = 0; tree = Component({}); return tree; }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement(node)) return [];
    return [node, ...nodes(node.props.children), ...nodes(node.props.action)];
  }
  function triggers() {
    return nodes(tree).filter(node => node.props.icon === 'play' && ['Button', 'IconButton'].includes(node.type));
  }
  render();
  return { render, requests, triggers, state: () => slots[0].value, nodes: () => nodes(tree), reloads: () => reloads };
}
const sent = () => ({ ok: true, json: async () => ({ status: 'sent' }) });

for (const [label, events] of [
  ['empty-state smoke button', []],
  ['received-endpoint row', [{ source: 'project', eventType: 'updated', status: 'ok', lastHit: '지금' }]],
]) test(`${label} blocks repeated same-render clicks until the request settles`, async () => {
  const h = harness(events), original = h.triggers()[0];
  const pending = original.props.onClick();
  await original.props.onClick();
  assert.equal(h.requests.length, 1);
  h.render();
  assert.equal(h.triggers()[0].props.disabled, true);
  assert.equal(h.triggers()[0].props['aria-busy'], true);
  h.requests[0].resolve(sent()); await pending; h.render();
  assert.equal(h.triggers()[0].props.disabled, false);
  assert.equal(h.state()[0].label, '✓ sent');
});

test('a failed send releases the synchronous lock and permits one explicit retry', async () => {
  const h = harness(), first = h.triggers()[0].props.onClick();
  h.requests[0].reject(new Error('offline')); await first; h.render();
  assert.equal(h.state()[0].label, 'failed');
  assert.equal(h.triggers()[0].props.disabled, false);
  const retry = h.triggers()[0].props.onClick();
  await h.triggers()[0].props.onClick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(sent()); await retry;
  assert.equal(h.state()[0].label, '✓ sent');
});

for (const [source, targetRoute] of [['project', 'generic'], ['moltbot', 'moltbot']]) {
  test(`${source} row sends the server's actual ${targetRoute} target contract`, async () => {
    const h = harness([{ source, eventType: 'updated', status: 'ok', lastHit: '지금' }]);
    const pending = h.triggers()[0].props.onClick();
    assert.deepEqual(JSON.parse(h.requests[0].options.body), {
      targetRoute, title: `Webhook smoke test · ${source} — updated`,
    });
    assert.equal(h.requests[0].url, '/api/webhooks/project-test');
    h.requests[0].resolve(sent()); await pending;
  });
}

test('an unmapped source cannot silently send a generic Project webhook', async () => {
  const h = harness([{ source: 'unknown-provider', eventType: 'received', status: 'ok', lastHit: '지금' }]);
  assert.equal(h.triggers()[0].props.disabled, true);
  assert.match(h.triggers()[0].props.tooltip, /테스트 경로는 아직 연결되지 않았습니다/);
  await h.triggers()[0].props.onClick();
  assert.equal(h.requests.length, 0);
});

for (const [body, expected, tone] of [
  [{ status: 'preview', sent: false, reason: 'missing-engine-url' }, 'Engine 연결 필요', 'neutral'],
  [{ status: 'preview', sent: false, statusCode: 401 }, '전송 실패 (401)', 'danger'],
  [{ status: 'preview', sent: false, statusCode: 500 }, '전송 실패 (500)', 'danger'],
  [{}, '전송 결과 확인 필요', 'danger'],
]) test(`HTTP-success wrapper preserves ${expected} instead of saying preview or sent`, async () => {
  const h = harness(), pending = h.triggers()[0].props.onClick();
  h.requests[0].resolve({ ok: true, status: 202, json: async () => body });
  await pending;
  assert.deepEqual(h.state()[0], { tone, label: expected });
});

test('Webhook read failures provide a working refresh and never claim empty while still loading', () => {
  const loading = harness([], 'loading');
  assert.equal(loading.nodes().some(node => node.type === 'EmptyState'), false);
  assert.ok(loading.nodes().some(node => node.type === 'Skeleton' && node.props.label === 'Webhook 수신 기록 읽는 중'));
  const failed = harness([], 'error');
  failed.nodes().find(node => node.type === 'Button' && node.props.children === '새로고침').props.onClick();
  assert.equal(failed.reloads(), 1);
  const partial = harness([], 'partial');
  assert.equal(partial.nodes().find(node => node.type === 'EmptyState').props.title, '일부 webhook 기록만 확인했습니다');
});
