import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./agents.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('agents.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AgentsChat');
const code = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));

// Exercise the real query effect, input handlers and response update with local
// deferred persona requests. This harness never invokes a real model or API.
function mount(initialThread = []) {
  const states = [], refs = [], requests = [], effects = [];
  let stateIndex = 0, refIndex = 0, initialized = false, tree;
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(child => child != null && child !== false) } }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = index === 4 ? [...initialThread] : typeof initial === 'function' ? initial() : initial;
      return [states[index], update => { states[index] = typeof update === 'function' ? update(states[index]) : update; }];
    },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useCallback: callback => callback,
    useEffect: effect => { if (!initialized) effects.push(effect); },
  };
  const dependencies = {
    React, DEFAULT_PERSONA_KEY: 'order', CHAT_PERSONAS: {
      order: { name: '오더', intro: [] }, council: { name: 'Council', intro: [] },
    },
    GURU_LENS_CHIPS: [], GURU_LENS_MAP: {}, GURU_CARDS: [], TASK_OUTCOME: {},
    window: { location: { search: '?prompt=council' } },
    requestPersonaChat: input => new Promise(resolve => requests.push({ input, resolve })),
  };
  for (const name of ['Button', 'IconButton', 'Avatar', 'Kbd', 'GuruGuidanceCard', 'TruthBadge', 'Iconed']) dependencies[name] = name;
  const Component = new Function(...Object.keys(dependencies), `${code}\nreturn AgentsChat;`)(...Object.values(dependencies));
  function render() { stateIndex = refIndex = 0; tree = Component({}); return tree; }
  function nodes(predicate, node = tree) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => nodes(predicate, child))];
  }
  function button(label) {
    const item = nodes(node => ['Button', 'IconButton'].includes(node.type) && (node.props.children.includes(label) || node.props.tooltip === label))[0];
    assert.ok(item, label); return item;
  }
  render(); initialized = true;
  for (const effect of effects) effect();
  return {
    requests, render, button, thread: () => states[4], input: () => states[0], busy: () => states[6],
    append: message => { states[4] = [...states[4], message]; },
    type: value => nodes(node => node.type === 'textarea')[0].props.onChange({ target: { value } }),
  };
}

test('initial Council synthesis shares the send lock and preserves typed follow-up until the response settles', async () => {
  const app = mount(); app.render();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].input.personaId, 'council');
  assert.equal(app.busy(), true);
  assert.equal(app.button('Send').props.disabled, true);
  assert.equal(app.button('New conversation').props.disabled, true);
  app.type('추가 확인 질문'); app.render();
  app.button('Send').props.onClick();
  app.button('New conversation').props.onClick();
  assert.equal(app.requests.length, 1);
  assert.equal(app.input(), '추가 확인 질문');
  app.requests[0].resolve({ state: 'done', text: '첫 Council 답변' });
  await settle(); app.render();
  assert.equal(app.busy(), false);
  assert.equal(app.button('Send').props.disabled, false);
  assert.match(app.thread()[0].text, /Council 종합 회의.*Convene/);
  assert.match(app.thread()[0].text, /첫 Council 답변/);
  app.button('Send').props.onClick();
  app.button('Send').props.onClick();
  assert.equal(app.requests.length, 2, 'same-render double send remains single flight');
  assert.equal(app.requests[1].input.message, '추가 확인 질문');
  app.requests[1].resolve({ state: 'done', text: '후속 Council 답변' });
  await settle();
  assert.equal(app.thread().length, 3);
  assert.match(app.thread()[0].text, /첫 Council 답변/);
  assert.equal(app.thread()[1].text, '추가 확인 질문');
  assert.equal(app.thread()[2].text, '후속 Council 답변');
});

test('late initial response replaces only its own placeholder and keeps prior and newer thread messages', async () => {
  const prior = { role: 'user', text: '기존 질문' };
  const later = { role: 'user', text: '나중에 붙은 메시지' };
  const app = mount([prior]);
  app.append(later);
  app.requests[0].resolve({ state: 'done', text: '초기 결과' });
  await settle();
  assert.equal(app.thread()[0], prior);
  assert.equal(app.thread()[2], later);
  assert.match(app.thread()[1].text, /초기 결과/);
  assert.equal(app.thread().some(message => message.pending), false);
});

for (const result of [{ state: 'preview', note: '연결 필요' }, { state: 'error', note: '잠시 후 다시 시도' }]) {
  test(`initial ${result.state} outcome releases the lock and leaves user input intact`, async () => {
    const app = mount(); app.render();
    app.type('실패 뒤 보낼 질문');
    app.requests[0].resolve(result);
    await settle(); app.render();
    assert.equal(app.busy(), false);
    assert.equal(app.input(), '실패 뒤 보낼 질문');
    assert.match(app.thread()[0].text, new RegExp(result.note));
    assert.equal(app.button('Send').props.disabled, false);
  });
}
