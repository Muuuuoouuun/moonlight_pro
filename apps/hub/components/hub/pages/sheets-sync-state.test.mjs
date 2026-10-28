import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./sheets-sync.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replace(/^import .*;\n/gm, '').replace('export function SheetsSync', 'function SheetsSync'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => body });
const connected = { status: 'connected', enabled: true, connected: true, staging: { pending: 3 }, recentRuns: [] };

// Execute the actual component, not a copied state mapper. Synthetic transport
// only: these tests cannot access Google Sheets, Supabase, or a running app.
function harness({ read = connected, write = { status: 'ok', results: { import: { ok: true, imported: 2 } } } } = {}) {
  const slots = [], effects = [], requests = [];
  let cursor = 0, mounted = false, tree;
  const dependencies = {
    React: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!slots[index]) slots[index] = { value: initial };
        return [slots[index].value, update => { slots[index].value = typeof update === 'function' ? update(slots[index].value) : update; }];
      },
      useRef(initial) {
        const index = cursor++;
        slots[index] ??= { current: initial };
        return slots[index];
      },
      useCallback: callback => callback,
      useEffect: effect => { if (!mounted) effects.push(effect); },
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const value = options.method === 'POST' ? write : read;
      return typeof value === 'function' ? value(url, options) : response(value);
    },
  };
  for (const name of ['Iconed', 'Card', 'Button', 'Badge', 'Dot', 'SectionTitle']) {
    dependencies[name] = function Primitive({ children }) { return React.createElement('div', null, children); };
  }
  dependencies.TruthBadge = ({ state }) => React.createElement('span', null, state);
  dependencies.EmptyState = ({ title, description, action }) => React.createElement('section', null, title, description, action);
  dependencies.Skeleton = ({ label }) => React.createElement('span', null, label);
  const Component = new Function(...Object.keys(dependencies), `${code}\nreturn SheetsSync;`)(...Object.values(dependencies));
  const render = () => { cursor = 0; tree = Component(); return tree; };
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!React.isValidElement(node)) return [];
    return [node, ...nodes(node.props.children), ...nodes(node.props.action)];
  }
  function button(label) {
    const found = nodes(tree).find(node => node.type === dependencies.Button && node.props.children === label);
    assert.ok(found, `button ${label}`);
    return found;
  }
  render(); mounted = true;
  for (const effect of effects) effect();
  return {
    requests, render, button,
    state: () => slots[0].value,
    message: () => slots[2].value,
    html: () => renderToStaticMarkup(render()),
    posts: () => requests.filter(request => request.options.method === 'POST'),
  };
}

test('connected partial reads retain unknown staging and name missing history without claiming zero', async () => {
  const h = harness({ read: { ...connected, partial: true, staging: null, failedSources: ['lead_intake_raw', 'sync_runs'] } });
  await settle();
  assert.equal(h.state().syncState, 'partial');
  assert.equal(h.state().staging, null);
  const html = h.html();
  assert.match(html, /일부 기록을 읽지 못했습니다/);
  assert.match(html, /대기·처리 집계/);
  assert.match(html, /동기화 이력을 확인하지 못했습니다/);
  assert.doesNotMatch(html, /동기화 이력이 없습니다/);
  assert.match(html, /대기<\/span><span[^>]*>—<\/span>/);
});

test('initial loading and failed reads do not offer a fake disconnected state or empty history', async () => {
  let finish;
  const h = harness({ read: () => new Promise(resolve => { finish = resolve; }) });
  assert.match(h.html(), /확인 중/);
  assert.match(h.html(), /동기화 이력 읽는 중/);
  assert.doesNotMatch(h.html(), /미연결|동기화 이력이 없습니다|OAuth 비활성/);
  finish(response({ status: 'error' }));
  await settle();
  assert.match(h.html(), /연결 기록을 읽지 못했습니다/);
  assert.match(h.html(), /동기화 이력을 확인하지 못했습니다/);
  assert.doesNotMatch(h.html(), /동기화 이력이 없습니다/);
});

