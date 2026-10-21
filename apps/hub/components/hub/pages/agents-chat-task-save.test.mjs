import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { afterEach } from 'node:test';
import ts from 'typescript';
import { freezeTaskCommand, saveTaskCommand, TASK_OUTCOME } from '../../../lib/memo-intake-tasks.js';

const source = readFileSync(new URL('./agents.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('agents.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declarations = ['extractTaskTitleFromText', 'AgentsChat'].map(name => {
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(ast).replace(/^export /, '');
});
const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: {
  jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022,
} }).outputText;
const apps = [];
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
afterEach(() => {
  for (const app of apps.splice(0)) {
    app.cleanup();
    assert.deepEqual(app.unexpected, [], 'HTTP assertions cannot be swallowed by a product catch');
  }
});

// Run the actual component handlers/JSX and the shared task receipt client.
// React scheduling, persona responses and HTTP are controlled; no browser or live calls.
function mount({ agent = 'order' } = {}) {
  const cells = [], posts = [], unexpected = [];
  let cursor = 0, effects = [], tree, unmounted = false, writesAfterUnmount = 0;
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props,
      children: children.flat(Infinity).filter(child => child !== false && child != null) } }),
    useState(initial) {
      const cell = cells[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, update => { if (unmounted) writesAfterUnmount++; cell.value = typeof update === 'function' ? update(cell.value) : update; }];
    },
    useRef(initial) { return cells[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!cells[index] || !sameDeps(cells[index].deps, deps)) cells[index] = { fn, deps };
      return cells[index].fn;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!cells[index] || !sameDeps(cells[index].deps, deps)) effects.push({ index, effect, deps });
    },
  };
  const fetchImpl = (url, options) => {
    if (url !== '/api/hub/tasks') { unexpected.push(url); return Promise.reject(Error('unexpected HTTP')); }
    return new Promise((resolve, reject) => {
      const entry = { body: JSON.parse(options.body), signal: options.signal,
        resolve(data, status = 200) { resolve(new Response(JSON.stringify(data), { status })); }, reject };
      posts.push(entry);
    });
  };
  const dependencies = {
    React, DEFAULT_PERSONA_KEY: agent,
    CHAT_PERSONAS: { [agent]: { name: 'Audit', role: 'Synthetic', intro: [] } },
    GURU_LENS_CHIPS: [], GURU_LENS_MAP: {}, GURU_CARDS: [],
    freezeTaskCommand, TASK_OUTCOME, saveTaskCommand: command => saveTaskCommand(command, fetchImpl),
    requestPersonaChat: async () => ({ state: 'done', text: '검토할 합성 할 일' }),
    requestGuruCoaching: async () => ({ state: 'done', text: '검토할 합성 할 일' }),
    collectGuruConversationHistory: () => [], shouldAutoRunGuruOnOpen: () => false,
    fetch: fetchImpl, window: { location: { search: '' }, dispatchEvent() {} },
    setTimeout: () => 0, navigator: { clipboard: { writeText: async () => {} } },
    Button: 'Button', IconButton: 'IconButton', Avatar: 'Avatar', Kbd: 'Kbd',
    GuruGuidanceCard: 'GuruGuidanceCard', TruthBadge: 'TruthBadge', Iconed: 'Iconed',
  };
  const Component = new Function(...Object.keys(dependencies), code + '\nreturn AgentsChat;')(...Object.values(dependencies));
  function render() {
    cursor = 0; effects = []; tree = Component({ onNavigate() {} });
    for (const { index, effect, deps } of effects) {
      cells[index]?.cleanup?.(); cells[index] = { deps, cleanup: effect() };
    }
    return tree;
  }
  function nodes(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => nodes(predicate, child))];
  }
  const content = node => typeof node === 'string' ? node : node?.type === 'TruthBadge'
    ? node.props.label || '' : node?.props?.children?.map(content).join('') || '';
  function button(label) {
    const node = nodes(item => ['Button', 'IconButton'].includes(item.type) && (content(item) === label || item.props.tooltip === label))[0];
    assert.ok(node, 'button ' + label); return node;
  }
  async function generate() {
    await button(agent === 'review' ? '사실/가드레일 검수' : '우선순위 지시서 조립').props.onClick();
    await nextTurn(); render();
  }
  const app = { posts, unexpected, render, button, nodes, text: () => content(tree), generate,
    cleanup() { if (unmounted) return; unmounted = true; for (const cell of cells) cell?.cleanup?.(); },
    writesAfterUnmount: () => writesAfterUnmount };
  apps.push(app); render(); return app;
}

