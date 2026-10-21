import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after, afterEach } from 'node:test';
import ts from 'typescript';
import * as capture from '../../lib/memo-capture.js';
import * as draftStore from '../../lib/quick-memo.js';
import * as memoSave from '../../lib/memo-save.js';
import * as advice from '../../lib/ai-workflow-client.js';
import { requestPersonaChat } from './persona-client.js';

const source = readFileSync(process.env.QUICK_MEMO_TASK_SOURCE || new URL('./quick-memo.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('quick-memo.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'QuickMemo');
const compiled = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const mounted = [];
const unexpectedNetwork = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => { unexpectedNetwork.push(String(url)); throw Error('External fetch is disabled'); };
after(() => { globalThis.fetch = originalFetch; });
afterEach(async () => {
  for (const app of mounted.splice(0)) {
    await app.cleanup();
    assert.deepEqual(app.unexpected, [], 'HTTP assertions stay outside application catch blocks');
  }
  assert.deepEqual(unexpectedNetwork, []);
});

// Run the actual component/handlers and real persona, memo and task clients.
// Browser scheduling/storage and HTTP are synthetic; no browser or server is contacted.
function mount({ deferAdvice = false } = {}) {
  const cells = [], pending = [], requests = [], posts = [], unexpected = [], events = [], journalWrites = [];
  let cursor = 0, effects = [], tree, unmounted = false, lateWrites = 0;
  let props = { draftContext: 'synthetic-owner', route: '/dashboard/work/my' };
  const window = new EventTarget();
  window.addEventListener('moonlight:tasks-saved', () => events.push('tasks-saved'));
  const document = new EventTarget();
  document.documentElement = new EventTarget();
  document.activeElement = null;
  const storage = new Map();
  const sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const React = {
    createElement: (type, attributes, ...children) => ({ type, props: { ...attributes, children: children.flat(Infinity).filter(value => value !== false && value != null) } }),
    useState(initial) {
      const cell = cells[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, next => { if (unmounted) lateWrites++; cell.value = typeof next === 'function' ? next(cell.value) : next; }];
    },
    useRef(initial) { return cells[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!cells[index] || !equalDeps(cells[index].deps, deps)) cells[index] = { fn, deps };
      return cells[index].fn;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!cells[index] || !equalDeps(cells[index].deps, deps)) effects.push({ index, effect, deps });
    },
  };
  const fetchImpl = (url, init) => {
    if (url === '/api/hub/journal' && init.method === 'POST') {
      const command = JSON.parse(init.body);
      journalWrites.push(command);
      return Promise.resolve(response({ status: 'saved', entry: { id: command.entryId } }));
    }
    if (url.startsWith('/api/hub/journal?note=')) {
      const command = journalWrites.find(item => item.entryId === new URL(url, 'http://synthetic.invalid').searchParams.get('note'));
      return Promise.resolve(response({ status: 'live', entry: { id: command?.entryId, body: command?.body, noteMeta: command?.noteMeta } }));
    }
    if (!['/api/hub/persona-chat', '/api/hub/tasks'].includes(url)) {
      unexpected.push(url);
      return Promise.reject(Error('Unexpected synthetic HTTP path'));
    }
    const collection = url === '/api/hub/tasks' ? posts : requests;
    return new Promise((resolve, reject) => {
      const request = { body: JSON.parse(init.body), signal: init.signal, settled: false,
        resolve(data, status) { request.settled = true; resolve(response(data, status)); },
        reject() { request.settled = true; reject(new TypeError('Synthetic lost response')); } };
      collection.push(request);
    });
  };
  let releaseAdvice;
  const adviceGate = new Promise(resolve => { releaseAdvice = resolve; });
  let gated = false;
  const scope = {
    React, ...capture, ...draftStore, ...memoSave, fetch: fetchImpl, window, document, sessionStorage,
    loadPersonaClient: async () => ({ requestPersonaChat: (input, options) => requestPersonaChat(input, { ...options, fetchImpl }) }),
    loadAdviceClient: () => deferAdvice && gated ? adviceGate : Promise.resolve(advice),
    Button: 'Button', Iconed: 'Iconed', styles: {}, FOCUSABLE: '',
    useKeyboardInset() {}, pushEscLayer: () => ({}), popEscLayer() {}, isTopEscLayer: () => true,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    notifyContentLedgerChanged() {}, contentIdeaHref: () => '',
    prepareMemoIdea() { throw Error('Content path is outside this test'); },
    saveMemoAsIdeaAndVerify() { throw Error('Content path is outside this test'); },
  };
  const Component = new Function(...Object.keys(scope), `${compiled}\nreturn QuickMemo;`)(...Object.values(scope));
  function render(next = {}) {
    props = { ...props, ...next };
    cursor = 0; effects = [];
    tree = Component({ ...props, fetchImpl });
    const queued = effects; effects = [];
    for (const { index, effect, deps } of queued) {
      cells[index]?.cleanup?.();
      cells[index] = { deps, cleanup: effect() };
    }
    return tree;
  }
  function nodes(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => nodes(predicate, child))];
  }
  function invoke(handler) { const result = handler(); if (result?.then) pending.push(result); return result; }
  function button(label) {
    const node = nodes(node => node.type === 'Button' && node.props.children.includes(label))[0];
    assert.ok(node, `button: ${label}`); return node;
  }
  function unmount() {
    if (unmounted) return;
    unmounted = true;
    for (const cell of cells) cell?.cleanup?.();
  }
  const app = { render, nodes, button, posts, requests, events, unexpected, invoke, unmount, journalWrites,
    click: label => invoke(button(label).props.onClick),
    edit(body) { nodes(node => node.type === 'textarea')[0].props.onChange({ target: { value: body } }); render(); },
    gateAdvice() { gated = true; }, releaseAdvice() { releaseAdvice(advice); },
    get lateWrites() { return lateWrites; },
    async cleanup() {
      unmount(); releaseAdvice(advice); await tick();
      for (const request of [...requests, ...posts]) if (!request.settled) request.reject();
      await Promise.allSettled(pending); await tick();
    },
  };
  mounted.push(app);
  render(); render();
  nodes(node => node.type === 'button' && node.props['aria-label']?.startsWith('빠른 메모'))[0].props.onClick();
  render(); app.edit('원문에서 다음 행동을 정리합니다.');
  return app;
}
async function extract(app, title = '확인할 행동') {
  const promise = app.click('✨ AI 액션 추출');
  await tick();
  app.requests.at(-1).resolve({ status: 'generated', text: `🎯 ${title}` });
  await promise; app.render();
}
const addButtons = app => app.nodes(node => node.type === 'Button' && node.props.children.includes('+ 할 일 등록'));

