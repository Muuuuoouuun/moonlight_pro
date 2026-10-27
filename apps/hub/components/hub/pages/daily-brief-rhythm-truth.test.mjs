import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as rhythm from '../../../lib/rhythm-ui.js';

// Run the production panel with controlled read boundaries and hook slots.
// This verifies rendered values/actions, not browser layout or React scheduling.
const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('daily-brief.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const panel = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'RhythmPanel');
assert.ok(panel);
const code = ts.transpileModule(panel.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const emptyRead = (state = 'live-empty', overrides = {}) => ({
  status: state === 'partial' || state === 'error' ? 'partial' : state === 'preview' ? 'preview' : 'live',
  source: state === 'preview' ? 'preview' : 'supabase',
  rhythm: { state, partial: state === 'partial', truncatedSources: [] },
  rituals: [],
  summary: { ritualsCompletedThisWeek: 0, ritualsTotalThisWeek: 0, longestStreak: 0 },
  ...overrides,
});
function harness(responses) {
  const slots = [], effects = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { callback, deps };
      return slots[i].callback;
    },
    useMemo: callback => callback(),
    useEffect(effect, deps) {
      const i = cursor++;
      if (!same(slots[i], deps)) { slots[i] = deps; effects.push(effect); }
    },
  };
  const calls = [];
  const deps = { React, ...rhythm, streakLevel: () => 0, fetch: async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response, 'every read must have a supplied response');
    return response;
  } };
  for (const name of new Set([...code.matchAll(/React\.createElement\(([A-Z]\w*)/g)].map(match => match[1]))) if (name !== 'React') deps[name] = name;
  const RhythmPanel = new Function(...Object.keys(deps), `${code}\nreturn RhythmPanel;`)(...Object.values(deps));
  return { calls, render() {
    cursor = 0;
    const tree = RhythmPanel({ onNavigate() {} });
    effects.splice(0).forEach(effect => effect());
    return tree;
  } };
}
function nodes(node, type) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type), ...nodes(node.props?.right, type)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (!node || typeof node !== 'object') return node == null ? '' : String(node);
  return text(node.props?.children);
}
const truth = tree => nodes(tree, 'TruthBadge')[0].props.state;

test('pending routine read uses Skeleton instead of an empty-state message', async () => {
  let release;
  const app = harness([new Promise(resolve => { release = resolve; })]);
  const tree = app.render();
  release(reply(emptyRead()));
  await tick();
  assert.equal(nodes(tree, 'Skeleton').length, 1);
  assert.equal(nodes(tree, 'EmptyState').length, 0);
});

test('a failed rhythm source in HTTP 200 partial remains error and can retry to confirmed empty', async () => {
  const app = harness([reply(emptyRead('error')), reply(emptyRead())]);
  app.render(); await tick();
  const failed = app.render();
  assert.equal(truth(failed), 'error');
  const empty = nodes(failed, 'EmptyState')[0];
  assert.equal(empty.props.title, '루틴을 읽지 못했습니다');
  assert.doesNotMatch(text(failed), /등록된 루틴 없음/);
  const retry = empty.props.action;
  assert.equal(text(retry), '다시 읽기');
  await retry.props.onClick();
  const recovered = app.render();
  assert.equal(truth(recovered), 'live');
  assert.equal(nodes(recovered, 'EmptyState')[0].props.title, '등록된 루틴 없음');
  assert.equal(app.calls.length, 2);
});

test('incomplete empty rhythm does not claim that no routines exist', async () => {
  const app = harness([reply(emptyRead('partial'))]);
  app.render(); await tick();
  const tree = app.render();
  assert.equal(truth(tree), 'partial');
  const empty = nodes(tree, 'EmptyState')[0];
  assert.equal(empty.props.title, '루틴을 모두 확인하지 못했습니다');
  assert.ok(empty.props.action);
});

