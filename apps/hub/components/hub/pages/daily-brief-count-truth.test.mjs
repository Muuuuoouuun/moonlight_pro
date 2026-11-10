import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as taskModel from '../../../lib/task-today.js';

// Execute production JSX with synthetic read boundaries. No browser, request,
// authentication, provider or persistence is used by these render regressions.
const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = end ? source.indexOf(end, from) : source.length;
  assert.ok(from >= 0 && to > from, `${start} section must exist`);
  return source.slice(from, to);
}
const compiled = ts.transpileModule([
  section('function TaskToday(', 'const EMPTY_DAILY_BRIEF_STATE ='),
  section('function BriefClock(', '// 주간 정리 리포트 카드'),
  section('export function DailyBrief(').replace('export function', 'function'),
].join('\n'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const emptyTask = () => ({ ...taskModel.buildTaskToday([]), state: 'live' });
const ledgerOf = (syncState = 'live', extra = {}) => ({
  syncState, signals: [], metrics: [], sources: [], summary: {}, taskToday: emptyTask(), refreshTasks() {}, ...extra,
});
function render(ledger, cachedStreak = null) {
  const deps = {
    React, ...taskModel, useDailyBriefLedger: () => ledger,
    useTodayTaskActions: taskToday => ({ taskToday, pendingIds: [] }),
    useGuruRecommendations: () => ({}), useToast: () => ({}), rankSignals: items => items,
    useUndoableAction: () => ({}), formatBriefDate: () => '합성 날짜', greetingFor: () => '안녕하세요',
    window: {}, localStorage: { getItem: () => JSON.stringify(cachedStreak) },
  };
  for (const name of new Set([...compiled.matchAll(/React\.createElement\(([A-Z]\w*)/g)].map(match => match[1]))) {
    if (['React', 'TaskToday', 'BriefClock'].includes(name)) continue;
    deps[name] = () => null;
  }
  deps.SectionTitle = ({ children, right }) => React.createElement('section', null, children, right);
  deps.Badge = ({ children }) => React.createElement('span', null, children);
  deps.Card = ({ children }) => React.createElement('div', null, children);
  deps.TruthBadge = ({ state, label }) => React.createElement('span', { 'data-truth': state }, label || state);
  deps.Skeleton = ({ label }) => React.createElement('span', { 'aria-busy': true }, label);
  deps.BurningStreakBadge = ({ streak, todayCompleted }) => React.createElement('span', { 'data-streak': streak }, `${streak}일 연속 / 오늘 ${todayCompleted}건 완료`);
  deps.EmptyState = ({ title, description }) => React.createElement('div', null, title, description);
  const { DailyBrief } = new Function(...Object.keys(deps), `${compiled}; return { DailyBrief };`)(...Object.values(deps));
  const html = renderToStaticMarkup(React.createElement(DailyBrief, { onNavigate() {} }));
  const hero = html.match(/<div class="daily-brief__intro-stats"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
  const taskStart = html.indexOf('aria-label="대기 할 일"');
  assert.ok(taskStart >= 0, '대기 할 일 영역이 실제로 렌더돼야 한다');
  const tasks = html.slice(taskStart);
  return { html, hero, tasks, counts: [...hero.matchAll(/<strong[^>]*>(.*?)<\/strong>/g)].map(match => match[1]) };
}

for (const state of ['syncing', 'loading', 'preview', 'error', 'partial', 'mixed']) {
  test(`${state} hero does not claim empty counts as verified zero`, () => {
    const view = render(ledgerOf(state, { taskToday: { state: state === 'syncing' ? 'loading' : state, items: [], counts: {} } }));
    assert.doesNotMatch(view.hero, /<strong[^>]*>0<\/strong>/);
    if (['syncing', 'loading'].includes(state)) assert.match(view.hero, /aria-busy="true"/);
    else assert.deepEqual(view.counts, ['—', '—', '—']);
  });
}

test('live zero remains numeric in the hero, task lanes, focus and streak', () => {
  const view = render(ledgerOf());
  assert.deepEqual(view.counts, ['0', '0', '0']);
  assert.match(view.tasks, /놓침 0/); assert.match(view.tasks, /오늘 0/);
  assert.match(view.tasks, /오늘 3개 0\/0/); assert.match(view.tasks, /data-streak="0"/);
});

test('missing live task fields remain unknown instead of being invented from defaults or local storage', () => {
  const view = render(ledgerOf('live', { taskToday: { state: 'live', items: [], counts: {} } }), { streak: 8, todayDoneCount: 2 });
  assert.match(view.tasks, /놓침 —/); assert.match(view.tasks, /오늘 —/);
  assert.match(view.tasks, /오늘 3개 —\/—/); assert.doesNotMatch(view.tasks, /data-streak=/);
});

for (const state of ['loading', 'preview', 'error', 'partial']) {
  test(`${state} tasks do not turn absent counts into zero or show an unverified cached streak`, () => {
    const view = render(ledgerOf(state, { taskToday: { state, items: [], counts: null } }), { streak: 8, todayDoneCount: 2 });
    assert.doesNotMatch(view.tasks, /놓침 0|오늘 0|오늘 3개 0\/0|data-streak=/);
    assert.match(view.tasks, new RegExp(`data-truth="${state}"`));
    if (state === 'loading') assert.match(view.tasks, /aria-busy="true"/);
  });
}

test('partial counts with known positive values are qualified and zero is not an all-clear', () => {
  const tasks = { ...emptyTask(), state: 'partial', counts: { missed: 2, today: 0 }, focus: { picked: 2, done: 1 } };
  const view = render(ledgerOf('partial', { signals: [{ tone: 'danger' }], taskToday: tasks }));
  assert.deepEqual(view.counts, ['1', '1', '—']);
  assert.match(view.hero, /일부 확인/); assert.match(view.tasks, /일부 확인/);
  assert.match(view.tasks, /놓침 2/); assert.match(view.tasks, /오늘 —/);
});

test('cached counts are preserved only with visible previous-value qualification', () => {
  const view = render(ledgerOf('live', { briefStale: true, signals: [{ tone: 'warning' }], taskToday: { ...emptyTask(), stale: true } }));
  assert.deepEqual(view.counts, ['1', '0', '1']);
  assert.match(view.hero, /이전 값/); assert.match(view.tasks, /이전 값/);
  assert.match(view.tasks, /놓침 0/); assert.match(view.tasks, /data-streak="0"/);
});

test('a live envelope with a missing source is not a complete zero aggregate', () => {
  const view = render(ledgerOf('live', { sources: [{ state: 'live' }, { state: 'preview' }] }));
  assert.deepEqual(view.counts, ['—', '—', '—']); assert.match(view.hero, /일부 확인/);
});

test('full-read truth is not replaced by a successful independent task slice', () => {
  const view = render(ledgerOf('live', { briefSyncState: 'error' }));
  assert.deepEqual(view.counts, ['—', '—', '—']);
  assert.match(view.tasks, /놓침 0/);
});

// Controlled hook slots exercise the real read/cache transitions. They do not
// model DOM effects or React scheduling; render() above separately checks JSX.
function hooks() {
  const slots = [], effects = [], cleanups = new Map(); let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const runtime = {
    useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i], deps)) { slots[i] = deps; effects.push(() => { cleanups.get(i)?.(); cleanups.set(i, fn()); }); } },
  };
  return { runtime, render(fn) { cursor = 0; const result = fn(); effects.splice(0).forEach(effect => effect()); return result; } };
}
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const fullData = () => ({ status: 'live', sources: [{ state: 'live' }], summary: { urgentCount: 0, todayCount: 0, focusUrgentCount: 0 }, signals: [], taskToday: emptyTask() });
let moduleId = 0;
async function ledgerHarness(t, cached) {
  const brief = await import(`../daily-brief-signals.js?count-truth=${++moduleId}`);
  if (cached) await brief.readDailyBrief({ fetchImpl: async () => reply(cached) });
  const pending = [];
  t.mock.method(globalThis, 'fetch', (url) => new Promise((resolve, reject) => pending.push({ url, resolve, reject })));
  const h = hooks();
  const body = section('const EMPTY_DAILY_BRIEF_STATE =', 'function MetricCard(');
  const deps = { React: h.runtime, ...brief, buildTaskToday: taskModel.buildTaskToday };
  const useLedger = new Function(...Object.keys(deps), `${body}; return useDailyBriefLedger;`)(...Object.values(deps));
  let key = 0;
  return { pending, read: () => h.render(() => useLedger(key)), reload() { key++; return this.read(); } };
}

