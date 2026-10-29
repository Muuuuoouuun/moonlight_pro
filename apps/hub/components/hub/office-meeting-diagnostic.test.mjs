import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beginOfficeMeetingRead, finishOfficeMeetingRead, describeOfficeMeetingRead, officeUnknownReason, guardOfficeMeetingRead } from './office-meeting-diagnostic.js';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as officeSession from './office-session.js';
import * as meetingsClient from './office-meetings-client.js';
import * as officeContracts from '@com-moon/agent-contracts/office';
import * as officeJobs from '@com-moon/agent-contracts/office-jobs';

const componentSource = readFileSync(new URL('./office-meeting-diagnostic.jsx', import.meta.url), 'utf8');
const componentCode = ts.transpileModule(componentSource, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', componentCode)(name => ({ react: React,
  './office-meeting-diagnostic.js': { describeOfficeMeetingRead },
  './pages/office-council.module.css': { request: 'request', meetingDiagnostic: 'meetingDiagnostic', note: 'note' },
})[name], componentModule, componentModule.exports);
const { OfficeMeetingDiagnostic } = componentModule.exports;

const target = { origin: 'https://hub.fixture.invalid', scope: 'personal', meetingId: '10000000-0000-4000-8000-000000000001' };
const requestId = '10000000-0000-4000-8000-000000000002';
const at = '2026-10-20T01:00:00.000Z';
const later = '2026-10-20T01:02:00.000Z';
const turn = (state = 'unknown', extra = {}) => ({ id: requestId, state, request: { scope: 'personal', message: '원래 요청' },
  ...(state === 'generated' ? { result: { scope: 'personal', answer: '확인 결과' } } : {}), ...extra });
const detail = (state = 'unknown', extra = {}) => ({ status: 'ready', historyComplete: true, observedAt: at,
  meeting: { meetingId: target.meetingId, scope: target.scope }, turns: [turn(state)], ...extra });
const observe = () => finishOfficeMeetingRead(beginOfficeMeetingRead(null, target, 1, at, turn()), target, 1, detail(), at);

test('unknown classification requires explicit versioned server evidence, never finishedAt, revision or elapsed age', () => {
  for (const extra of [{ finishedAt: at }, { revision: 999 }, { diagnostic: { version: 1, kind: 'finished-unknown', observedAt: 'yesterday' } },
    { diagnostic: { version: 2, kind: 'overdue-running', observedAt: at } }]) assert.equal(officeUnknownReason(turn('unknown', extra)), 'unclassified');
  for (const kind of ['overdue-running', 'finished-unknown']) {
    assert.equal(officeUnknownReason(turn('unknown', { diagnostic: { version: 1, kind, observedAt: at } })), kind);
  }
  assert.equal(officeUnknownReason(turn('running', { diagnostic: { version: 1, kind: 'finished-unknown', observedAt: at } })), 'unclassified');
});

test('failed and incomplete reads preserve the last valid observation and target ID without inventing absence', () => {
  const observed = observe();
  for (const result of [{ status: 'error' }, { status: 'preview' }, detail('unknown', { historyComplete: false, turns: [] }),
    detail('unknown', { turns: [] }), detail('unknown', { meeting: { ...target, scope: 'classin' } })]) {
    const state = finishOfficeMeetingRead(beginOfficeMeetingRead(observed, target, 2, later), target, 2, result, later);
    assert.deepEqual(state.lastObservation, observed.lastObservation);
    assert.equal(state.requestId, requestId);
    assert.equal(state.lastAttempt.startedAt, later);
    assert.equal(state.lastAttempt.receivedAt, later);
    assert.equal(describeOfficeMeetingRead(state, { ...target, now: Date.parse(later) }).stale, true);
  }
});

test('newest-issued GET wins even when older success or failure arrives after matching generated', () => {
  const first = observe();
  const second = beginOfficeMeetingRead(first, target, 2, later);
  const third = beginOfficeMeetingRead(second, target, 3, later);
  const generated = finishOfficeMeetingRead(third, target, 3, detail('generated'), later);
  assert.equal(generated.lastObservation.state, 'generated');
  for (const result of [detail('unknown'), { status: 'error' }]) {
    assert.equal(finishOfficeMeetingRead(generated, target, 2, result, later), generated);
  }
  const stale = finishOfficeMeetingRead(beginOfficeMeetingRead(generated, target, 4, later), target, 4, detail('unknown'), later);
  assert.deepEqual(stale.lastObservation, generated.lastObservation);
  assert.equal(stale.lastAttempt.outcome, 'older-observation');
});

test('meeting, scope, origin and newly selected unresolved request do not inherit observations', () => {
  const first = observe();
  for (const changed of [{ ...target, meetingId: 'another-meeting' }, { ...target, scope: 'classin' }, { ...target, origin: 'https://other.fixture.invalid' }]) {
    const state = beginOfficeMeetingRead(first, changed, 2, later);
    assert.equal(state.lastObservation, null);
    assert.equal(state.requestId, null);
    assert.equal(finishOfficeMeetingRead(state, target, 1, detail(), later), state);
  }
  const changed = beginOfficeMeetingRead(first, target, 2, later, turn('unknown', { id: 'new-unresolved' }));
  assert.equal(changed.lastObservation, null);
  assert.equal(describeOfficeMeetingRead(first, { ...target, knownTurn: turn('unknown', { id: 'new-unresolved' }) }).observation, undefined);
});

