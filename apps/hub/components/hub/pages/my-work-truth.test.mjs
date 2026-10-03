import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import * as primitives from '../hub-primitives.jsx';
import { Iconed } from '../hub-icons.jsx';
import * as mute from './my-work-mute.js';
import { MAX_FOCUS_PER_DAY, focusLimitMessage } from '../../../lib/task-today.js';

// QA regression: preview/unknown empty reads and filtered/stale lists claimed all work complete.
// Run the actual loader with synthetic responses, then render the actual MyWork JSX and primitives.
const source = readFileSync(new URL('./my-work.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const today = mute.seoulDayKey();
const empty = () => ({ status: 'ok', items: [], sources: { tasks: 'live', deals: 'live', calendar: 'live' }, projects: [], focusToday: { date: today, picked: 0, done: 0, limit: 3, remaining: 3 } });
const complete = () => ({ ...empty(), focusToday: { date: today, picked: 2, done: 2, limit: 3, remaining: 1 } });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const noAction = () => { throw new Error('A regression test must not write data or run an external action'); };

function evaluate(hookReact, fetchImpl) {
  const scope = {
    ...primitives, ...mute, React: hookReact, Iconed, MAX_FOCUS_PER_DAY, focusLimitMessage,
    fetch: fetchImpl, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: noAction }), usePathname: () => '/dashboard/work/my',
    useToast: () => ({}), useUndoableAction: () => ({ schedule: noAction, cancel: noAction }), UNDO_WINDOW_MS: 3500,
    JournalSources: () => null, MeetingWatchCard: () => null,
    TASK_PRIORITY_OPTIONS: [], TASK_STATUS_OPTIONS: [], TASK_OUTCOME: {},
    clearSubmittedQuickTaskDraft: noAction, shouldSubmitQuickTask: noAction, freezeTaskCommand: noAction, saveTaskCommand: noAction,
    triggerCelebration: noAction, triggerSparkleAt: noAction, requestPersonaChat: noAction,
    buildMyWorkChecklistToggle: noAction, readMyWorkChecklistReceipt: noAction,
  };
  return new Function(...Object.keys(scope), `${compiled}\nreturn { MyWork, read: useAttentionLedger, injectRead: value => { useAttentionLedger = () => value; } };`)(...Object.values(scope));
}

function reader(respond) {
  let cursor = 0;
  const slots = [];
  const calls = [];
  const hookReact = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback: fn => fn, useEffect: () => {},
  };
  const surface = evaluate(hookReact, async (url, init) => {
    assert.equal(url, '/api/hub/attention');
    assert.deepEqual(init, { cache: 'no-store' });
    calls.push(url);
    return respond(calls.length);
  });
  const read = () => { cursor = 0; return surface.read(); };
  return { read, calls, load: async () => { await read().reload(); return read(); } };
}

function render(read, filters = {}) {
  let slot = 0;
  const initialOverrides = new Map([[0, filters.lane], [1, filters.bucket], [3, filters.muted], [5, filters.search], [18, filters.hidden], [19, filters.patches]].filter(([, value]) => value !== undefined));
  const hookReact = { ...React, useState(initial) { const i = slot++; return React.useState(initialOverrides.has(i) ? initialOverrides.get(i) : initial); } };
  const surface = evaluate(hookReact, noAction);
  surface.injectRead(read);
  return renderToStaticMarkup(React.createElement(surface.MyWork, { onNavigate: noAction }));
}
const assertNoCompletion = html => assert.doesNotMatch(html, /hub-celebration-card|오늘의 모든 할 일 완료|계획된 모든 작업을 완수|오늘 고른 할 일 완료/);

test('a pending read stays loading and never celebrates', () => {
  const model = reader(() => { throw new Error('should not fetch during render'); });
  const html = render(model.read());
  assert.match(html, /기록을 읽는 중/);
  assertNoCompletion(html);
  assert.equal(model.calls.length, 0);
});

test('HTTP 200 preview without sources shows connection truth, not loading or completion', async () => {
  const model = reader(() => response({ status: 'preview', items: [] }));
  const html = render(await model.load());
  assert.match(html, /할 일 연결이 필요합니다|Preview · 연결 필요/);
  assert.doesNotMatch(html, /불러오는 중/);
  assertNoCompletion(html);
  assert.equal(model.calls.length, 1);
});

test('a settled response missing sources cannot prove an empty live ledger', async () => {
  const model = reader(() => response({ ...complete(), sources: undefined }));
  const html = render(await model.load());
  assert.match(html, /할 일 기록을 확인하지 못했습니다/);
  assert.doesNotMatch(html, /불러오는 중/);
  assertNoCompletion(html);
});