test('HTTP 200 partial sync names failed stages and reports counts only for confirmed stages', async () => {
  const h = harness({ write: { status: 'partial', results: {
    import: { ok: false, reason: 'auth-failed' },
    promote: { ok: true, promoted: 2, merged: 1, review: 0 },
    push: { ok: false, reason: 'push-failed' },
  } } });
  await settle(); h.render();
  await h.button('전체 동기화').props.onClick();
  assert.equal(h.message().tone, 'danger');
  assert.match(h.message().text, /import 실패: 구글 계정을 다시 연결/);
  assert.match(h.message().text, /push 실패: 시트에 쓰지 못했습니다/);
  assert.match(h.message().text, /확인된 처리: promote 신규 2·매칭 1/);
  assert.doesNotMatch(h.message().text, /import 0건|push 0행|완료/);
});

for (const payload of [null, {}, { status: 'ok', results: {} }, { status: 'ok', results: { import: { imported: 4 } } }]) {
  test(`unconfirmed sync response never claims completion: ${JSON.stringify(payload)}`, async () => {
    const h = harness({ write: payload });
    await settle(); h.render();
    await h.button('시트→DB import').props.onClick();
    assert.equal(h.message().tone, 'danger');
    assert.match(h.message().text, /결과를 확인하지 못했습니다/);
    assert.match(h.message().text, /반영 여부를 확인한 뒤 재시도/);
    assert.doesNotMatch(h.message().text, /완료|import 0건/);
  });
}

test('same-render repeated clicks and other sync actions share one synchronous lock, then allow retry', async () => {
  let finish;
  const h = harness({ write: () => new Promise(resolve => { finish = resolve; }) });
  await settle(); h.render();
  const all = h.button('전체 동기화'), another = h.button('시트→DB import');
  const pending = all.props.onClick();
  await all.props.onClick();
  await another.props.onClick();
  assert.equal(h.posts().length, 1);
  h.render();
  for (const label of ['동기화 중…', '시트→DB import', '승격(dedupe)', 'DB→시트 push', '재연결']) {
    assert.equal(h.button(label).props.disabled, true, label);
  }
  finish(response({ status: 'partial', results: { import: { ok: false }, promote: { ok: false }, push: { ok: false } } }));
  await pending; await settle(); h.render();
  assert.equal(h.button('전체 동기화').props.disabled, false);
  const retry = h.button('시트→DB import').props.onClick();
  assert.equal(h.posts().length, 2);
  finish(response({ status: 'ok', results: { import: { ok: true, imported: 2, skipped: 1 } } }));
  await retry;
  assert.deepEqual(h.message(), { tone: 'neutral', text: 'import 2건(skip 1)' });
});

test('transport failure preserves uncertain outcome and releases the lock without automatic resend', async () => {
  const h = harness({ write: () => Promise.reject(new Error('network failed')) });
  await settle(); h.render();
  await h.button('시트→DB import').props.onClick();
  assert.equal(h.posts().length, 1);
  assert.match(h.message().text, /반영 여부를 확인한 뒤 재시도/);
  h.render();
  assert.equal(h.button('시트→DB import').props.disabled, false);
});

test('a false stage result overrides an ok envelope and remains visible after a failed refresh', async () => {
  let reads = 0;
  const h = harness({
    read: () => response(reads++ ? { status: 'error' } : connected),
    write: { status: 'ok', results: { import: { ok: false, reason: 'auth-failed' } } },
  });
  await settle(); h.render();
  await h.button('시트→DB import').props.onClick();
  await settle();
  assert.equal(h.state().syncState, 'error');
  assert.match(h.html(), /import 실패: 구글 계정을 다시 연결/);
  assert.doesNotMatch(h.message().text, /완료|import 0건/);
});

test('permission failure is actionable and never displayed as completed', async () => {
  const h = harness({ write: () => response({ reason: 'unauthorized' }, false) });
  await settle(); h.render();
  await h.button('시트→DB import').props.onClick();
  assert.equal(h.message().tone, 'danger');
  assert.match(h.message().text, /로그인 상태를 확인/);
  assert.doesNotMatch(h.message().text, /완료|0건/);
});

test('a confirmed stage with unknown counts uses dashes, not fabricated zeros', async () => {
  const h = harness({ write: { status: 'ok', results: { import: { ok: true } } } });
  await settle(); h.render();
  await h.button('시트→DB import').props.onClick();
  assert.deepEqual(h.message(), { tone: 'neutral', text: 'import —건(skip —)' });
});