test('legacy or cached records disclose unavailable timestamps instead of claiming a fresh server observation', () => {
  const cached = describeOfficeMeetingRead(null, { ...target, knownTurn: turn('unknown', { finishedAt: at }) });
  assert.equal(cached.observation, undefined);
  assert.match(cached.label, /원인 확인 근거 부족/);
  const legacy = finishOfficeMeetingRead(beginOfficeMeetingRead(null, target, 1, at, turn()), target, 1, detail('unknown', { historyComplete: undefined }), later);
  assert.equal(legacy.lastObservation, null);
  assert.equal(legacy.lastAttempt.outcome, 'partial');
});

test('disclosure uses native details, escaped IDs and separate observation/attempt times without creating an action', () => {
  const observed = observe();
  const failed = finishOfficeMeetingRead(beginOfficeMeetingRead(observed, target, 2, later), target, 2, { status: 'error' }, later);
  const html = renderToStaticMarkup(React.createElement(OfficeMeetingDiagnostic, { state: failed, ...target, now: Date.parse(later) }));
  for (const text of ['<details', '<summary', requestId, target.meetingId, '마지막 확인 수신', '최근 조회 시도', '이전 확인이며 현재 상태 미확인', '계정 식별자는 이 응답에 없습니다', '요청을 다시 생성하지 않습니다']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<button|<input|<form|<script/);
  const escaped = renderToStaticMarkup(React.createElement(OfficeMeetingDiagnostic, { ...target, knownTurn: turn('unknown', { id: '<script>fixture</script>' }) }));
  assert.match(escaped, /&lt;script&gt;fixture&lt;\/script&gt;/);
  assert.doesNotMatch(escaped, /<script>/);
});

