import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';
import ts from 'typescript';
import { createQuickCaptureSession, shouldSubmitQuickTask, submitQuickCapture } from '../../lib/quick-task-capture.js';
import { PROJECT_VIEW_OPTIONS } from './pages/project-view-constants.js';

const originalFetch = globalThis.fetch;
const unexpectedNetwork = [];
globalThis.fetch = async url => { unexpectedNetwork.push(String(url)); throw Error('External fetch is disabled'); };
after(() => { globalThis.fetch = originalFetch; assert.deepEqual(unexpectedNetwork, []); });

function compile(file, names) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile('component.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const selected = ast.statements.filter(node => names.includes(node.name?.text)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name?.text))));
  assert.equal(selected.length, names.length);
  return ts.transpileModule(selected.map(node => node.getText(ast).replace(/^export /, '')).join('\n'), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function hooks() {
  const cells = []; let cursor = 0, queued = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState(initial) {
      const cell = cells[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next; }];
    },
    useRef(initial) { return cells[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!cells[i] || deps.some((value, index) => !Object.is(value, cells[i].deps[index]))) cells[i] = { deps, fn };
      return cells[i].fn;
    },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect(effect, deps) {
      const i = cursor++;
      if (!cells[i] || deps.some((value, index) => !Object.is(value, cells[i].deps[index]))) queued.push(() => {
        cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: effect() };
      });
    },
  };
  return { React, render(fn) { cursor = 0; const result = fn(); queued.splice(0).forEach(effect => effect()); return result; },
    cleanup() { for (const cell of cells) cell?.cleanup?.(); } };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  return predicate(node) ? node : (node.props?.children || []).map(child => find(child, predicate)).find(Boolean);
}
const tick = () => new Promise(resolve => setImmediate(resolve));

const quickCode = compile(process.env.QUICK_CAPTURE_EVENT_SOURCE || new URL('./quick-capture.jsx', import.meta.url), ['HINTS', 'QuickCaptureForm', 'GlobalQuickCapture']);

test('a confirmed inbox capture opens the registered project memo workspace after closing its drawer', () => {
  const runtime = hooks(), visits = [], session = createQuickCaptureSession({ createId: () => 'local-receipt' });
  session.setHint('inbox'); session.setRaw('받은함에서 이어 볼 입력'); session.begin();
  session.settle({ ok: true, data: { status: 'saved', destinationType: 'work_order' } });
  const scope = { React: runtime.React, createQuickCaptureSession, shouldSubmitQuickTask, submitQuickCapture, createClientId: () => 'unused',
    Button: 'Button', Card: 'Card', Kbd: 'Kbd', TruthBadge: 'TruthBadge', Iconed: 'Iconed', requestAnimationFrame: () => 0, cancelAnimationFrame() {} };
  const Form = new Function(...Object.keys(scope), `${quickCode}; return QuickCaptureForm;`)(...Object.values(scope));
  try {
    const tree = runtime.render(() => Form({ session, onDone: () => visits.push('closed'), onNavigate: path => visits.push(path) }));
    find(tree, node => node.type === 'Button' && node.props.children.includes('보관함 보기')).props.onClick();
    assert.deepEqual(visits, ['closed', 'dashboard/work/projects?view=memos']);
    const url = new URL(visits[1], 'https://local.invalid/');
    assert.ok(PROJECT_VIEW_OPTIONS.some(option => option.key === url.searchParams.get('view')), 'the destination view is registered');
  } finally { runtime.cleanup(); }
});