test('initial loading and failed reads never expose zero; successful retry restores live zero', async t => {
  const h = await ledgerHarness(t);
  assert.equal(h.read().taskToday.state, 'loading');
  h.pending[0].resolve(reply({ status: 'error' })); await settle();
  assert.equal(h.read().taskToday.state, 'error');
  assert.deepEqual(render(h.read()).counts, ['—', '—', '—']);
  h.reload();
  assert.equal(h.read().taskToday.state, 'loading');
  assert.match(render(h.read()).hero, /aria-busy="true"/);
  assert.match(render(h.read()).tasks, /aria-busy="true"/);
  h.pending[1].resolve(reply(fullData())); await settle();
  assert.deepEqual(render(h.read()).counts, ['0', '0', '0']);
  assert.equal(h.read().taskToday.state, 'live');
});

test('served snapshots and failed revalidation are qualified, then fresh success clears the qualification', async t => {
  const h = await ledgerHarness(t, fullData());
  const cached = h.read();
  assert.equal(cached.briefStale, true); assert.equal(cached.taskToday.stale, true);
  assert.match(render(cached).hero, /이전 값/); assert.match(render(cached).tasks, /이전 값/);
  h.pending[0].reject(new Error('synthetic offline')); await settle();
  const failed = h.read();
  assert.equal(failed.taskToday.state, 'partial'); assert.equal(failed.taskToday.stale, true);
  assert.deepEqual(render(failed).counts, ['0', '0', '0']);
  assert.match(render(failed).hero, /이전 값/);
  assert.match(render(failed).tasks, /놓침 0/);
  assert.match(render(failed).tasks, /이전 조회에서 표시할 할 일이 없었습니다/);
  assert.doesNotMatch(render(failed).tasks, /오늘 할 일이 비었습니다/);
  h.reload(); h.pending[1].resolve(reply(fullData())); await settle();
  const fresh = h.read();
  assert.equal(fresh.briefStale, false); assert.equal(fresh.taskToday.stale, undefined);
  assert.deepEqual(render(fresh).counts, ['0', '0', '0']);
  assert.doesNotMatch(render(fresh).hero, /이전 값/);
});