// Execute the real room handlers, real session store and GET client with isolated
// React hooks and synthetic HTTP responses. No app auth/session boundary is bypassed.
function mountRoom() {
  const store = officeSession.createOfficeSessionStore();
  const full = (state = 'unknown', patch = {}) => ({ ...detail(state), persisted: true,
    meeting: { ...detail().meeting, revision: 7, state: 'open', title: '합성 안건', ownerId: 'eevee', reviewers: [], mode: 'chat', decisionContext: '', ...patch },
    turns: [turn(state, { request: { scope: 'personal', message: '원래 요청', ownerId: 'eevee', mode: 'chat' },
      ...(state === 'generated' ? { result: { scope: 'personal', answer: '확인 결과', ownerId: 'eevee', mode: 'chat' } } : {}) })], skillRequests: [] });
  store.restoreMeeting('personal', full());
  store.update('personal', { draft: ' 수정한 입력 그대로\n' });
  const slots = [], effects = [], calls = [], network = [];
  let index = 0, tree, scope = 'personal', selected = target.meetingId;
  const hooks = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(child => child != null && child !== false) } }),
    useState(initial) { const key = index++; if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }]; },
    useRef(initial) { const key = index++; return slots[key] ??= { current: initial }; },
    useMemo: fn => fn(), useCallback: fn => fn,
    useEffect(fn, deps) { const key = index++; const old = slots[key];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        slots[key] = { deps, cleanup: old?.cleanup };
        effects.push(() => { slots[key].cleanup?.(); slots[key].cleanup = fn(); });
      }
    },
  };
  const primitives = new Proxy({}, { get: (_object, name) => String(name) });
  const modules = {
    react: hooks,
    'next/navigation': { useRouter: () => ({ replace() {} }), useSearchParams: () => new URLSearchParams({ meeting: selected }) },
    '@com-moon/agent-contracts/office': officeContracts,
    '@com-moon/agent-contracts/office-jobs': officeJobs,
    '../hub-primitives': primitives,
    '../office-session': { ...officeSession, loadOfficeTasks: async () => ({ status: 'live', tasks: [] }) },
    '../use-office-session': { useOfficeSession: value => ({ session: store.get(value), store, update: patch => store.update(value, patch) }) },
    '../office-meetings-client': { ...meetingsClient, readOfficeMeeting: (id, value) => {
      let notify;
      const call = { id, scope: value, ready: new Promise(resolve => { notify = resolve; }) };
      calls.push(call);
      return meetingsClient.readOfficeMeeting(id, value, { fetcher: (url, init) => {
        network.push({ url, method: init.method });
        return new Promise(resolve => { call.respond = body => resolve(Response.json(body)); notify(); });
      } });
    }, sendOfficeMeeting: () => { throw new Error('diagnostic attempted POST'); } },
    '../office-meeting-diagnostic.jsx': { OfficeMeetingDiagnostic: 'diagnostic' },
    '../office-meeting-diagnostic.js': { beginOfficeMeetingRead, finishOfficeMeetingRead, guardOfficeMeetingRead },
    '../office-skill-request': { officeSkillRequestDraft: () => null },
    './office-council.module.css': primitives,
  };
  const source = readFileSync(new URL('./pages/office-meeting-room.jsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', code)(name => modules[name] || {}, module, module.exports, { location: { origin: target.origin } });
  const render = (runEffects = true) => { index = 0; tree = module.exports.OfficeMeetingRoom({ scope });
    if (runEffects) effects.splice(0).forEach(fn => fn()); return tree; };
  const nodes = (predicate, node = tree) => !node || typeof node !== 'object' ? []
    : [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => nodes(predicate, child))];
  render(); render();
  return { store, calls, network, render, full, nodes,
    async respond(index, body) { await calls[index].ready; calls[index].respond(body); },
    select(id, value = 'personal', runEffects = true) { selected = id; scope = value; render(runEffects); },
    refresh() { return nodes(node => node.type === 'Button' && node.props.children.includes('입력 유지하고 저장된 회의 확인'))[0].props.onClick(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('real Hub recheck is GET only and a failed refresh preserves history, changed draft and last valid observation', async () => {
  const app = mountRoom();
  let read = app.refresh();
  await app.respond(0, app.full()); await read; app.render();
  const before = app.nodes(node => node.type === 'diagnostic')[0].props.state.lastObservation;
  app.store.update('personal', { draft: ' 다시 편집한 원문\n' });
  read = app.refresh(); await app.respond(1, { status: 'error', error: 'synthetic-read-failure' }); await read; app.render();
  assert.equal(app.store.get('personal').unresolvedTurns[0].id, requestId);
  assert.equal(app.store.get('personal').draft, ' 다시 편집한 원문\n');
  const diagnostic = app.nodes(node => node.type === 'diagnostic')[0].props.state;
  assert.deepEqual(diagnostic.lastObservation, before);
  assert.equal(diagnostic.lastAttempt.outcome, 'read-error');
  assert.deepEqual(app.network.map(item => item.method), ['GET', 'GET']);
  for (const item of app.network) {
    const url = new URL(item.url, target.origin);
    assert.equal(url.pathname, `/api/hub/office/meetings/${target.meetingId}`);
    assert.deepEqual([...url.searchParams], [['readVersion', '1'], ['scope', 'personal']]);
  }
  app.unmount();
});

test('real Hub handler rejects reverse GET completion, selection changes and unmounted responses', async () => {
  for (const old of ['unknown', 'error']) {
    const app = mountRoom();
    const first = app.refresh(), second = app.refresh();
    await app.respond(1, app.full('generated')); await second;
    await app.respond(0, old === 'error' ? { status: 'error' } : app.full('unknown')); await first;
    assert.equal(app.store.get('personal').turns[0].id, requestId);
    assert.equal(app.store.get('personal').unresolvedTurns.length, 0);
    assert.equal(app.store.get('personal').draft, ' 수정한 입력 그대로\n');
    app.unmount();
  }
  for (const change of [app => app.select('10000000-0000-4000-8000-000000000099', 'personal', false), app => app.select(target.meetingId, 'classin', false), app => app.unmount()]) {
    const app = mountRoom(); const read = app.refresh(); change(app);
    await app.respond(0, app.full('generated')); await read;
    assert.equal(app.store.get('personal').unresolvedTurns[0].id, requestId);
    assert.equal(app.store.get('personal').turns.length, 0);
    assert.equal(app.store.get('personal').draft, ' 수정한 입력 그대로\n');
    app.unmount();
  }
});

test('real Hub handler preserves verified generated history and pending/draft against later stale, absent or failed reads', async () => {
  const app = mountRoom();
  const check = app.nodes(node => node.type === 'Button' && node.props.children.includes('입력 유지하고 저장된 회의 확인'))[0].props.onClick;
  let read = check(); await app.respond(0, app.full('generated')); await read;
  const current = app.store.get('personal');
  const pending = { id: '10000000-0000-4000-8000-000000000099', rawDraft: '새 요청의 원문', request: { message: '새 요청의 원문', scope: 'personal' } };
  app.store.update('personal', { pending, draft: ' 수정한 후속 입력\n' });
  // Exercise a captured in-flight-capable read handler. The visible button would
  // be disabled while pending; a response already underway still needs fencing.
  const results = [app.full('unknown'), { ...app.full(), turns: [] }, { ...app.full(), historyComplete: false }, { status: 'error' }];
  for (const [index, result] of results.entries()) {
    read = check(); await app.respond(index + 1, result); await read;
    assert.deepEqual(app.store.get('personal').turns, current.turns);
    assert.deepEqual(app.store.get('personal').pending, pending);
    assert.equal(app.store.get('personal').draft, ' 수정한 후속 입력\n');
  }
  assert.ok(app.network.every(item => item.method === 'GET'));
  app.unmount();
});