test('confirmed QuickMemo task emits one task event; duplicate taps and retired callbacks cannot create another task', async () => {
  const app = mount(); await extract(app);
  const add = app.button('+ 할 일 등록').props.onClick;
  const first = app.invoke(add), second = app.invoke(add); await tick();
  const post = app.posts[0]; post.resolve({ status: 'saved', task: { id: post.body.id } });
  await Promise.all([first, second]); app.render();
  await app.invoke(add);
  assert.equal(app.posts.length, 1);
  assert.equal(app.button('✓ 등록됨').props.disabled, true);
  assert.deepEqual(app.events, ['tasks-saved']);
});

test('editing during task POST keeps an unknown row and retries the identical command after re-extraction', async () => {
  const app = mount(); await extract(app);
  const first = app.click('+ 할 일 등록'); await tick();
  const sent = app.posts[0].body;
  app.edit('다른 원문으로 바꿨습니다.');
  app.posts[0].reject(); await first; app.render();
  assert.equal(addButtons(app).length, 1, 'the sent command remains reachable after source replacement');
  assert.deepEqual(app.events, []);
  await extract(app, '새 원문 후보');
  assert.equal(addButtons(app).length, 2);
  const retry = app.invoke(addButtons(app)[0].props.onClick); await tick();
  app.posts[1].resolve({ status: 'duplicate', task: { id: sent.id } });
  await retry; app.render();
  assert.deepEqual(app.posts[1].body, sent);
  assert.deepEqual(app.events, ['tasks-saved']);
});