test('a failed older full read does not mark a later successful task slice stale', async t => {
  const h = await ledgerHarness(t, fullData()); h.read();
  const narrow = h.read().refreshTasks();
  h.pending[1].resolve(reply({ status: 'live', tasks: [] })); await narrow;
  h.pending[0].resolve(reply({ status: 'error' })); await settle();
  const latest = h.read();
  assert.equal(latest.taskToday.state, 'live'); assert.equal(latest.taskToday.stale, undefined);
  assert.deepEqual(render(latest).counts, ['0', '0', '0']);
  assert.match(render(latest).hero, /이전 값/);
  assert.match(render(latest).tasks, /놓침 0/);
});

test('failed narrow reread qualifies prior values and a later success restores verified zero', async t => {
  const h = await ledgerHarness(t, fullData()); h.read();
  h.pending[0].resolve(reply(fullData())); await settle();
  const failed = h.read().refreshTasks(); h.pending[1].resolve(reply({ status: 'error' })); await failed;
  assert.equal(h.read().taskToday.stale, true); assert.equal(h.read().taskToday.state, 'partial');
  assert.match(render(h.read()).tasks, /이전 값/); assert.match(render(h.read()).tasks, /놓침 0/);
  const recovered = h.read().refreshTasks(); h.pending[2].resolve(reply({ status: 'live', tasks: [] })); await recovered;
  assert.equal(h.read().taskToday.stale, undefined); assert.equal(h.read().taskToday.state, 'live');
  assert.match(render(h.read()).tasks, /놓침 0/);
});

test('an incomplete cached snapshot preserves positive counts without promoting unknown zero or streak', async t => {
  const data = { ...fullData(), status: 'partial', signals: [{ tone: 'danger' }], summary: { urgentCount: 1, todayCount: 0, focusUrgentCount: 0 },
    taskToday: { ...emptyTask(), state: 'partial', counts: { missed: 2, today: 0 } } };
  const h = await ledgerHarness(t, data); h.read();
  h.pending[0].resolve(reply({ status: 'error' })); await settle();
  const view = render(h.read());
  assert.deepEqual(view.counts, ['1', '1', '—']);
  assert.match(view.tasks, /이전 값/); assert.match(view.tasks, /놓침 2/); assert.match(view.tasks, /오늘 —/);
  assert.doesNotMatch(view.tasks, /data-streak=/);
});

test('retrying the task slice without a previous snapshot reports pending, then a real live zero', async t => {
  const h = await ledgerHarness(t); h.read();
  h.pending[0].resolve(reply({ status: 'error' })); await settle();
  const pending = h.read().refreshTasks();
  assert.equal(h.read().taskToday.state, 'loading');
  assert.match(render(h.read()).tasks, /aria-busy="true"/);
  assert.deepEqual(render(h.read()).counts, ['—', '—', '—']);
  h.pending[1].resolve(reply({ status: 'live', tasks: [] })); await pending;
  assert.equal(h.read().taskToday.state, 'live');
  assert.match(render(h.read()).tasks, /놓침 0/);
  assert.deepEqual(render(h.read()).counts, ['—', '—', '—']);
});

test('an unsuccessful task retry is not mistaken for a previously observed brief snapshot', async t => {
  const h = await ledgerHarness(t); h.read();
  h.pending[0].resolve(reply({ status: 'error' })); await settle();
  const narrow = h.read().refreshTasks();
  h.pending[1].resolve(reply({ status: 'error' })); await narrow;
  h.reload();
  assert.match(render(h.read()).hero, /aria-busy="true"/);
  h.pending[2].resolve(reply({ status: 'error' })); await settle();
  assert.equal(h.read().briefSyncState, 'error');
  assert.equal(h.read().briefStale, false);
  assert.deepEqual(render(h.read()).counts, ['—', '—', '—']);
  assert.doesNotMatch(render(h.read()).hero, /이전 값/);
});