for (const [name, receipt, httpStatus, expected] of [
  ['preview', { status: 'preview' }, 202, 'Preview · 저장되지 않음'],
  ['empty receipt', {}, 200, '결과 확인 필요'],
  ['wrong task ID', { status: 'saved', task: { id: 'other' } }, 200, '결과 확인 필요'],
  ['explicit persistence failure', { status: 'saved', persisted: false }, 200, '결과 확인 필요'],
]) test('chat never reports saved for ' + name, async () => {
  const app = mount(); await app.generate();
  const pending = app.button('태스크로 등록').props.onClick();
  assert.equal(app.posts.length, 1);
  app.posts[0].resolve(receipt, httpStatus); await pending; await nextTurn(); app.render();
  assert.doesNotMatch(app.text(), /태스크 등록됨/);
  assert.match(app.text(), new RegExp(expected));
});

test('chat locks duplicate clicks synchronously and keeps confirmed registration', async () => {
  const app = mount(); await app.generate();
  const click = app.button('태스크로 등록').props.onClick;
  const first = click(), second = click();
  assert.equal(app.posts.length, 1);
  const command = app.posts[0].body;
  assert.match(command.id, /^[0-9a-f-]{36}$/);
  app.posts[0].resolve({ status: 'saved', task: { id: command.id } });
  await Promise.all([first, second]); await nextTurn(); app.render();
  assert.equal(app.button('태스크 등록됨 ✓').props.disabled, true);
  await click(); assert.equal(app.posts.length, 1);
});

test('unknown outcome reuses identical full command and accepts duplicate receipt', async () => {
  const app = mount(); await app.generate();
  let pending = app.button('태스크로 등록').props.onClick();
  const command = app.posts[0].body;
  app.posts[0].reject(Error('lost acknowledgement')); await pending; await nextTurn(); app.render();
  pending = app.button('같은 내용으로 확인').props.onClick();
  assert.deepEqual(app.posts[1].body, command);
  app.posts[1].resolve({ status: 'duplicate', entity: { id: command.id } });
  await pending; await nextTurn(); app.render();
  assert.match(app.text(), /태스크 등록됨/);
});

test('a reused row index in a new conversation cannot inherit an old receipt or command', async () => {
  const app = mount(); await app.generate();
  const old = app.button('태스크로 등록').props.onClick();
  const firstCommand = app.posts[0].body;
  app.button('New conversation').props.onClick(); app.render(); await app.generate();
  app.posts[0].resolve({ status: 'saved', task: { id: firstCommand.id } });
  await old; await nextTurn(); app.render();
  assert.doesNotMatch(app.text(), /태스크 등록됨/);
  const fresh = app.button('태스크로 등록').props.onClick();
  assert.notEqual(app.posts[1].body.id, firstCommand.id);
  app.posts[1].resolve({ status: 'saved', task: { id: app.posts[1].body.id } });
  await fresh;
});

test('unmount does not apply a late task receipt to state', async () => {
  const app = mount(); await app.generate();
  const pending = app.button('태스크로 등록').props.onClick();
  app.cleanup();
  app.posts[0].resolve({ status: 'saved', task: { id: app.posts[0].body.id } });
  await pending; await nextTurn();
  assert.equal(app.writesAfterUnmount(), 0);
});

test('review-specific save preserves its original title and reuses its own command', async () => {
  const app = mount({ agent: 'review' }); await app.generate();
  const click = app.button('승인 결과 태스크 저장').props.onClick;
  const pending = click(), repeated = click();
  assert.equal(app.posts.length, 1);
  assert.equal(app.posts[0].body.title, '검수 승인 완료: 검토할 합성 할 일');
  app.posts[0].resolve({ status: 'duplicate', task: { id: app.posts[0].body.id } });
  await Promise.all([pending, repeated]); await nextTurn(); app.render();
  assert.equal(app.button('태스크 등록됨 ✓').props.disabled, true);
  assert.ok(app.button('태스크로 등록'), 'the different general task action remains separate');
});