for (const [label, data, eventCount, callbackCount] of [
  ['saved task', { status: 'saved', destinationType: 'task' }, 1, 1],
  ['duplicate task', { status: 'duplicate', destinationType: 'task' }, 1, 1],
  ['saved inbox', { status: 'saved', destinationType: 'work_order' }, 0, 1],
  ['preview', { status: 'preview' }, 0, 0],
  ['error envelope', { status: 'error' }, 0, 0],
  ['missing receipt status', { destinationType: 'task' }, 0, 0],
  ['missing destination', { status: 'saved' }, 0, 1],
  ['lost reply', null, 0, 0],
]) test(`actual global capture and form publish task refresh only for ${label}`, async () => {
  const popupHooks = hooks(), formHooks = hooks(), window = new EventTarget();
  let events = 0, parentCalls = 0, sharedCalls = 0, sequence = 0;
  const calls = [];
  window.addEventListener('moonlight:tasks-saved', () => events++);
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (data === null) throw new TypeError('Synthetic lost reply');
    return new Response(JSON.stringify(data));
  };
  const scope = {
    React: popupHooks.React, window, createQuickCaptureSession, createClientId: () => `synthetic-${++sequence}`,
    shouldSubmitQuickTask, submitQuickCapture: session => submitQuickCapture(session, { fetchImpl }),
    Drawer: 'Drawer', Card: 'Card', Button: 'Button', Iconed: 'Iconed', Kbd: 'Kbd', TruthBadge: 'TruthBadge',
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  const create = React => new Function(...Object.keys(scope), `${quickCode}\nreturn { GlobalQuickCapture, QuickCaptureForm };`)(...Object.values({ ...scope, React }));
  const Popup = create(popupHooks.React).GlobalQuickCapture;
  const Form = create(formHooks.React).QuickCaptureForm;
  const props = { openRequest: 1, initialRaw: '저장할 입력', onSaved: () => parentCalls++, onSharedDraftSaved: () => sharedCalls++ };
  popupHooks.render(() => Popup(props));
  const tree = popupHooks.render(() => Popup(props));
  const formProps = tree.props.children[0].props;
  const form = formHooks.render(() => Form(formProps));
  const submit = find(form, node => node.type === 'form').props.onSubmit;
  try {
    const first = submit({ preventDefault() {} });
    const duplicateTap = submit({ preventDefault() {} });
    await Promise.all([first, duplicateTap]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/hub/inbox');
    assert.equal(events, eventCount);
    assert.equal(parentCalls, callbackCount, 'Form → Global → parent fires once');
    assert.equal(sharedCalls, callbackCount, 'shared draft acknowledgement stays chained once');
    if (!callbackCount) assert.equal(formProps.session.snapshot().raw, '저장할 입력');
  } finally { formHooks.cleanup(); popupHooks.cleanup(); }
});

test('MyWork refreshes on the shared task event, ignores older replies and removes its subscription on unmount', async () => {
  const code = compile(process.env.MY_WORK_EVENT_SOURCE || new URL('./pages/my-work.jsx', import.meta.url), ['ATTENTION_CACHE_SERVABLE_MS', 'attentionLedgerCache', 'useAttentionLedger']);
  const runtime = hooks(), window = new EventTarget(), requests = [];
  const fetchImpl = (url, init) => new Promise(resolve => requests.push({ url, init, resolve: items => resolve(new Response(JSON.stringify({ status: 'live', items, sources: { tasks: 'live' } }))) }));
  const read = new Function('React', 'window', 'fetch', `${code}\nreturn useAttentionLedger;`)(runtime.React, window, fetchImpl);
  const render = () => runtime.render(read);
  try {
    render(); assert.equal(requests.length, 1);
    requests[0].resolve([{ id: 'initial' }]); await tick(); render();
    window.dispatchEvent(new Event('moonlight:tasks-saved'));
    window.dispatchEvent(new Event('moonlight:tasks-saved'));
    assert.equal(requests.length, 3, 'one read per notification, with no render-driven loop');
    requests[2].resolve([{ id: 'latest' }]); await tick();
    requests[1].resolve([{ id: 'older' }]); await tick();
    assert.deepEqual(render().items, [{ id: 'latest' }]);
    assert.equal(requests.length, 3);
    runtime.cleanup();
    window.dispatchEvent(new Event('moonlight:tasks-saved'));
    assert.equal(requests.length, 3, 'unmounted MyWork does not subscribe');
    assert.ok(requests.every(request => request.url === '/api/hub/attention'));
  } finally {
    runtime.cleanup();
    for (const request of requests) request.resolve([]);
    await tick();
  }
});
