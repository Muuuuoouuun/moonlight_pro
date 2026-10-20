import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { afterEach } from 'node:test';
import ts from 'typescript';
import { requestPersonaChat } from '../persona-client.js';
import { freezeTaskCommand, saveTaskCommand, TASK_OUTCOME } from '../../../lib/memo-intake-tasks.js';

const source = readFileSync(new URL('./memo-composer.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('memo-composer.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const names = ['freezeMemoAction', 'registerMemoAction', 'parseExtractedActions', 'MemoActionExtractor'];
const declarations = names.map(name => {
  const declaration = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(ast).replace(/^export /, '');
});
const code = ts.transpileModule(declarations.join('\n'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const TEXT_A = '첫 메모 원문에서 다음 할 일을 확인합니다.';
const TEXT_B = '바뀐 메모 원문에서 다른 할 일을 확인합니다.';
const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';
const contexts = id => [{ type: 'project', id }];
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const settle = async pending => { await pending; await new Promise(resolve => setImmediate(resolve)); };
const mountedApps = [];
afterEach(async () => {
  const apps = mountedApps.splice(0);
  for (const app of apps) await app.cleanup();
  assert.deepEqual(apps.flatMap(app => app.unexpectedRequests), [], 'HTTP path assertions remain outside application catch blocks');
});

// Execute the real JSX handlers/effect cleanup and the real persona/task clients.
// Only React scheduling/primitives and HTTP responses are controlled; no network
// or source-pattern assertions stand in for ownership/receipt behavior.
function mount(props = {}) {
  const cells = [], requests = [], posts = [], toasts = [], unexpectedRequests = [];
  let cursor = 0, effects = [], tree, unmounted = false, writesAfterUnmount = 0;
  let currentProps = { text: TEXT_A, contexts: contexts(PROJECT_A), ...props };
  const React = {
    createElement: (type, attributes, ...children) => ({ type, props: {
      ...attributes, children: children.flat(Infinity).filter(child => child !== false && child != null),
    } }),
    useState(initial) {
      const cell = cells[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, update => {
        if (unmounted) writesAfterUnmount++;
        cell.value = typeof update === 'function' ? update(cell.value) : update;
      }];
    },
    useRef(initial) { return cells[cursor++] ??= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!cells[index] || !equalDeps(cells[index].deps, deps)) effects.push({ index, effect, deps });
    },
  };
  const fetchImpl = (url, init) => {
    if (!['/api/hub/persona-chat', '/api/hub/tasks'].includes(url)) {
      unexpectedRequests.push(url);
      return Promise.reject(new Error(`unexpected HTTP path: ${url}`));
    }
    const collection = url === '/api/hub/persona-chat' ? requests : posts;
    return new Promise((resolve, reject) => {
      const request = { body: JSON.parse(init.body), signal: init.signal, settled: false,
        resolve(data, status) { request.settled = true; resolve(response(data, status)); },
        reject(error) { request.settled = true; reject(error); } };
      collection.push(request);
    });
  };
  const dependencies = {
    React, freezeTaskCommand, saveTaskCommand, TASK_OUTCOME, fetch: fetchImpl,
    requestPersonaChat: (input, options) => requestPersonaChat(input, { ...options, fetchImpl }),
    useToast: () => ({ success: message => toasts.push(message) }),
    Button: 'Button', Iconed: 'Iconed', Skeleton: 'Skeleton', TruthBadge: 'TruthBadge',
  };
  const Component = new Function(...Object.keys(dependencies), `${code}\nreturn MemoActionExtractor;`)(...Object.values(dependencies));
  function flushEffects() {
    const pending = effects;
    effects = [];
    for (const { index, effect, deps } of pending) {
      cells[index]?.cleanup?.();
      cells[index] = { deps, cleanup: effect() };
    }
  }
  function render(next = {}, { commitEffects = true } = {}) {
    currentProps = { ...currentProps, ...next };
    cursor = 0;
    effects = [];
    tree = Component(currentProps);
    if (commitEffects) flushEffects();
    return tree;
  }
  function nodes(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => nodes(predicate, child))];
  }
  const button = label => {
    const result = nodes(node => node.type === 'Button' && node.props.children.includes(label))[0];
    assert.ok(result, `button: ${label}`);
    return result;
  };
  const click = label => button(label).props.onClick();
  function unmount() {
    unmounted = true;
    for (const cell of cells) cell?.cleanup?.();
  }
  render();
  const app = { render, flushEffects, nodes, button, click, unmount, requests, posts, toasts, unexpectedRequests,
    async cleanup() {
      unmount();
      for (const request of [...requests, ...posts]) {
        if (!request.settled) request.reject(new DOMException('Test cleanup', 'AbortError'));
      }
      await settle();
    },
    get writesAfterUnmount() { return writesAfterUnmount; } };
  mountedApps.push(app);
  return app;
}

async function extract(app, task = '첫 후보 실행하기') {
  const pending = app.click('AI 액션 추출');
  app.requests.at(-1).resolve({ status: 'generated', text: `- ${task}` });
  await settle(pending);
  app.render();
}
function taskButtons(app) { return app.nodes(node => node.type === 'Button' && node.props.icon === 'plus'); }

test('ordinary extraction reopens without another AI request and freezes the current project once', async () => {
  const app = mount();
  await extract(app);
  app.click('접기'); app.render();
  app.click('추출한 액션 보기'); app.render();
  assert.equal(app.requests.length, 1);
  app.render({ contexts: contexts(PROJECT_B) });
  const add = app.button('할 일 등록');
  const first = add.props.onClick();
  const second = add.props.onClick(); // Same-frame second click sees the synchronous sending owner.
  for (const post of app.posts) post.resolve({ status: 'saved', task: { id: post.body.id } });
  await Promise.all([first, second]); app.render();
  assert.equal(app.posts.length, 1);
  assert.equal(app.posts[0].body.projectId, PROJECT_B, 'context-only changes retain first-freeze semantics');
  assert.equal(app.button('등록됨').props.disabled, true);
  assert.equal(app.toasts.length, 1);
});

test('A → B aborts extraction and ignores a successful old response even when fetch ignores abort', async () => {
  const app = mount();
  const pending = app.click('AI 액션 추출');
  app.render({ text: TEXT_B });
  assert.equal(app.requests[0].signal?.aborted, true, 'the AI request carries an aborted signal');
  app.requests[0].resolve({ status: 'generated', text: '- 지난 원문 후보' });
  await settle(pending); app.render();
  assert.equal(taskButtons(app).length, 0);
  assert.equal(app.toasts.length, 0);
});

test('A → B → A does not revive an earlier in-flight request or completed candidate', async () => {
  const app = mount();
  const pending = app.click('AI 액션 추출');
  app.render({ text: TEXT_B });
  app.render({ text: TEXT_A });
  app.requests[0].resolve({ status: 'generated', text: '- 폐기된 A 후보' });
  await settle(pending); app.render();
  assert.equal(taskButtons(app).length, 0);
  app.click('접기'); app.render();
  await extract(app);
  const oldAdd = app.button('할 일 등록');
  app.render({ text: TEXT_B }); app.render({ text: TEXT_A });
  assert.equal(taskButtons(app).length, 0, 'old pending candidates are hidden, not revived');
  const staleWrite = oldAdd.props.onClick();
  for (const post of app.posts) post.resolve({ status: 'saved', task: { id: post.body.id } });
  await staleWrite;
  assert.equal(app.posts.length, 0);
  app.click('접기'); app.render();
  const fresh = app.click('AI 액션 추출');
  assert.equal(app.requests.length, 3, 'returning to A requires a fresh extraction owner');
  app.requests[2].resolve({ status: 'generated', text: '- 새 A 후보' });
  await settle(fresh);
});

test('an old open candidate cannot first-register after B renders, even before effect cleanup', async () => {
  const app = mount();
  await extract(app);
  const oldAdd = app.button('할 일 등록');
  app.render({ text: TEXT_B, contexts: contexts(PROJECT_B) }, { commitEffects: false });
  assert.equal(taskButtons(app).length, 0, 'old pending candidates are not shown under the new source');
  const staleWrite = oldAdd.props.onClick();
  for (const post of app.posts) post.resolve({ status: 'saved', task: { id: post.body.id } });
  await staleWrite;
  assert.equal(app.posts.length, 0);
  app.flushEffects();
});

test('replacement owns completion; old success/error cannot replace a newer result', async () => {
  for (const oldResult of [{ status: 'generated', text: '- 늦은 이전 후보' }, { status: 'error', error: 'late error' }]) {
    const app = mount();
    const staleStart = app.button('AI 액션 추출').props.onClick;
    const old = staleStart();
    const newer = staleStart(); // Two clicks before render create distinct request owners.
    assert.equal(app.requests[0].signal?.aborted, true);
    assert.equal(app.requests[1].signal?.aborted, false);
    app.requests[1].resolve({ status: 'generated', text: '- 최신 후보 실행하기' });
    await settle(newer); app.render();
    const newAdd = app.button('할 일 등록');
    app.requests[0].resolve(oldResult);
    await settle(old); app.render();
    assert.equal(app.nodes(node => node.props?.role === 'alert').length, 0);
    const sending = newAdd.props.onClick();
    assert.equal(app.posts[0].body.title, '최신 후보 실행하기');
    app.posts[0].resolve({ status: 'saved', task: { id: app.posts[0].body.id } });
    await sending;
  }
});

test('old completion and delayed source cleanup cannot release or abort a newer pending owner', async () => {
  for (const oldResult of [{ status: 'generated', text: '- 이전 후보' }, { status: 'error', error: 'old failure' }]) {
    const app = mount();
    const start = app.button('AI 액션 추출').props.onClick;
    const old = start();
    app.render({ text: TEXT_B }, { commitEffects: false });
    const newer = start();
    app.flushEffects();
    assert.equal(app.requests[1].signal?.aborted, false, 'old source cleanup must leave the new controller active');
    app.requests[0].resolve(oldResult);
    await settle(old); app.render();
    assert.equal(app.requests[1].settled, false);
    assert.equal(app.nodes(node => node.type === 'Skeleton').length, 1, 'old completion must not clear the new loading owner');
    app.requests[1].resolve({ status: 'generated', text: '- 바뀐 원문의 최신 후보' });
    await settle(newer); app.render();
    const sending = app.click('할 일 등록');
    assert.equal(app.posts[0].body.title, '바뀐 원문의 최신 후보');
    app.posts[0].resolve({ status: 'saved', task: { id: app.posts[0].body.id } });
    await sending;
  }
});

test('unmount aborts only AI and ignores late success or abort-shaped error without state writes', async () => {
  for (const reject of [false, true]) {
    const app = mount();
    const pending = app.click('AI 액션 추출');
    app.unmount();
    assert.equal(app.requests[0].signal?.aborted, true);
    if (reject) app.requests[0].reject(new DOMException('Aborted', 'AbortError'));
    else app.requests[0].resolve({ status: 'generated', text: '- 늦은 후보' });
    await settle(pending);
    assert.equal(app.writesAfterUnmount, 0);
    assert.equal(app.posts.length, 0);
  }
});

test('editing during task POST keeps its original command; unknown retry survives failed re-extraction', async () => {
  const app = mount();
  await extract(app);
  const sending = app.click('할 일 등록');
  const frozen = app.posts[0].body;
  app.render({ text: TEXT_B, contexts: contexts(PROJECT_B) });
  assert.equal(app.posts[0].signal.aborted, false, 'body edit must not abort a task write');
  app.posts[0].resolve({});
  await sending; app.render();
  assert.equal(app.button('같은 내용으로 확인').props.disabled, false);
  app.click('접기'); app.render();
  const newer = app.click('AI 액션 추출'); app.render();
  assert.ok(app.button('같은 내용으로 확인'), 'pending command stays reachable while AI runs');
  app.requests[1].resolve({ status: 'error', error: 'failed analysis' });
  await settle(newer); app.render();
  assert.ok(app.nodes(node => node.props?.role === 'alert').length);
  const retry = app.click('같은 내용으로 확인');
  assert.deepEqual(app.posts[1].body, frozen);
  assert.equal(app.posts[1].body.projectId, PROJECT_A);
  app.posts[1].resolve({ status: 'duplicate', task: { id: frozen.id } });
  await retry; app.render();
  assert.equal(app.button('등록됨').props.disabled, true);
});

test('new successful extraction retains an unknown command and its independent retry', async () => {
  const app = mount();
  await extract(app);
  const first = app.click('할 일 등록');
  app.posts[0].reject(new TypeError('unknown response'));
  await first; app.render({ text: TEXT_B });
  app.click('접기'); app.render();
  await extract(app, '바뀐 원문의 새 후보');
  assert.equal(taskButtons(app).length, 2);
  const retry = app.click('같은 내용으로 확인');
  assert.deepEqual(app.posts[1].body, app.posts[0].body);
  app.posts[1].resolve({ status: 'duplicate', task: { id: app.posts[1].body.id } });
  await retry; app.render();
  assert.equal(app.button('할 일 등록').props.disabled, false);
});

test('a late task receipt still updates its original row after another source finishes extraction', async () => {
  const app = mount();
  await extract(app);
  const sending = app.click('할 일 등록');
  const frozen = app.posts[0].body;
  app.render({ text: TEXT_B, contexts: contexts(PROJECT_B) });
  app.click('접기'); app.render();
  await extract(app, '다른 원문의 후보');
  assert.equal(app.posts[0].signal.aborted, false);
  assert.ok(app.button('등록 중…'));
  app.posts[0].resolve({});
  await sending; app.render();
  assert.equal(taskButtons(app).length, 2);
  const retry = app.click('같은 내용으로 확인');
  assert.deepEqual(app.posts[1].body, frozen);
  app.posts[1].resolve({ status: 'duplicate', task: { id: frozen.id } });
  await retry; app.render();
  assert.ok(app.button('등록됨'));
  assert.equal(app.button('할 일 등록').props.disabled, false);
});

test('clearing the body preserves and reopens unknown retry without issuing another AI request', async () => {
  const app = mount();
  await extract(app);
  const first = app.click('할 일 등록');
  app.posts[0].resolve({}); await first;
  app.render({ text: '' });
  app.click('접기'); app.render();
  await app.click('AI 액션 추출'); app.render();
  assert.equal(app.requests.length, 1);
  const retry = app.click('같은 내용으로 확인');
  assert.deepEqual(app.posts[1].body, app.posts[0].body);
  app.posts[1].resolve({ status: 'duplicate', task: { id: app.posts[1].body.id } });
  await retry;
});

test('unmount does not cancel an already sent task command or emit a late toast', async () => {
  const app = mount();
  await extract(app);
  const sending = app.click('할 일 등록');
  app.unmount();
  assert.equal(app.posts[0].signal.aborted, false);
  app.posts[0].resolve({ status: 'saved', task: { id: app.posts[0].body.id } });
  await sending;
  assert.equal(app.writesAfterUnmount, 0);
  assert.equal(app.toasts.length, 0);
});

test('leaving next actions hides new AI suggestions but keeps the same frozen command retry visible during capture', async () => {
  const app = mount({ active: false });
  assert.equal(app.nodes(() => true).length, 0);
  assert.equal(app.requests.length, 0);
  app.render({ active: true });
  await extract(app);
  const first = app.click('할 일 등록');
  const frozen = app.posts[0].body;
  app.posts[0].resolve({}); await first; app.render();
  app.click('접기'); app.render();
  app.render({ active: false, text: '', contexts: contexts(PROJECT_B) });
  assert.equal(app.posts[0].signal.aborted, false);
  assert.equal(app.nodes(node => node.type === 'Button' && node.props.children.includes('AI 액션 추출')).length, 0);
  const retry = app.click('같은 내용으로 확인');
  assert.deepEqual(app.posts[1].body, frozen);
  assert.equal(app.requests.length, 1, 'navigation/editing does not issue another AI request');
  app.posts[1].resolve({ status: 'duplicate', task: { id: frozen.id } });
  await retry; app.render();
  assert.equal(app.button('등록됨').props.disabled, true);
});