test('a late saved task updates its original row after the body is cleared', async () => {
  const app = mount(); await extract(app);
  const first = app.click('+ 할 일 등록'); await tick();
  app.edit('');
  const post = app.posts[0]; post.resolve({ status: 'saved', task: { id: post.body.id } });
  await first; app.render();
  assert.equal(app.button('✓ 등록됨').props.disabled, true);
  assert.deepEqual(app.events, ['tasks-saved']);
});

test('saving the memo keeps its unresolved task command available when the empty quick memo reopens', async () => {
  const app = mount(); await extract(app);
  const first = app.click('+ 할 일 등록'); await tick();
  const sent = app.posts[0].body;
  app.posts[0].reject(); await first; app.render();
  await app.invoke(() => app.nodes(node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} }));
  app.render();
  assert.equal(app.journalWrites.length, 1);
  app.nodes(node => node.type === 'button' && node.props['aria-label']?.startsWith('빠른 메모'))[0].props.onClick();
  app.render();
  assert.equal(app.nodes(node => node.type === 'textarea')[0].props.value, '');
  const retry = app.click('+ 할 일 등록'); await tick();
  app.posts[1].resolve({ status: 'duplicate', task: { id: sent.id } });
  await retry;
  assert.deepEqual(app.posts[1].body, sent);
  assert.deepEqual(app.events, ['tasks-saved']);
});

for (const delayedImport of [false, true]) test(`an unsubmitted retired candidate cannot POST after source editing (delayed import: ${delayedImport})`, async () => {
  const app = mount({ deferAdvice: delayedImport }); await extract(app);
  const stale = app.button('+ 할 일 등록').props.onClick;
  if (delayedImport) app.gateAdvice();
  const pending = delayedImport ? app.invoke(stale) : null;
  app.edit('이제 다른 원문입니다.');
  const afterEdit = delayedImport ? pending : app.invoke(stale);
  app.releaseAdvice(); await tick();
  for (const post of app.posts) post.resolve({ status: 'saved', task: { id: post.body.id } });
  await afterEdit;
  assert.equal(app.posts.length, 0, 'no command had been sent before source replacement');
  assert.deepEqual(app.events, []);
});

test('unmount does not cancel a sent task or publish a late saved event', async () => {
  const app = mount(); await extract(app);
  const first = app.click('+ 할 일 등록'); await tick();
  app.unmount();
  const post = app.posts[0]; post.resolve({ status: 'saved', task: { id: post.body.id } });
  await first;
  assert.equal(post.signal, undefined);
  assert.equal(app.lateWrites, 0);
  assert.deepEqual(app.events, []);
});

test('unmount during the client import prevents the first task POST', async () => {
  const app = mount({ deferAdvice: true }); await extract(app);
  app.gateAdvice();
  const first = app.click('+ 할 일 등록');
  app.unmount(); app.releaseAdvice(); await tick();
  for (const post of app.posts) post.resolve({ status: 'saved', task: { id: post.body.id } });
  await first;
  assert.equal(app.posts.length, 0);
  assert.equal(app.lateWrites, 0);
});

for (const saved of [true, false]) test(`a context reset rejects the previous task settlement (saved: ${saved})`, async () => {
  const app = mount(); await extract(app);
  const first = app.click('+ 할 일 등록'); await tick();
  app.render({ draftContext: 'replacement-owner' }); app.render();
  const post = app.posts[0];
  if (saved) post.resolve({ status: 'saved', task: { id: post.body.id } });
  else post.reject();
  await first; app.render();
  assert.equal(addButtons(app).length, 0);
  assert.equal(app.nodes(node => node.props?.role === 'alert').length, 0);
  assert.deepEqual(app.events, []);
  assert.equal(post.signal, undefined, 'context cleanup cannot cancel an already dispatched task');
});

test('a malformed task acknowledgement emits no event and retains the same retry identity', async () => {
  const app = mount(); await extract(app);
  const first = app.click('+ 할 일 등록'); await tick();
  app.posts[0].resolve({ status: 'saved', task: { id: 'wrong-id' } });
  await first; app.render();
  assert.deepEqual(app.events, []);
  const retry = app.click('+ 할 일 등록'); await tick();
  app.posts[1].resolve({ status: 'duplicate', task: { id: app.posts[1].body.id } });
  await retry;
  assert.deepEqual(app.posts[1].body, app.posts[0].body);
  assert.deepEqual(app.events, ['tasks-saved']);
});