for (const [label, data, status] of [
  ['401', { status: 'unauthorized' }, 401],
  ['HTTP 200 unauthorized', { status: 'unauthorized' }, 200],
]) test(`${label} requires login and clears a previously completed cached ledger`, async () => {
  const model = reader(n => response(n === 1 ? complete() : data, n === 1 ? 200 : status));
  assert.match(render(await model.load()), /hub-celebration-card/);
  const read = await model.load();
  const html = render(read);
  assert.equal(read.state, 'unauthorized');
  assert.deepEqual(read.items, []);
  assert.equal(read.focusToday, null);
  assert.match(html, /로그인이 필요합니다|다시 로그인/);
  assertNoCompletion(html);
  assert.equal(model.calls.length, 2);
});

test('HTTP 200 error is a failure, not an empty completion', async () => {
  const model = reader(() => response({ status: 'error', items: [] }));
  const html = render(await model.load());
  assert.match(html, /읽기 실패/);
  assertNoCompletion(html);
});

test('failed revalidation serves cached data as stale without celebrating it', async () => {
  const model = reader(n => { if (n === 1) return response(complete()); throw new TypeError('synthetic read failure'); });
  await model.load();
  const read = await model.load();
  assert.equal(read.state, 'stale');
  const html = render(read);
  assert.match(html, /재검증에 실패/);
  assertNoCompletion(html);
});

test('a confirmed live ledger with zero selected tasks remains a plain empty state', async () => {
  const model = reader(() => response(empty()));
  const html = render(await model.load());
  assert.match(html, /표시할 항목이 없습니다/);
  assertNoCompletion(html);
});

test('fresh live nonempty completed focus preserves celebration with the accurate scope', async () => {
  const model = reader(() => response(complete()));
  const html = render(await model.load());
  assert.match(html, /hub-celebration-card|오늘 고른 할 일 완료/);
  assert.match(html, /오늘 고른 할 일 2개를 모두 완료/);
  assert.match(html, /폭죽 다시 터뜨리기/);
  assert.doesNotMatch(html, /오늘의 모든 할 일 완료|계획된 모든 작업을 완수/);
});

for (const [label, payload] of [
  ['partial tasks', { ...complete(), sources: { tasks: 'partial' } }],
  ['deadline alert source error despite an ok envelope', { ...complete(), sources: { ...complete().sources, deadlineAlerts: 'error' } }],
  ['partial deadline alert source', { ...complete(), sources: { ...complete().sources, deadlineAlerts: 'partial' } }],
  ['preview tasks', { ...complete(), sources: { tasks: 'preview' } }],
  ['preview envelope with a live-looking summary', { ...complete(), status: 'preview' }],
  ['missing summary', { ...complete(), focusToday: null }],
  ['previous day summary', { ...complete(), focusToday: { date: '2000-01-01', picked: 2, done: 2 } }],
  ['incomplete summary', { ...complete(), focusToday: { date: today, picked: 2, done: 1 } }],
  ['string counts', { ...complete(), focusToday: { date: today, picked: '2', done: '2' } }],
  ['zero remaining focus slots is not all completed', { ...complete(), focusToday: { date: today, picked: 3, done: 0, remaining: 0 } }],
]) test(`${label} never claims completion`, async () => {
  const model = reader(() => response(payload));
  assertNoCompletion(render(await model.load()));
});

for (const [label, filters] of [
  ['bucket filter', { bucket: 'later' }], ['lane filter', { lane: 'task' }], ['search', { search: 'unmatched' }],
]) test(`${label} zero is not the all-completed surface`, async () => {
  const model = reader(() => response(complete()));
  assertNoCompletion(render(await model.load(), filters));
});

test('unfocused open tasks omitted by the default later filter prevent global completion', async () => {
  const model = reader(() => response({ ...complete(), items: [{ id: 'task-local-pending', entityId: 'local-pending', lane: 'task', bucket: 'later', title: 'Synthetic pending task' }] }));
  const html = render(await model.load());
  assert.match(html, /표시할 항목이 없습니다/);
  assertNoCompletion(html);
});

test('muting the last pending task does not complete the task ledger', async () => {
  const model = reader(() => response({ ...complete(), items: [{ id: 'task-local-muted', entityId: 'local-muted', lane: 'task', bucket: 'focus', title: 'Synthetic muted task' }] }));
  const html = render(await model.load(), { muted: { 'task-local-muted': { until: null } } });
  assert.match(html, /숨긴 항목/);
  assertNoCompletion(html);
});

for (const [label, filters] of [
  ['pending optimistic removal', { hidden: new Set(['task-local-pending-save']) }],
  ['pending optimistic edit', { patches: { 'task-local-pending-save': { focusToday: false } } }],
]) test(`${label} must settle before celebrating the last confirmed summary`, async () => {
  const model = reader(() => response(complete()));
  assertNoCompletion(render(await model.load(), filters));
});