for (const [label, response] of [
  ['HTTP failure', reply(emptyRead(), 503)],
  ['error envelope', reply({ status: 'error', source: 'error' })],
  ['error source', reply(emptyRead('live-empty', { source: 'error' }))],
  ['invalid JSON', { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }],
  ['missing rhythm envelope', reply({ status: 'live', source: 'supabase', rituals: [] })],
  ['network failure', new Error('isolated offline')],
]) test(`${label} does not become preview or confirmed empty`, async () => {
  const app = harness([response]); app.render(); await tick();
  const tree = app.render();
  assert.equal(truth(tree), 'error');
  assert.equal(nodes(tree, 'EmptyState')[0].props.title, '루틴을 읽지 못했습니다');
  assert.equal(nodes(tree, 'Button').find(button => text(button).includes('Council')).props.disabled, true);
});

test('explicit preview remains disconnected rather than error or empty', async () => {
  const app = harness([reply(emptyRead('preview'))]); app.render(); await tick();
  const tree = app.render();
  assert.equal(truth(tree), 'preview');
  assert.equal(nodes(tree, 'EmptyState')[0].props.title, '루틴 확인 대기');
});

for (const state of ['live', 'partial']) test(`${state} renders only observed rhythm values with its own source truth`, async () => {
  const app = harness([reply(emptyRead(state, {
    status: 'partial', // An unrelated decisions read must not degrade a complete rhythm slice.
    rituals: [{ id: 'observed-routine', name: '확인된 루틴', checkType: 'weekly', weeks: [1], streak: 1 }],
    summary: { ritualsCompletedThisWeek: 1, ritualsTotalThisWeek: 1, longestStreak: 1, longestStreakRitual: '확인된 루틴' },
  }))]);
  app.render(); await tick();
  const tree = app.render();
  assert.equal(truth(tree), state);
  assert.match(text(tree), /1\/1/);
  assert.match(text(tree), /확인된 루틴/);
  assert.doesNotMatch(text(tree), /이번 주 업로드|일평균 몰입|3\.2h/);
  if (state === 'partial') {
    assert.match(text(tree), /일부 기록만 확인/);
    assert.doesNotMatch(text(tree), /완벽 달성/);
    assert.equal(nodes(tree, 'ProgressRing').length, 0);
    assert.equal(nodes(tree, 'Progress').length, 0);
    assert.match(nodes(tree, 'div').find(node => node.props.role === 'status').props['aria-label'], /일부 기록/);
  }
  nodes(tree, 'Button').find(button => text(button).includes('Council')).props.onClick();
  const review = nodes(app.render(), 'FloatingMentorWidget')[0];
  assert.match(review.props.contextData.summary, /1\/1/);
  if (state === 'partial') assert.match(review.props.contextData.summary, /일부 기록만 확인됨/);
});

test('read failure after a saved check-in hides the previous values until retry succeeds', async () => {
  const app = harness([
    reply(emptyRead('live', {
      rituals: [{ id: 'observed-routine', ritualKey: 'observed-routine', name: '확인된 루틴', checkType: 'weekly', weeks: [0], streak: 0 }],
      summary: { ritualsCompletedThisWeek: 0, ritualsTotalThisWeek: 1, longestStreak: 0 },
    })),
    reply({ status: 'saved' }), reply(emptyRead('error')), reply(emptyRead()),
  ]);
  app.render(); await tick();
  const before = app.render();
  assert.match(text(before), /0\/1/);
  await nodes(before, 'Button').find(button => text(button) === '체크인').props.onClick();
  const failed = app.render();
  assert.equal(truth(failed), 'error');
  assert.doesNotMatch(text(failed), /0\/1|확인된 루틴/);
  assert.equal(nodes(failed, 'Button').find(button => text(button).includes('Council')).props.disabled, true);
  await nodes(failed, 'EmptyState')[0].props.action.props.onClick();
  assert.equal(truth(app.render()), 'live');
  assert.deepEqual(app.calls.map(call => [call.url, call.options.method || 'GET']), [
    ['/api/hub/work', 'GET'], ['/api/routine/check', 'POST'], ['/api/hub/work', 'GET'], ['/api/hub/work', 'GET'],
  ]);
});
